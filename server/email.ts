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

/**
 * Odešle notifikaci. Vrací true, když se e-mail opravdu odeslal.
 * Nikdy nehází — změna stavu se nesmí kvůli e-mailu vrátit zpět.
 */
export async function sendStatusMail(to: string[], data: StatusMailData): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || to.length === 0) return false;

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
        subject: statusMailSubject(data),
        html: statusMailHtml(data),
        text: statusMailText(data),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("Resend odmítl notifikaci:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Notifikaci se nepodařilo odeslat:", err instanceof Error ? err.message : err);
    return false;
  }
}
