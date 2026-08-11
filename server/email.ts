import type { OrderStatus } from "../shared/types";
import { STATUS_LABELS } from "../shared/types";

// E-mailové notifikace o změně stavu zakázky (Resend, free tier).
// Bez RESEND_API_KEY se tiše přeskočí — appka funguje dál i bez e-mailů.
// Odeslání nikdy neshodí požadavek: chyby se jen zalogují.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Anse <zakazky@anse.cz>";
const SEND_TIMEOUT_MS = 4000;

export interface StatusMailData {
  orderId: string;
  clientName: string;
  installationAddress: string;
  orderNumber: string;
  montageNumber: string;
  itemCount: number;
  from: OrderStatus;
  to: OrderStatus;
  /** Kdo změnu provedl. */
  userName: string;
  /** Kdy (Europe/Prague, „5. 8. 2026 14:20"). */
  changedAt: string;
  /** Odkaz do aplikace na detail zakázky. */
  orderUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Adresáti ze settings — čárkou/středníkem oddělený seznam. */
export function parseRecipients(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
}

export function statusMailSubject(d: StatusMailData): string {
  const number = d.orderNumber || d.montageNumber;
  return `Anse: ${d.clientName}${number ? ` (${number})` : ""} — ${STATUS_LABELS[d.to]}`;
}

/**
 * HTML šablona notifikace. Tabulkový layout a inline styly — e-mailoví
 * klienti (Outlook, Gmail) neumí flexbox ani <style> spolehlivě.
 */
export function statusMailHtml(d: StatusMailData): string {
  const rows: Array<[string, string]> = [
    ["Zákazník", d.clientName],
    ["Místo montáže", d.installationAddress || "—"],
    ["Číslo zakázky", d.orderNumber || "—"],
    ["Číslo montáže", d.montageNumber || "—"],
    ["Položek", `${d.itemCount}`],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
              <tr>
                <td style="padding:6px 0;color:#5b6663;font-size:14px;width:132px;vertical-align:top;">${escapeHtml(label)}</td>
                <td style="padding:6px 0;color:#0e1513;font-size:14px;font-weight:600;">${escapeHtml(value)}</td>
              </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="cs">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f2f6f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="padding:0 4px 14px;">
        <span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#0e1513;">ANSE</span>
        <span style="font-size:13px;color:#5b6663;margin-left:8px;">zakázky</span>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;border-radius:20px;padding:24px;">
        <p style="margin:0 0 4px;font-size:13px;color:#5b6663;">Změna stavu zakázky</p>
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0e1513;">${escapeHtml(d.clientName)}</h1>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
          <tr>
            <td style="background:#eef2f1;color:#5b6663;font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;">${escapeHtml(STATUS_LABELS[d.from])}</td>
            <td style="padding:0 8px;color:#5b6663;font-size:15px;">&rarr;</td>
            <td style="background:#0dc28b;color:#0e1513;font-size:13px;font-weight:700;padding:6px 12px;border-radius:999px;">${escapeHtml(STATUS_LABELS[d.to])}</td>
          </tr>
        </table>

        <p style="margin:0 0 18px;font-size:14px;color:#1b201f;">
          Změnil <strong>${escapeHtml(d.userName)}</strong> &middot; ${escapeHtml(d.changedAt)}
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4eae8;">
          ${rowsHtml}
        </table>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:22px;">
          <tr>
            <td style="background:#0dc28b;border-radius:14px;">
              <a href="${escapeHtml(d.orderUrl)}" style="display:inline-block;padding:13px 22px;color:#0e1513;font-size:15px;font-weight:700;text-decoration:none;">Otevřít zakázku</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 4px 0;color:#8a9490;font-size:12px;">
        Automatická zpráva z interní aplikace Anse. Adresu pro notifikace změníte v aplikaci: Správa účtů → Nastavení.
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Prostá textová varianta (fallback pro klienty bez HTML). */
export function statusMailText(d: StatusMailData): string {
  return [
    `Změna stavu zakázky: ${STATUS_LABELS[d.from]} → ${STATUS_LABELS[d.to]}`,
    `Zákazník: ${d.clientName}`,
    `Místo montáže: ${d.installationAddress || "—"}`,
    `Číslo zakázky: ${d.orderNumber || "—"} · Číslo montáže: ${d.montageNumber || "—"}`,
    `Položek: ${d.itemCount}`,
    `Změnil: ${d.userName} (${d.changedAt})`,
    "",
    d.orderUrl,
  ].join("\n");
}

/** Výsledek odeslání — důvod selhání se hlásí adminovi česky (test v Nastavení). */
export type SendResult =
  | { ok: true }
  | { ok: false; reason: "no_key" | "no_recipients" | "rejected" | "error"; detail?: string };

/** Vlastní odeslání přes Resend. Nikdy nehází — vrací důvod selhání. */
async function deliver(
  to: string[],
  mail: { subject: string; html: string; text: string },
): Promise<SendResult> {
  // Pořadí kontrol = pořadí, v jakém to admin může spravit: adresu si doplní
  // sám v Nastavení, klíč musí doplnit správce do env Netlify.
  const apiKey = process.env.RESEND_API_KEY;
  if (to.length === 0) return { ok: false, reason: "no_recipients" };
  if (!apiKey) return { ok: false, reason: "no_key" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Tělo chyby Resendu je pro admina to nejcennější („doména není ověřená",
      // „neplatný klíč"…) — vytáhneme z něj message, ale klíč nikdy nelogujeme.
      const body = await res.text().catch(() => "");
      console.error("Resend odmítl zprávu:", res.status, body);
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { message?: string; error?: string };
        if (parsed.message || parsed.error) detail = String(parsed.message ?? parsed.error);
      } catch {
        /* tělo není JSON — zůstane HTTP kód */
      }
      return { ok: false, reason: "rejected", detail };
    }
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Zprávu se nepodařilo odeslat:", detail);
    return { ok: false, reason: "error", detail };
  }
}

/**
 * Odešle notifikaci o změně stavu.
 * Nikdy nehází — změna stavu se nesmí kvůli e-mailu vrátit zpět.
 */
export async function sendStatusMail(to: string[], data: StatusMailData): Promise<SendResult> {
  return deliver(to, {
    subject: statusMailSubject(data),
    html: statusMailHtml(data),
    text: statusMailText(data),
  });
}

/** Zkušební zpráva z Nastavení — ověří klíč, odesílatele i adresáty bez čekání na ostrou zakázku. */
export async function sendTestMail(to: string[], userName: string): Promise<SendResult> {
  const html = `<!doctype html>
<html lang="cs">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f2f6f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding:0 4px 14px;">
      <span style="font-size:18px;font-weight:700;letter-spacing:2px;color:#0e1513;">ANSE</span>
      <span style="font-size:13px;color:#5b6663;margin-left:8px;">zakázky</span>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:20px;padding:24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#5b6663;">Zkušební zpráva</p>
      <h1 style="margin:0 0 14px;font-size:20px;color:#0e1513;">Notifikace fungují ✅</h1>
      <p style="margin:0 0 8px;font-size:14px;color:#1b201f;">
        Tuhle zprávu vyžádal <strong>${escapeHtml(userName)}</strong> z Nastavení aplikace.
        Na tuto adresu teď budou chodit upozornění při každé změně stavu zakázky.
      </p>
      <p style="margin:0;font-size:13px;color:#5b6663;">Adresy pro notifikace změníte v aplikaci: Správa účtů → Notifikace.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return deliver(to, {
    subject: "Anse: zkušební notifikace",
    html,
    text: `Zkušební zpráva z aplikace Anse. Vyžádal ${userName}. Notifikace o změnách stavu zakázek fungují.`,
  });
}
