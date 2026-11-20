import { randomInt } from "node:crypto";
import { ownCodeBody, userCreateBody, userUpdateBody } from "../../shared/api-contracts";
import {
  KOD_NEJDE_POUZIT,
  chybaTvaruVlastnihoKodu,
  isTrivialCode,
  jeSlabyVlastniKod,
  normalizujKod,
} from "../../shared/codes";
import {
  assertAttemptLimit,
  clientIp,
  invalidateUsersCache,
  recordAttempt,
  sameCode,
  sessionCookie,
  signSession,
} from "../auth";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Ctx, type Route } from "../router";

// Kódy: generuje výhradně server, náhodné, unikátní. Vystavené JEN na těchto
// routách kanceláře; nikdy se nelogují.
async function generateUniqueCode(): Promise<string> {
  const db = sql();
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const [existing] = await db`select 1 from users where code = ${code}`;
    if (!existing) return code;
  }
  throw new ApiError(500, "Nepodařilo se vygenerovat unikátní kód.");
}

// Vlastní kód (S05 #7) si uživatel zvolil sám a může ho mít i jinde — kancelář
// ho nevidí, vidí jen, že ho má. Zapomenutý kód vyřeší reset (nový 6místný).
const USER_COLS = `id, name,
  case when code ~ '^[0-9]{6}$' then code end as code,
  code !~ '^[0-9]{6}$' as vlastni_kod,
  role, phone, email, active, created_at`;

/**
 * Po odvolání přihlášení (vyšší session_version) se uživatel odhlásí na všech
 * zařízeních. Když si kancelář resetuje kód sama sobě, zařízení, ze kterého to
 * udělala, zůstane přihlášené — dostane nový token s novou verzí. Jinak by ji
 * appka vyhodila dřív, než si nový kód stihne opsat.
 */
async function keepOwnSession(
  req: Request,
  ctx: Ctx,
  userId: string,
  sessionVersion: number,
): Promise<Record<string, string>> {
  if (userId !== ctx.user.id) return {};
  return { "set-cookie": sessionCookie(req, await signSession(ctx.user, sessionVersion)) };
}

/** Chyba formuláře změny kódu u konkrétního pole (klient ji ukáže u něj). */
function chybaPole(pole: "current" | "code", message: string): ApiError {
  return new ApiError(400, message, { pole });
}

export const userRoutes: Route[] = [
  // Změna vlastního kódu (S05 #7) — kdokoli přihlášený, jen sám sobě.
  // Login je jen kód, bez jména: kód musí být unikátní, a tak by hláška
  // „obsazený" prozradila cizí kód. Proto stejná hláška pro slabý i obsazený
  // kód, nutný současný kód a společný limit pokusů s přihlášením. Kód se
  // nikdy nevrací ani neloguje.
  makeRoute("PUT", "/api/me/code", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, ownCodeBody);
    const current = normalizujKod(body.current);
    const code = normalizujKod(body.code);

    if (!current) throw chybaPole("current", "Zadej současný kód.");
    const tvar = chybaTvaruVlastnihoKodu(code);
    if (tvar) throw chybaPole("code", tvar);

    const ip = clientIp(req);
    await assertAttemptLimit(ip);

    const [me] = await db`select code from users where id = ${ctx.user.id} and active`;
    if (!me) throw new ApiError(401, "Přihlášení už není platné.");
    const stored = String(me.code).trim();

    if (!sameCode(current, stored)) {
      await recordAttempt(ip, false);
      throw chybaPole("current", "Současný kód nesedí.");
    }
    if (code === stored) throw chybaPole("code", "Nový kód je stejný jako současný.");
    if (jeSlabyVlastniKod(code)) {
      await recordAttempt(ip, false);
      throw chybaPole("code", KOD_NEJDE_POUZIT);
    }

    let row;
    try {
      // where code = stored: souběžná změna (druhé zařízení) nepřepíše tu první
      [row] = await db`
        update users set code = ${code}, session_version = session_version + 1
        where id = ${ctx.user.id} and code = ${stored}
        returning session_version
      `;
    } catch (err) {
      // Chyby z DB nesou v `detail` hodnotu kódu — nesmí dojít do logu.
      const pgCode = (err as { code?: string }).code;
      if (pgCode === "23505") {
        await recordAttempt(ip, false);
        throw chybaPole("code", KOD_NEJDE_POUZIT);
      }
      if (pgCode === "23514") {
        console.error("Změna kódu: users_code_check neprošel (hodnota se neloguje).");
        throw chybaPole("code", KOD_NEJDE_POUZIT);
      }
      throw new Error(`Změna kódu selhala v DB (${pgCode ?? "bez kódu"}).`);
    }
    if (!row) throw new ApiError(409, "Kód se mezitím změnil. Obnov stránku a zkus to znovu.");
    await recordAttempt(ip, true);
    invalidateUsersCache();

    // Ostatní zařízení se odhlásí (vyšší verze), tohle dostane nový cookie.
    const headers = await keepOwnSession(req, ctx, ctx.user.id, Number(row.session_version));
    return json({ ok: true }, { headers });
  }),

  // Kdo si může vzít kontakt nebo zakázku. Vidí ho i technik — bez něj měl
  // v „Ozve se" jedinou možnost „— nikdo —", protože /api/users je jen pro
  // kancelář. Posílá se jen jméno a role: žádné kódy, telefony ani e-maily.
  makeRoute("GET", "/api/users/vyber", async () => {
    const db = sql();
    const users = await db`
      select id, name, role from users where active order by name
    `;
    return json({ users });
  }),

  makeRoute(
    "GET",
    "/api/users",
    async () => {
      const db = sql();
      const rows = await db`
        select ${db.unsafe(USER_COLS)} from users order by active desc, name
      `;
      return json({ users: rows });
    },
    { officeOnly: true },
  ),

  makeRoute(
    "POST",
    "/api/users",
    async (req) => {
      const db = sql();
      const body = await parseBody(req, userCreateBody);
      const code = await generateUniqueCode();
      const [user] = await db`
        insert into users (name, code, role, phone, email)
        values (${body.name}, ${code}, ${body.role}, ${body.phone}, ${body.email})
        returning ${db.unsafe(USER_COLS)}
      `;
      invalidateUsersCache();
      return json({ user }, { status: 201 });
    },
    { officeOnly: true },
  ),

  makeRoute(
    "PATCH",
    "/api/users/:id",
    async (req, ctx, params) => {
      const db = sql();
      const body = await parseBody(req, userUpdateBody);

      if (body.active === false && params.id === ctx.user.id) {
        throw new ApiError(400, "Nemůžeš deaktivovat sám sebe.");
      }
      if (body.role === "technik" && params.id === ctx.user.id) {
        throw new ApiError(400, "Nemůžeš si sám odebrat roli kanceláře.");
      }

      const patch: Record<string, string | boolean> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.role !== undefined) patch.role = body.role;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.email !== undefined) patch.email = body.email;
      if (body.active !== undefined) patch.active = body.active;
      if (body.code !== undefined) {
        if (isTrivialCode(body.code)) {
          throw new ApiError(400, "Tento kód je příliš snadno uhodnutelný — zvol jiný.");
        }
        patch.code = body.code;
      }
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

      // Změna kódu i deaktivace odvolají všechna dosavadní přihlášení —
      // starý kód nebo vypnutý účet nesmí žít dál v otevřených telefonech.
      // U deaktivace to platí i pro pozdější znovuzapnutí.
      const revoke = body.code !== undefined || body.active === false;

      let user;
      try {
        [user] = await db`
          update users set ${db(patch)}
            ${revoke ? db`, session_version = session_version + 1` : db``}
          where id = ${params.id!}
          returning ${db.unsafe(USER_COLS)}, session_version
        `;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          throw new ApiError(409, "Tento kód už používá jiný uživatel — zvol jiný.");
        }
        throw err;
      }
      if (!user) throw new ApiError(404, "Uživatel nenalezen.");
      invalidateUsersCache();
      const { session_version, ...rest } = user;
      const headers = revoke
        ? await keepOwnSession(req, ctx, params.id!, Number(session_version))
        : {};
      return json({ user: rest }, { headers });
    },
    { officeOnly: true },
  ),

  // Hard reset: nový náhodný kód, starý okamžitě neplatí a dotyčný se
  // odhlásí ze všech zařízení (vyšší session_version).
  makeRoute(
    "POST",
    "/api/users/:id/code",
    async (req, ctx, params) => {
      const db = sql();
      const code = await generateUniqueCode();
      const [user] = await db`
        update users set code = ${code}, session_version = session_version + 1
        where id = ${params.id!}
        returning ${db.unsafe(USER_COLS)}, session_version
      `;
      if (!user) throw new ApiError(404, "Uživatel nenalezen.");
      invalidateUsersCache();
      const { session_version, ...rest } = user;
      const headers = await keepOwnSession(req, ctx, params.id!, Number(session_version));
      return json({ user: rest }, { headers });
    },
    { officeOnly: true },
  ),
];
