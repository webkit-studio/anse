import { NOTIF_EVENTS, type NotifEvent } from "../shared/types";
import { sql } from "./db";
import { parseRecipients, sendNotifMail } from "./email";

// Rozesílka notifikací. Dva kanály:
//  - in-app (tabulka notifications) — vždy, nedá se vypnout
//  - e-mail — jen když to má uživatel zapnuté (notif_prefs, default z NOTIF_EVENTS)
// Nikdy nehází: akce v aplikaci (přechod fáze, podpis) se kvůli notifikaci
// nesmí vrátit zpět. Chyby se logují.

const META = new Map(NOTIF_EVENTS.map((e) => [e.event, e]));

/** Doplní {placeholdery} v šabloně zprávy. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+|[^\s{}]+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === undefined ? whole : String(v);
  });
}

export interface NotifyInput {
  event: NotifEvent;
  /** Předmět zprávy — „Novák Jan · Ostrava". */
  subject: string;
  /** Hodnoty pro šablonu ({zakázka}, {datum}, {počet}, {důvod}, {jméno}). */
  vars: Record<string, string | number>;
  orderId?: string | null;
  contactId?: string | null;
  /** Kdo akci vyvolal — sám sobě notifikaci nedostane. */
  actorId?: string;
  /** Konkrétní adresát (technik zakázky); jinak se dohledá podle role. */
  userIds?: string[];
  /** Odkaz do aplikace. */
  url: string;
  cta?: string;
}

async function recipients(input: NotifyInput): Promise<{ id: string; email: string }[]> {
  const db = sql();
  const meta = META.get(input.event);
  if (!meta) return [];

  const rows = input.userIds?.length
    ? await db`select id, email from users where id = any(${input.userIds}) and active`
    : await db`select id, email from users where role = ${meta.to} and active`;

  return rows
    .filter((r) => r.id !== input.actorId)
    .map((r) => ({ id: r.id as string, email: String(r.email ?? "") }));
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const db = sql();
    const meta = META.get(input.event);
    if (!meta) return;

    const targets = await recipients(input);
    if (targets.length === 0) return;

    const body = fillTemplate(meta.template, { ...input.vars, "zakázka": input.subject });

    // in-app kanál — vždy
    await db`
      insert into notifications ${db(
        targets.map((t) => ({
          user_id: t.id,
          event: input.event,
          title: input.subject,
          body,
          order_id: input.orderId ?? null,
          contact_id: input.contactId ?? null,
        })),
      )}
    `;

    // e-mail — podle notif_prefs (chybějící záznam = default události)
    const prefs = await db`
      select user_id, email from notif_prefs
      where event = ${input.event} and user_id = any(${targets.map((t) => t.id)})
    `;
    const prefByUser = new Map(prefs.map((p) => [p.user_id as string, p.email as boolean]));

    let addresses = targets
      .filter((t) => (prefByUser.get(t.id) ?? meta.emailDefault) && t.email.includes("@"))
      .map((t) => t.email);

    // Kancelář bez osobních adres spadne na společnou adresu z nastavení.
    if (addresses.length === 0 && meta.to === "kancelar") {
      const [s] = await db`select value from settings where key = 'admin_group_email'`;
      addresses = parseRecipients(String(s?.value ?? ""));
    }
    if (addresses.length === 0) return;

    await sendNotifMail(addresses, {
      title: input.subject,
      body,
      eventLabel: meta.label,
      url: input.url,
      cta: input.orderId ? "Otevřít zakázku" : "Otevřít kontakt",
    });
  } catch (err) {
    console.error("Notifikace selhala:", err instanceof Error ? err.message : err);
  }
}

/** Základ odkazů do aplikace (APP_URL, jinak origin požadavku). */
export function appOrigin(req: Request): string {
  return process.env.APP_URL ?? new URL(req.url).origin;
}
