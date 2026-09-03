// E-mailový kanál notifikací (Resend, free tier).
// Bez RESEND_API_KEY se tiše přeskočí — appka funguje dál i bez e-mailů.
// Odeslání nikdy neshodí požadavek: chyby se jen zalogují.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Výchozí odesílatel musí být na doméně OVĚŘENÉ v Resendu, jinak služba
// zprávu odmítne. anse.cz ověřená (zatím) není, anse.webkit.studio ano.
// Až se anse.cz ověří, stačí přepsat RESEND_FROM v Netlify — kód se nemění.
const DEFAULT_FROM = "Anse Aplikace <zpravy@anse.webkit.studio>";
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
  // Bez prefixu „Anse:" — odesílatel se jmenuje Anse Aplikace, takže v seznamu
  // pošty to stojí hned vedle sebe a v předmětu by se to jen opakovalo.
  return `${d.eventLabel} — ${d.title}`;
}

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * HTML šablona notifikace ve vzhledu aplikace: jedna kartička, štítek události,
 * nadpis „kdo · kde", věta co se stalo, jedno tlačítko.
 *
 * Proč zrovna takhle (omezení e-mailových klientů):
 *  - tabulkový layout a inline styly — Gmail ani Outlook neumí flexbox/grid
 *    a <style> zahazují; `max-width:560px` + `width:100%` = na telefonu přes
 *    celou šířku, na desktopu čitelný sloupec
 *  - padding je na <a> (display:block) i jako `mso-padding-alt` na <td>, aby
 *    byla klikací celá plocha tlačítka všude včetně Outlooku (53 px > --tap)
 *  - skrytý předtext na začátku = to, co se ukáže v náhledu schránky
 *  - žádné externí obrázky ani webfonty (logo je text) — nic se nedonačítá
 */
export function notifMailHtml(d: NotifMailData): string {
  const label = escapeHtml(d.eventLabel);
  const title = escapeHtml(d.title);
  const body = escapeHtml(d.body);
  const url = escapeHtml(d.url);
  const cta = escapeHtml(d.cta);

  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Anse</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f2f6f5;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f2f6f5;mso-hide:all;">${body}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f6f5" style="width:100%;border-collapse:collapse;background-color:#f2f6f5;">
  <tr>
    <td align="center" style="padding:24px 12px 32px;">

      <!--[if mso]>
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td>
      <![endif]-->

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;margin:0 auto;">

        <tr>
          <td style="padding:0 6px 14px;font-family:${FONT};">
            <span style="font-size:17px;line-height:22px;font-weight:700;letter-spacing:2.6px;color:#0e1513;">ANSE</span><span style="font-size:12px;line-height:22px;letter-spacing:0.2px;color:#5b6663;">&nbsp;&nbsp;zakázky</span>
          </td>
        </tr>

        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #eef3f1;border-radius:20px;padding:28px 24px 30px;font-family:${FONT};">

            <p style="margin:0 0 10px;font-size:12px;line-height:16px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:#077a58;">${label}</p>

            <h1 style="margin:0 0 14px;font-size:24px;line-height:31px;mso-line-height-rule:exactly;font-weight:700;color:#0e1513;word-break:break-word;">${title}</h1>

            <p style="margin:0 0 26px;font-size:16px;line-height:25px;mso-line-height-rule:exactly;color:#1b201f;">${body}</p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
              <tr>
                <td bgcolor="#0dc28b" align="center" style="background-color:#0dc28b;border-radius:14px;text-align:center;mso-padding-alt:16px 30px;">
                  <a href="${url}" target="_blank" rel="noopener" style="display:block;padding:16px 30px;font-family:${FONT};font-size:17px;line-height:21px;mso-line-height-rule:exactly;font-weight:700;color:#06231a;text-decoration:none;">${cta}</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <tr>
          <td style="padding:18px 8px 0;font-family:${FONT};font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#5b6663;">
            Tohle je automatická zpráva z aplikace Anse &mdash; neodpovídej na ni.<br>
            Které události ti chodí e-mailem, si nastavíš v aplikaci: Nastavení&nbsp;&rarr;&nbsp;Notifikace.
          </td>
        </tr>

      </table>

      <!--[if mso]>
      </td></tr></table>
      <![endif]-->

    </td>
  </tr>
</table>

</body>
</html>`;
}

/** Prostá textová varianta (fallback pro klienty bez HTML). */
export function notifMailText(d: NotifMailData): string {
  return [
    "ANSE · zakázky",
    "",
    d.eventLabel,
    d.title,
    "",
    d.body,
    "",
    `${d.cta}:`,
    d.url,
    "",
    "--",
    "Tohle je automatická zpráva z aplikace Anse — neodpovídej na ni.",
    "Které události ti chodí e-mailem, si nastavíš v aplikaci: Nastavení → Notifikace.",
  ].join("\n");
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
    subject: "Zkušební notifikace",
    html,
    text: `Zkušební zpráva z aplikace Anse. Vyžádal ${userName}. Notifikace fungují.`,
  });
}
