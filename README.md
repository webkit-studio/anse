# Anse — interní aplikace pro zakázky

Interní nástroj pro **FWDS Europe, a.s.** (značka Anse). Technici stínicí
techniky vyplňují v terénu z telefonu strukturované produktové formuláře,
kancelář z počítače naceňuje, objednává a fakturuje. Jedna linka od prvního
telefonátu po montážní list s podpisem.

- **Produkce:** <https://anse-zakazky.netlify.app> (push do `main` = deploy)
- **Jak aplikace funguje procesně:** [`docs/proces-zakazky.html`](docs/proces-zakazky.html)
  (i jako [PDF](docs/proces-zakazky.pdf)) — fáze, den technika, den kanceláře, notifikace
- **Build konvence a architektonická pravidla:** [`CLAUDE.md`](CLAUDE.md)
- **Zprovoznění e-mailů (Resend):** [`docs/notifikace-resend.md`](docs/notifikace-resend.md)
- Zadání a úkoly žijí v Notionu (stránka „Vývoj interní aplikace")

## Co umí

- **Kontakty** — databáze čísel: stačí jméno *nebo* telefon, hvězdička
  „ozvat se" (rozsvícení chce poznámku proč), přidělení konkrétnímu člověku,
  trvalé poznámky s autorem.
- **Zakázky v pěti fázích** — `k_zamereni → k_naceneni → k_montazi →
  k_fakturaci → hotovo` (+ `zruseno` mimo linku, kancelář umí obnovit).
  Jen vpřed, compare-and-swap; co chybí k posunu, počítá server.
- **Formuláře podle výrobce** — data-driven JSON definice (versované,
  immutable), podmíněná pole, validace identická na klientu i serveru,
  autosave, položka typu **Oprava** (foto závady + popis).
- **Konfigurátor dodavatelů** — 45 produktů (Jack West, SUYS) jede přímo
  z naměřených podkladů konfigurátorů (`podklady/`, bez cen a marží):
  pravidla skrývání/zámků, setsValue, zpřísňování limitů, u SUYS odvozené
  limity látek. Schéma stahuje klient per produkt
  (`GET /api/konfigurator/:key`), validace opět na obou stranách.
- **Návody u zaměřování** — tlačítko Návod na formuláři položky otevírá
  montážní a vyměřovací podklady výrobce (`navody/`, statické výkresy
  + fulltext hledání bez diakritiky).
- **Dva pohledy nad jedněmi daty** — technik: mobil, spodní navigace
  Dnes/Kontakty/Zakázky; kancelář: desktop, rail s Přehledem, tabulkami,
  fázovým panelem, statistikami a nastavením. **Technik nikdy nevidí cenu
  zakázky pro zákazníka** (server mu ji vůbec neposílá).
- **Podpis prstem + montážní list PDF**, XML export zaměření pro dodavatele.
- **Notifikace** — in-app zvonek vždy; e-mail volitelně per uživatel a událost.
- **Přihlášení šestimístným kódem** — spravuje kancelář v Nastavení → Účty.

## Stack

Vite · React 18 · TypeScript (strict) · react-router · TanStack Query · čisté
CSS s design tokeny — bez CSS frameworku. Backend: Netlify Functions
(`/api/*` jeden router, `/export/*` PDF+XML, `ping` keepalive) nad Postgres
na Supabase (postgres.js, transaction pooler). E-maily Resend, vše free tier.

## Lokální vývoj

```bash
npm ci
cp .env.example .env          # DATABASE_URL, DIRECT_DATABASE_URL, JWT_SECRET
npm run migrate && npm run seed   # seed vypíše přihlašovací kódy
npm run dev:api               # API na :8788
npm run dev                   # Vite na :5173 (proxuje /api)
```

Postgres stačí lokální (viz `CLAUDE.md` pro variantu bez Dockeru). Seed je
idempotentní; definice formulářů se při změně JSON verzují, nikdy nepřepisují.

```bash
npm test                  # Vitest — form-engine, fáze, blokace, e-maily
npm run test:e2e          # Playwright — celá linka technik ↔ kancelář
npm run validate:definitions
npm run build             # tsc --noEmit && vite build
```

## Deploy

Merge/push do `main` → Netlify build spustí `build && migrate && seed`
(idempotentní — úprava JSON definice v `db/seeds/` se tím sama dostane do DB).
Denní zálohy DB dělá GitHub Actions (`.github/workflows/backup.yml`).

## Struktura

```
shared/          typy, fáze, kontrakty, form-engine, formátování — bez IO
server/          router, routy, notifikace, e-maily, exporty (PDF, XML)
src/             React UI (pages, components, form-engine, styles)
db/migrations/   SQL migrace (řadí se číslem, aplikuje scripts/migrate.ts)
db/seeds/        katalog produktů + JSON definice formulářů
netlify/functions/  api.ts, export.ts, ping.ts (cron */5)
e2e/             Playwright smoke celé linky
docs/            provozní příručka, runbooky, historická specifikace
```

Jak přidat produkt bez zásahu do kódu, bezpečnostní trade-offy a provozní
runbook: viz [`CLAUDE.md`](CLAUDE.md).
