# Zprovoznění e-mailových notifikací (Resend)

Runbook pro Lukáše. Aplikace posílá e-mail při každé změně stavu zakázky
(`server/email.ts`, volá se z `server/routes/orders.ts`). Bez konfigurace appka
funguje dál — e-maily se jen tiše přeskakují.

Stav k 11. 8. 2026: Resend účet založen, doména `anse.cz` přidaná v regionu
**eu-west-1 (Irsko)**, sending zapnutý, receiving vypnutý. Zbývá DNS + klíč.

## 1. DNS záznamy (dělá správce DNS domény)

DNS zóna `anse.cz` je u **Světa hostingu** (ns1/ns2.svethostingu.cz), pošta běží
na `mail.svethostingu.cz`. Hotový text k odeslání správci je v
[`dns-zaznamy-pro-spravce.txt`](./dns-zaznamy-pro-spravce.txt) — obsahuje tři
záznamy vč. plné hodnoty DKIM klíče a kontrolní příkazy.

Proč se stávající pošta nerozbije: všechny tři záznamy jsou na subdoménách
(`send.anse.cz`, `resend._domainkey.anse.cz`), na kořeni domény se nemění nic.
MX ovlivňuje jen to jméno, u kterého je zapsaný.

**Wildcard v zóně.** `*.anse.cz` je CNAME na apex, takže dnes „odpovídá" i
`send.anse.cz` a `resend._domainkey.anse.cz` — vypadá to, jako by tam záznamy už
byly. Explicitně založený záznam má podle RFC 4592 přednost a wildcard se pro
dané jméno přestane používat (v zóně to tak už funguje u `smtp` a `imap`).
Wildcard se **nesmí mazat**, drží `www.anse.cz`.

Důsledky wildcardu pro ověřování:
- Kontroluj **typ odpovědi**, ne to, že se jméno přeloží. Wildcard vrací
  věrohodně vypadající CNAME i na překlep (`sned.anse.cz`).
- Propsání může trvat až hodinu (wildcard vrací pozitivní odpověď s TTL 3600,
  ne NXDOMAIN s 300 s).

## 2. API klíč (dělá Lukáš)

Resend → **API keys** → *Create API Key* → oprávnění **Sending access** →
zkopírovat (`re_…`, zobrazí se jen jednou).

Klíč nikam neposílej v chatu ani ho nedávej do repa — patří přímo do Netlify.

## 3. Netlify (dělá Lukáš)

`app.netlify.com` → projekt **anse-zakazky** → *Project configuration* →
**Environment variables** → *Add a variable* → *Add a single variable*:

| Key | Value | Poznámka |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_…` | zaškrtnout **Contains secret values** |
| `RESEND_FROM` | `Anse <zakazky@anse.cz>` | musí být na ověřené doméně |
| `APP_URL` | `https://anse-zakazky.netlify.app` | základ odkazů v e-mailu |

Scope musí zahrnovat **Functions**, kontext **Production** (nebo všechny).

**Uložení proměnné se samo neprojeví.** Netlify Functions dostávají hodnoty ve
chvíli deploye — je potřeba nový build: *Deploys* → **Trigger deploy** → *Deploy
site*. Pozor: „Publish deploy" u staršího deploye je rollback, ten proměnné
nepřevezme. Do `netlify.toml` proměnné psát nelze, k funkcím se nedostanou.

Trigger deploy spustí i `npm run migrate && npm run seed` (obojí idempotentní).

## 4. Adresáti a test (dělá Lukáš v aplikaci)

**Správa účtů → Notifikace** → vyplnit adresy (víc oddělit čárkou) → *Uložit
nastavení* → **Poslat zkušební e-mail**.

Výsledek se ukáže hned pod tlačítkem:

| Hláška | Co s tím |
| --- | --- |
| ✅ Zkušební e-mail odeslán | hotovo |
| Nejdřív vyplňte a uložte adresu | vyplnit pole výše a uložit |
| Odesílání zatím není nakonfigurované | chybí `RESEND_API_KEY` nebo neproběhl nový deploy |
| Služba zprávu odmítla: … | text je přímo od Resendu — nejčastěji neověřená doména nebo odesílatel mimo ni |

## 5. Limity a provoz

- Free tier: **3 000 e-mailů/měsíc, 100/den, 1 doména**. Každý adresát v `to`
  se počítá zvlášť. Při vyčerpání Resend zprávu odmítne, změna stavu proběhne
  normálně a chyba se jen zaloguje.
- **Enable Receiving nechat vypnuté.** Slouží k příjmu pošty přes Resend a
  vyžadovalo by MX na kořeni domény — to by kolidovalo se stávající poštou.
- Odesílatel `zakazky@anse.cz` je jen odchozí. Když někdo na notifikaci
  odpoví, poletí to na `mail.svethostingu.cz` — buď tam schránku založit, nebo
  časem doplnit `reply_to`.
- DMARC (`_dmarc.anse.cz`, `v=DMARC1; p=none;`) je volitelný a pro ověření není
  potřeba. Řešit až jako samostatný požadavek po ověření domény.

## 6. Plán B, když správce DNS nestihne

Ověřit doménu, kterou má Lukáš pod kontrolou (např. `anse.webkit.studio`) a
nastavit `RESEND_FROM="Anse <zakazky@anse.webkit.studio>"`. Bez zásahu do kódu.

Pozor: free tier má **jednu doménu na účet** — před přidáním náhradní by se
musela `anse.cz` smazat a po zprovoznění DNS zase vrátit (a znovu ověřit).
