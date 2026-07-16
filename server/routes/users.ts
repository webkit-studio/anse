import { randomInt } from "node:crypto";
import { userCreateBody, userUpdateBody } from "../../shared/api-contracts";
import { isTrivialCode } from "../../shared/codes";
import { invalidateUsersCache } from "../auth";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

// Kódy: generuje výhradně server, náhodné, unikátní. Vystavené JEN na těchto
// admin routách; nikdy se nelogují.
async function generateUniqueCode(): Promise<string> {
  const db = sql();
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const [existing] = await db`select 1 from users where code = ${code}`;
    if (!existing) return code;
  }
  throw new ApiError(500, "Nepodařilo se vygenerovat unikátní kód.");
}

const USER_COLS = "id, name, code, role, active, created_at";

export const userRoutes: Route[] = [
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
    { adminOnly: true },
  ),

  makeRoute(
    "POST",
    "/api/users",
    async (req) => {
      const db = sql();
      const body = await parseBody(req, userCreateBody);
      const code = await generateUniqueCode();
      const [user] = await db`
        insert into users (name, code, role) values (${body.name}, ${code}, ${body.role})
        returning ${db.unsafe(USER_COLS)}
      `;
      invalidateUsersCache();
      return json({ user }, { status: 201 });
    },
    { adminOnly: true },
  ),

  makeRoute(
    "PATCH",
    "/api/users/:id",
    async (req, ctx, params) => {
      const db = sql();
      const body = await parseBody(req, userUpdateBody);

      if (body.active === false && params.id === ctx.user.id) {
        throw new ApiError(400, "Nemůžete deaktivovat sami sebe.");
      }
      if (body.role === "technik" && params.id === ctx.user.id) {
        throw new ApiError(400, "Nemůžete si odebrat roli administrátora.");
      }

      const patch: Record<string, string | boolean> = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.role !== undefined) patch.role = body.role;
      if (body.active !== undefined) patch.active = body.active;
      if (body.code !== undefined) {
        if (isTrivialCode(body.code)) {
          throw new ApiError(400, "Tento kód je příliš snadno uhodnutelný — zvolte jiný.");
        }
        patch.code = body.code;
      }
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

      let user;
      try {
        [user] = await db`
          update users set ${db(patch)} where id = ${params.id!}
          returning ${db.unsafe(USER_COLS)}
        `;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") {
          throw new ApiError(409, "Tento kód už používá jiný uživatel — zvolte jiný.");
        }
        throw err;
      }
      if (!user) throw new ApiError(404, "Uživatel nenalezen.");
      invalidateUsersCache();
      return json({ user });
    },
    { adminOnly: true },
  ),

  makeRoute(
    "POST",
    "/api/users/:id/code",
    async (_req, _ctx, params) => {
      const db = sql();
      const code = await generateUniqueCode();
      const [user] = await db`
        update users set code = ${code} where id = ${params.id!}
        returning ${db.unsafe(USER_COLS)}
      `;
      if (!user) throw new ApiError(404, "Uživatel nenalezen.");
      return json({ user });
    },
    { adminOnly: true },
  ),
];
