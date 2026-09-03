# Zprovoznění e-mailových notifikací (Resend)

Runbook pro Lukáše. E-maily posílá `server/notify.ts` + `server/email.ts` podle
předvoleb uživatelů (Nastavení → Notifikace, technik přes ⚙ ve zvonku). Bez
konfigurace appka funguje dál — e-maily se jen tiše přeskakují, in-app zprávy
chodí vždy.

**Stav k 2. 9. 2026: ZPROVOZNĚNO.** Odesílatelem je a zůstane
`Anse Aplikace <zpravy@anse.webkit.studio>` — rozhodnutí zadavatele, `anse.cz` se pro
odesílání používat nebude. Doména `anse.webkit.studio` je v Resendu ověřená
(eu-west-1, SPF + DKIM + DMARC přes CNAME záznamy — novější styl, u `numulo`
je starší MX+TXT, obojí je správně). V Netlify stačí `RESEND_API_KEY`
(klíč „Netlify"); `RESEND_FROM` je nepovinná, protože stejná adresa je
i výchozí v `server/email.ts`.

---

## Odesílací doména: `anse.webkit.studio`

DNS `webkit.studio` ovládá Lukáš → hotovo za ~15 minut, na nikoho se nečeká.

1. **Resend → Domains → Add Domain** → `anse.webkit.studio`, region
   **eu-west-1**. Resend vypíše tři záznamy (hodnoty vždy brát z Resendu):

   | Typ | Jméno (host) | Hodnota | Pozn. |
   | --- | --- | --- | --- |
   | MX | `send.anse.webkit.studio` | `feedback-smtp.eu-west-1.amazonses.com`, prio 10 | bounce adresa |
   | TXT | `send.anse.webkit.studio` | `v=spf1 include:amazonses.com ~all` | SPF |
   | TXT | `resend._domainkey.anse.webkit.studio` | `p=MIGf…` (dlouhý klíč) | DKIM |

   Pokud DNS editor chce jen část před `webkit.studio`, zadává se
   `send.anse` a `resend._domainkey.anse`.

2. **Navrch DMARC** (Resend ho nevyžaduje, Gmail ho má rád):

   | Typ | Jméno | Hodnota |
   | --- | --- | --- |
   | TXT | `_dmarc.anse.webkit.studio` | `v=DMARC1; p=none;` |

3. V Resendu **Verify** (propsání bývá minuty).
4. Pokračovat sekcí *API klíč* a *Netlify* níže s
   `RESEND_FROM = Anse Aplikace <zpravy@anse.webkit.studio>` (nepovinné — stejná adresa
   je i výchozí v kódu).

**Proč to nepadá do spamu:** o skóre rozhoduje autentizace (SPF + DKIM na
přesně té doméně, ze které se posílá, tzv. alignment), ne hezkost adresy.
Subdoména `anse.webkit.studio` s vlastním DKIM je z pohledu filtru
plnohodnotný odesílatel. Jediné, co žádná konfigurace nezaručí, je reputace
úplně čerstvé domény — prvních pár zpráv může Gmail držet zkrátka; u interního
provozu stačí, když si Marek s Darinou adresu jednou přidají do kontaktů,
případně první zprávu označí „není spam".

## Proč ne `anse.cz`

Odesílat se bude jen z `anse.webkit.studio` — zadavatel to takhle rozhodl
a nepočítá se se změnou. `anse.cz` je v Resendu založená, ale neověřená
(*not started*), a **odeslání z neověřené domény Resend odmítne** hláškou
„the anse.cz domain is not verified". Kdyby ji někdo v budoucnu ověřit chtěl,
záznamy pro správce leží v `dns-zaznamy-pro-spravce.txt` (pozor na wildcard
`*.anse.cz`) a přepíná se to jedinou proměnnou `RESEND_FROM` — do kódu se
sahat nemusí.

## API klíč (dělá Lukáš)

Resend → **API keys** → *Create API Key* → oprávnění **Sending access** →
zkopírovat (`re_…`, zobrazí se jen jednou).

Klíč nikam neposílej v chatu ani ho nedávej do repa — patří přímo do Netlify.

## Netlify (dělá Lukáš)

`app.netlify.com` → projekt **anse-zakazky** → *Project configuration* →
**Environment variables**:

| Key | Value | Poznámka |
| --- | --- | --- |
| `RESEND_API_KEY` | `re_…` | zaškrtnout **Contains secret values** |
| `RESEND_FROM` | nepovinné (výchozí `Anse Aplikace <zpravy@anse.webkit.studio>`) | musí být na doméně ověřené v Resendu |
| `APP_URL` | `https://anse-zakazky.netlify.app` | základ odkazů v e-mailu |

Scope musí zahrnovat **Functions**, kontext **Production** (nebo všechny).

**Uložení proměnné se samo neprojeví.** Funkce dostávají hodnoty při deployi —
*Deploys* → **Trigger deploy** → *Deploy site*. („Publish deploy" u staršího
deploye je rollback a proměnné nepřevezme.)

## Test a měření spam skóre (v aplikaci)

1. Nastavení → Notifikace → vyplnit **Společnou adresu kanceláře** → Uložit →
   **Poslat zkušební zprávu**. Hláška rovnou řekne, co případně chybí
   (klíč / adresa / odmítnutí Resendem i s důvodem).
2. **Změření skóre:** otevřít <https://www.mail-tester.com>, vygenerovanou
   adresu `test-…@mail-tester.com` dočasně vložit jako společnou adresu,
   poslat zkušební zprávu, na mail-testeru dát *Check score*. Se správným
   SPF + DKIM + DMARC se výsledek drží kolem 10/10. Pak adresu vrátit zpět.
3. Osobní e-maily účtů (Nastavení → Účty) — komu chybí, tomu e-maily nechodí
   (svítí štítek „chybí e-mail") a kancelářské zprávy padají na společnou adresu.

## Kdy jaký e-mail chodí

Řídí tabulka `NOTIF_EVENTS` (`shared/types.ts`) a osobní předvolby
(`notif_prefs`). Přehled událostí je v aplikaci (Nastavení → Notifikace)
a v provozní příručce [`proces-zakazky.html`](./proces-zakazky.html).
