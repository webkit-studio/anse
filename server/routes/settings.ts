import { settingsBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { parseRecipients, sendTestMail } from "../email";
import { json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

export const settingsRoutes: Route[] = [
  makeRoute(
    "GET",
    "/api/settings",
    async () => {
      const db = sql();
      const rows = await db`
        select key, value from settings where key in ('admin_group_email', 'admin_group_events')
      `;
      const mapa = new Map(rows.map((r) => [r.key as string, r.value]));
      return json({
        admin_group_email: (mapa.get("admin_group_email") as string | undefined) ?? "",
        admin_group_events: (mapa.get("admin_group_events") as Record<string, boolean>) ?? {},
      });
    },
    { officeOnly: true },
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
      if (body.admin_group_events !== undefined) {
        await db`
          insert into settings (key, value)
          values ('admin_group_events', ${db.json(body.admin_group_events)})
          on conflict (key) do update set value = excluded.value
        `;
      }
      return json({
        admin_group_email: body.admin_group_email,
        admin_group_events: body.admin_group_events ?? {},
      });
    },
    { officeOnly: true },
  ),

  // Zkušební notifikace — kancelář si ověří klíč, odesílatele i adresáty bez
  // toho, aby musela přehazovat fázi ostré zakázky. Vrací vždy 200 se srozumitelným
  // výsledkem, aby UI mohlo ukázat konkrétní důvod (chybí klíč, doména není
  // ověřená…) místo obecné chyby.
  makeRoute(
    "POST",
    "/api/settings/test-email",
    async (_req, ctx) => {
      const db = sql();
      const [row] = await db`select value from settings where key = 'admin_group_email'`;
      const recipients = parseRecipients(String(row?.value ?? ""));
      const result = await sendTestMail(recipients, ctx.user.name);

      if (result.ok) {
        return json({
          ok: true,
          message: `Zkušební e-mail odeslán na: ${recipients.join(", ")}. Když nedorazí do pár minut, mrkněte do spamu.`,
        });
      }

      const MESSAGES: Record<typeof result.reason, string> = {
        no_recipients: "Nejdřív vyplň a ulož adresu pro notifikace.",
        no_key: "Odesílání zatím není nakonfigurované (chybí klíč k e-mailové službě) — doplní se v nastavení Netlify.",
        rejected: `E-mailová služba zprávu odmítla: ${result.detail ?? "neznámý důvod"}`,
        error: `E-mail se nepodařilo odeslat: ${result.detail ?? "neznámá chyba"}`,
      };
      return json({ ok: false, message: MESSAGES[result.reason] });
    },
    { officeOnly: true },
  ),
];
