# Anse — interní aplikace pro zakázky

Interní nástroj pro FWDS Europe, a.s. (značka Anse): technici v terénu vyplňují
produktové formuláře stínicí techniky z telefonu, kancelář objednává. Priority
v tomto pořadí: **1) rychlost vyplnění formuláře, 2) jednoduchost,
3) spolehlivost dat, 4) škálovatelnost formulářů.**

Kontext projektu, úkoly a podklady žijí v Notionu (stránka „Vývoj interní
aplikace"). Tento soubor drží jen build konvence.

## Stack

- Vite + React 18 + TypeScript (strict) · react-router · TanStack Query
- Čisté CSS s custom properties (`src/styles/tokens.css`) — žádný CSS framework
- Netlify: SPA + funkce (`netlify/functions/api.ts` = celé API, `ping.ts` = denní keepalive)
- Postgres na Supabase free — připojení výhradně ze serveru přes `postgres.js`
  (transaction pooler, `prepare: false`); klient s DB nikdy nemluví přímo

## Příkazy

```bash
npm run dev            # Vite na :5173 (proxuje /api na :8788)
npm run dev:api        # lokální API server na :8788 (stejný handler jako Netlify funkce)
npm run build          # tsc --noEmit && vite build
npm test               # Vitest (form-engine, server)
npm run test:e2e       # Playwright smoke (mobilní viewport) — vyžaduje lokální
                       # Postgres (viz níže) + proběhlý migrate a seed; nastaví
                       # testovací kódy 111111/999999 (jen proti localhost DB).
                       # V sandboxu: PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium
npm run validate:definitions   # zod kontrola JSON definic formulářů
npm run migrate        # aplikuje db/migrations/*.sql (DIRECT_DATABASE_URL)
npm run seed           # uživatelé + typy produktů + definice (DIRECT_DATABASE_URL)
```

Env proměnné: viz `.env.example`. Secrets nikdy s prefixem `VITE_` (nesmí do bundle).

Lokální Postgres bez Dockeru (sandbox): initdb + pg_ctl pod neprivilegovaným
uživatelem, port 5433, DB `anse` — connection string
`postgres://postgres@localhost:5433/anse` do `.env` (DATABASE_URL i DIRECT_DATABASE_URL).

## Architektonická pravidla

- **Vše přes `/api/*`** — jediná Netlify funkce (`server/handler.ts` router).
  Žádné přímé volání DB nebo třetích stran z klienta.
- `shared/` je čisté (bez IO, bez Node API) — importuje ho klient i server.
  Validace formulářů běží identicky na obou stranách (`shared/form-engine/`).
- Server **nikdy nevěří klientovi**: params se revalidují proti připnuté verzi
  definice, `position` a `product_type_id` přiděluje server, role se kontroluje
  per routa.
- Stavy zakázky (jen vpřed, žádné vracení): `rozpracovana` → `k_naceneni` →
  `k_objednavce` → `k_montazi` → `hotovo`. Technik posouvá terénní kroky
  (zaměřeno, namontováno), nacenění a objednávku dělá admin — viz
  `ALLOWED_TRANSITIONS` v `shared/types.ts`.
- Přechody stavů zakázky jsou compare-and-swap (`WHERE status = $expected`),
  editace hlavičky/položek optimistický zámek přes `updated_at` → při konfliktu
  409 a klient nabídne obnovení.
- Každá změna stavu posílá notifikaci na adresy z nastavení (`server/email.ts`,
  Resend). Odeslání nikdy neshodí požadavek — bez `RESEND_API_KEY` se přeskočí.
- UI texty **výhradně česky**, chybové hlášky přímo u pole. Touch targety
  min. 48 px (`--tap`), číselná pole `inputmode="numeric"/"decimal"`,
  fonty inputů min. 16 px (jinak iOS zoomuje).
- Zelená `--c-green` (#0DC28B) se nepoužívá jako barva textu na bílé
  (nedostatečný kontrast) — jen plochy/akcenty; text na zelené je `--c-ink`,
  zelený text/odkazy řeší tmavá `--c-green-deep`.

## Jak přidat / upravit typ produktu (bez zásahu do kódu)

1. Uprav/přidej JSON v `db/seeds/definitions/` (schéma: `shared/form-schema.ts`,
   vzor: `sel15.v1.json`). Skupiny zrcadlí editor výrobce; `options[].value` =
   kód výrobce pro export, `label` česky.
2. `npm run validate:definitions` — musí projít.
3. `npm run seed` — vytvoří **novou verzi** definice (definice jsou po prvním
   použití immutable; staré položky se dál vykreslují podle své verze).
4. Poznámka položky je vestavěná (`items.note`) — do definic se nepřidává,
   renderer ji vykresluje vždy na konci. Pravidlo `requireNote` ji umí vynutit.
5. Chybějící číselné limity nechávej `null` (bez validace), selecty bez
   dodaných možností označ `"tbd": true` — pole se vykreslí neaktivní
   s popiskem „doplní se".

## Bezpečnostní trade-offy (vědomá rozhodnutí)

- Přihlašovací kódy jsou v DB **plaintext**: admin je musí zobrazovat a
  spravovat; hash 6místného prostoru (10^6) je proti offline útoku divadlo.
  Ochrana: kódy generuje server náhodně, unikátní, vystavené jen admin routám,
  nikdy v logách; login má rate-limit per IP + globální pojistku.
- RLS deny-all + `REVOKE` na všech tabulkách (migrace 001) — anon/authenticated
  klíče Supabase jsou k ničemu i při úniku; service přístup jde jen přes pooler
  connection string v env funkcí.
- PII zákazníků prochází přes Netlify funkce v US (free tier) do EU DB —
  vědomý accept kvůli nulovým nákladům, zmínit při předání.

## Provozní runbook

- **Supabase pauza** (free tier, ~7 dní bez aktivity): brání jí denní `ping`
  funkce; kdyby přesto pauzlo → Supabase dashboard → Restore/Resume.
- **Zálohy**: noční `pg_dump` přes GitHub Actions (`.github/workflows/backup.yml`),
  artefakt 90 dnů. Obnova: `psql $DIRECT_DATABASE_URL < dump.sql`.
- **Deploy**: push na branch → Netlify branch/deploy preview → merge do `main`
  = produkce. Malé commity s popisem česky nebo anglicky, konzistentně.
- **Migrace + seed běží v Netlify buildu** (idempotentní) — úprava JSON definice
  → push → deploy = nová verze v DB. První seed: nastav `SEED_ADMIN_CODE`
  (6 číslic) v Netlify env → kód pro Lukáše, ostatní kódy se zobrazí v admin UI
  a nikdy nejdou do logů; bez této proměnné se kódy jednorázově vypíšou do
  build logu (fallback, ať se jde přihlásit).

## Notion workflow

- Úkoly: DB Úkoly (filtr na projekt „Vývoj interní aplikace"), stavy
  K řešení → Pracujeme na tom → Ke kontrole.
- Zásadní rozhodnutí (stack, model, scope): navrhnout ke schválení Lukášovi,
  schválené zapsat do DB Zápisky (Typ = Rozhodnutí, relace na projekt).
- Když se zadání v promptu liší od Notionu, platí Notion.
