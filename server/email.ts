// E-mailový kanál notifikací (Resend, free tier).
// Bez RESEND_API_KEY se tiše přeskočí — appka funguje dál i bez e-mailů.
// Odeslání nikdy neshodí požadavek: chyby se jen zalogují.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Anse Aplikace <zakazky@anse.cz>";
const SEND_TIMEOUT_MS = 4000;

export interface NotifMailData {
  /** Nadpis zprávy — stejný text jako in-app notifikace. */
  title: string;
  /** Tělo zprávy (jedna věta). */
  body: string;
  /** Štítek události („Nové zaměření"). */
  eventLabel: string;
  /** Odkaz do aplikace (detail zakázky nebo kontaktu). */
  url: string;
  /** Popisek tlačítka. */
  cta: string;
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

export function notifMailSubject(d: NotifMailData): string {
  return `Anse: ${d.eventLabel} — ${d.title}`;
}

/**
 * HTML šablona notifikace. Tabulkový layout a inline styly — e-mailoví
 * klienti (Outlook, Gmail) neumí flexbox ani <style> spolehlivě.
 */
export function notifMailHtml(d: NotifMailData): string {
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
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5b6663;">${escapeHtml(d.eventLabel)}</p>
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0e1513;">${escapeHtml(d.title)}</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.5;color:#1b201f;">${escapeHtml(d.body)}</p>

        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background:#0dc28b;border-radius:14px;">
              <a href="${escapeHtml(d.url)}" style="display:inline-block;padding:13px 22px;color:#06231a;font-size:15px;font-weight:700;text-decoration:none;">${escapeHtml(d.cta)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 4px 0;color:#8a9490;font-size:12px;">
        Automatická zpráva z interní aplikace Anse. Které zprávy vám chodí e-mailem, si nastavíte v aplikaci (Notifikace → ⚙).
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Prostá textová varianta (fallback pro klienty bez HTML). */
export function notifMailText(d: NotifMailData): string {
  return [d.eventLabel, d.title, "", d.body, "", d.url].join("\n");
}

/** Výsledek odeslání — důvod selhání se hlásí kanceláři česky (test v Nastavení). */
export type SendResult =
  | { ok: true }
  | { ok: false; reason: "no_key" | "no_recipients" | "rejected" | "error"; detail?: string };

/** Vlastní odeslání přes Resend. Nikdy nehází — vrací důvod selhání. */
async function deliver(
  to: string[],
  mail: { subject: string; html: string; text: string },
): Promise<SendResult> {
  // Pořadí kontrol = pořadí, v jakém to jde spravit: adresu si doplní kancelář
  // sama v Nastavení, klíč musí doplnit správce do env Netlify.
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
      // Tělo chyby Resendu je to nejcennější („doména není ověřená",
      // „neplatný klíč"…) — vytáhneme z něj message, klíč nikdy nelogujeme.
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
 * Odešle notifikaci e-mailem.
 * Nikdy nehází — akce v aplikaci se kvůli e-mailu nesmí vrátit zpět.
 */
export async function sendNotifMail(to: string[], data: NotifMailData): Promise<SendResult> {
  return deliver(to, {
    subject: notifMailSubject(data),
    html: notifMailHtml(data),
    text: notifMailText(data),
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
        E-mailem teď budou chodit ty události, které máte v Notifikacích zapnuté.
      </p>
      <p style="margin:0;font-size:13px;color:#5b6663;">Nastavení najdete v aplikaci: Nastavení → Notifikace.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return deliver(to, {
    subject: "Anse: zkušební notifikace",
    html,
    text: `Zkušební zpráva z aplikace Anse. Vyžádal ${userName}. Notifikace fungují.`,
  });
}
