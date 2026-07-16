import { settingsBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

export const settingsRoutes: Route[] = [
  makeRoute(
    "GET",
    "/api/settings",
    async () => {
      const db = sql();
      const [row] = await db`select value from settings where key = 'admin_group_email'`;
      return json({ admin_group_email: (row?.value as string | undefined) ?? "" });
    },
    { adminOnly: true },
  ),

  makeRoute(
    "PUT",
    "/api/settings",
    async (req) => {
      const db = sql();
      const body = await parseBody(req, settingsBody);
      await db`
        insert into settings (key, value)
        values ('admin_group_email', ${db.json(body.admin_group_email)})
        on conflict (key) do update set value = excluded.value
      `;
      return json({ admin_group_email: body.admin_group_email });
    },
    { adminOnly: true },
  ),
];
