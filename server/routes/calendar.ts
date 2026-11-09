import { randomBytes } from "node:crypto";
import {
  KALENDAR_TOKEN,
  TYPY_UDALOSTI,
  nazevSouboru,
  sestavKalendar,
  udalostZakazky,
  udalostiZakazky,
  type KalendarZakazka,
  type TypUdalosti,
} from "../../shared/kalendar";
import { clientIp } from "../auth";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { appOrigin } from "../notify";
import { limitPokusu } from "../rate-limit";
import { makeRoute, type Route } from "../router";

// Zaměření a montáže v kalendáři (S04, issue #5).
//
// Odebíraný kalendář (ICS feed) jde bez přihlášení — kalendář Googlu ani
// iPhonu cookie nepošle. Přístup drží jen náhodný token v adrese, proto:
// - token se NIKDY neloguje (ani v chybách, viz bezTokenu),
// - neplatný token = stejná 404 jako neexistující adresa, bez rozlišení,
// - neúspěchy per IP hlídá levný limit v paměti (token má 256 bitů).
// Ve feedu nejsou ceny: sloupce níž je ani nevybírají.

const NAZEV_KALENDARE = "Anse – zakázky";
/** Hotové zakázky zůstávají v kalendáři ještě měsíc po dokončení. */
const HOTOVE_DNI = 30;
const MAX_NEUSPECHU = 30;
const OKNO_MS = 10 * 60_000;

const limit = limitPokusu(MAX_NEUSPECHU, OKNO_MS);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sloupce zakázky pro kalendář — záměrně bez cen (price_customer ani price_montage). */
function kalendarCols(db: Pick<ReturnType<typeof sql>, "unsafe">) {
  return db.unsafe(`
    o.id, o.kind, o.assignee_ids,
    coalesce(nullif(btrim(o.customer_name), ''), c.name) as jmeno,
    coalesce(nullif(btrim(o.customer_phone), ''), c.phone) as telefon,
    o.addr_montaz as adresa,
    to_char(o.measured_at, 'YYYY-MM-DD') as measured_at,
    to_char(o.measured_time, 'HH24:MI') as measured_time,
    to_char(o.term_montaz, 'YYYY-MM-DD') as term_montaz,
    array(
      select u.name from unnest(o.assignee_ids) with ordinality a(id, n)
      join users u on u.id = a.id order by a.n
    ) as prideleni,
    to_char(o.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as zmeneno
  `);
}

function naZakazku(r: Record<string, unknown>): KalendarZakazka {
  return {
    id: String(r.id),
    kind: r.kind === "oprava" ? "oprava" : "nova",
    jmeno: String(r.jmeno ?? ""),
    telefon: String(r.telefon ?? ""),
    adresa: String(r.adresa ?? ""),
    measured_at: (r.measured_at as string | null) ?? null,
    measured_time: (r.measured_time as string | null) ?? null,
    term_montaz: (r.term_montaz as string | null) ?? null,
    prideleni: (r.prideleni as string[] | null) ?? [],
    zmeneno: (r.zmeneno as string | null) ?? null,
  };
}

function icsOdpoved(ics: string, method: string, soubor?: string): Response {
  const headers: Record<string, string> = {
    "content-type": "text/calendar; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
  };
  // inline: iPhone rovnou nabídne „Přidat do kalendáře", ostatní soubor stáhnou
  if (soubor) headers["content-disposition"] = `inline; filename="${soubor}"`;
  return new Response(method === "HEAD" ? null : ics, { headers });
}

/** Stejná odpověď jako neexistující routa — neplatný token nesmí být poznat. */
function nenalezeno(): Response {
  return json({ error: "Nenalezeno." }, { status: 404, headers: { "cache-control": "no-store" } });
}

/** Text chyby bez tokenu — do logu se token nesmí dostat ani omylem. */
function bezTokenu(err: unknown, token: string): string {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return token ? msg.split(token).join("[token]") : msg;
}

function odkazNaFeed(req: Request, token: string): string {
  return `${appOrigin(req)}/api/calendar/${token}.ics`;
}

async function feed(req: Request, params: Record<string, string>): Promise<Response> {
  const ip = clientIp(req);
  if (limit.blokovano(ip)) {
    return json(
      { error: "Příliš mnoho pokusů. Zkus to za chvíli." },
      { status: 429, headers: { "cache-control": "no-store", "retry-after": String(OKNO_MS / 1000) } },
    );
  }
  const soubor = params.soubor ?? "";
  const token = soubor.endsWith(".ics") ? soubor.slice(0, -4) : "";
  // Nesmyslný tvar se do DB vůbec neposílá.
  if (!KALENDAR_TOKEN.test(token)) {
    limit.neuspech(ip);
    return nenalezeno();
  }

  try {
    const db = sql();
    const [user] = await db`select id from users where calendar_token = ${token} and active`;
    if (!user) {
      limit.neuspech(ip);
      return nenalezeno();
    }
    // Jen zakázky, kde je uživatel přidělený (i kancelář — sdílený kalendář
    // kanceláře je mimo rozsah). Bez zrušených; hotové jen měsíc zpět.
    const rows = await db`
      select ${kalendarCols(db)}
      from orders o
      join contacts c on c.id = o.contact_id
      where ${user.id} = any(o.assignee_ids)
        and o.phase <> 'zruseno'
        and (o.measured_at is not null or o.term_montaz is not null)
        and (
          o.phase <> 'hotovo'
          or coalesce(
            (select max(e.created_at) from order_events e
             where e.order_id = o.id and e.to_phase = 'hotovo'),
            o.updated_at
          ) > now() - make_interval(days => ${HOTOVE_DNI})
        )
      order by coalesce(o.term_montaz, o.measured_at), o.id
    `;
    const origin = appOrigin(req);
    const udalosti = rows.flatMap((r) => udalostiZakazky(naZakazku(r), origin));
    return icsOdpoved(sestavKalendar(udalosti, { ted: new Date(), nazev: NAZEV_KALENDARE }), req.method);
  } catch (err) {
    console.error("Kalendář se nepodařilo sestavit:", bezTokenu(err, token));
    return json(
      { error: "Neočekávaná chyba serveru. Zkus to prosím znovu." },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}

async function vydejToken(userId: string): Promise<string> {
  const db = sql();
  for (let i = 0; i < 3; i++) {
    const token = randomBytes(32).toString("base64url");
    try {
      const [row] = await db`
        update users set calendar_token = ${token} where id = ${userId} and active returning id
      `;
      if (!row) throw new ApiError(404, "Účet nenalezen.");
      return token;
    } catch (err) {
      // Kolize 256bitového tokenu je jen teorie, ale unikátní index ji ohlídá.
      if ((err as { code?: string }).code === "23505") continue;
      throw err;
    }
  }
  throw new ApiError(500, "Odkaz se nepodařilo vytvořit. Zkus to znovu.");
}

export const calendarRoutes: Route[] = [
  makeRoute("GET", "/api/calendar/:soubor", (req, _ctx, params) => feed(req, params), { isPublic: true }),
  // Některé kalendáře se před stažením ptají hlavičkou.
  makeRoute("HEAD", "/api/calendar/:soubor", (req, _ctx, params) => feed(req, params), { isPublic: true }),

  // Můj odkaz na kalendář (každý uživatel jen svůj). Odpověď nese token,
  // proto no-store.
  makeRoute("GET", "/api/me/calendar", async (req, ctx) => {
    const db = sql();
    const [row] = await db`select calendar_token from users where id = ${ctx.user.id}`;
    const token = (row?.calendar_token as string | null) ?? null;
    return json({ url: token ? odkazNaFeed(req, token) : null }, { headers: { "cache-control": "no-store" } });
  }),

  // Vytvořit / přegenerovat: nový token přepíše starý → starý odkaz přestane fungovat.
  makeRoute("POST", "/api/me/calendar", async (req, ctx) => {
    const token = await vydejToken(ctx.user.id);
    return json({ url: odkazNaFeed(req, token) }, { headers: { "cache-control": "no-store" } });
  }),

  // Jedna událost ke stažení z detailu zakázky („Přidat do kalendáře").
  // Okamžité — Google odebírané kalendáře obnovuje se zpožděním hodin.
  makeRoute("GET", "/api/orders/:id/kalendar/:soubor", async (req, ctx, params) => {
    const soubor = params.soubor ?? "";
    const typ = soubor.replace(/\.ics$/, "") as TypUdalosti;
    if (!soubor.endsWith(".ics") || !TYPY_UDALOSTI.includes(typ)) throw new ApiError(404, "Nenalezeno.");
    if (!UUID.test(params.id ?? "")) throw new ApiError(404, "Zakázka nenalezena.");

    const db = sql();
    const [r] = await db`
      select ${kalendarCols(db)}
      from orders o
      join contacts c on c.id = o.contact_id
      where o.id = ${params.id!}
    `;
    // Technik vidí jen svoje zakázky — cizí ani neexistují.
    if (!r || (ctx.user.role === "technik" && !(r.assignee_ids as string[]).includes(ctx.user.id))) {
      throw new ApiError(404, "Zakázka nenalezena.");
    }
    const zakazka = naZakazku(r);
    const udalost = udalostZakazky(zakazka, typ, appOrigin(req));
    if (!udalost) throw new ApiError(404, "Termín zatím není zadaný.");
    return icsOdpoved(sestavKalendar([udalost], { ted: new Date() }), req.method, nazevSouboru(typ, zakazka.jmeno));
  }),
];
