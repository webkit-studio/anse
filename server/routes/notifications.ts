import { notifPrefBody, notifReadBody } from "../../shared/api-contracts";
import { NOTIF_EVENTS, type NotifEvent } from "../../shared/types";
import { sql } from "../db";
import { json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

// In-app kanál notifikací se nedá vypnout; přepínat jde jen e-mail
// (per uživatel, per událost). Chybějící záznam = default z NOTIF_EVENTS.

const DEFAULTS = new Map(NOTIF_EVENTS.map((e) => [e.event, e.emailDefault]));

export const notificationRoutes: Route[] = [
  makeRoute("GET", "/api/notifications", async (_req, ctx) => {
    const db = sql();
    const rows = await db`
      select id, event, title, body, order_id, contact_id, read, created_at
      from notifications where user_id = ${ctx.user.id}
      order by created_at desc limit 50
    `;
    const [unread] = await db`
      select count(*)::int as n from notifications where user_id = ${ctx.user.id} and not read
    `;
    return json({ notifications: rows, unread: unread?.n ?? 0 });
  }),

  makeRoute("POST", "/api/notifications/read", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, notifReadBody);
    if (body.ids?.length) {
      await db`
        update notifications set read = true
        where user_id = ${ctx.user.id} and id = any(${body.ids})
      `;
    } else {
      await db`update notifications set read = true where user_id = ${ctx.user.id} and not read`;
    }
    return json({ ok: true });
  }),

  // Nastavení e-mailového kanálu — každý si spravuje svoje.
  makeRoute("GET", "/api/notif-prefs", async (_req, ctx) => {
    const db = sql();
    const rows = await db`
      select event, email from notif_prefs where user_id = ${ctx.user.id}
    `;
    const saved = new Map(rows.map((r) => [r.event as NotifEvent, r.email as boolean]));
    return json({
      prefs: NOTIF_EVENTS.filter((e) => e.to === ctx.user.role).map((e) => ({
        event: e.event,
        email: saved.get(e.event) ?? DEFAULTS.get(e.event) ?? false,
      })),
    });
  }),

  makeRoute("PUT", "/api/notif-prefs", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, notifPrefBody);
    await db`
      insert into notif_prefs (user_id, event, email)
      values (${ctx.user.id}, ${body.event}, ${body.email})
      on conflict (user_id, event) do update set email = excluded.email
    `;
    return json({ ok: true });
  }),
];
