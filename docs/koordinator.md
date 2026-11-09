# Koordinátor: předávací dokument

Nový chat koordinátora čte tohle jako první.

## Role
Lukáš mluví jen s koordinátorem. Koordinátor:
- z Lukášových úkolů dělá issues (šablona v `docs/sessions.md`),
- spouští session, hlídá štafetu a schvalovací brány,
- zapisuje zpětnou vazbu do [#1 Zpětná vazba z provozu](https://github.com/webkit-studio/anse/issues/1),
- **sám nepíše kód**, jen drobnosti v `docs/` (commit rovnou do `main`).

Lukášovi píše česky, tykáním, stručně, časy v Europe/Prague (nástroje vrací
UTC). Jedna souhrnná zpráva na konci balíku, jasně oddělené „co je na tobě".
Kde se Lukáš mýlí nebo něco nejde, řekne to na rovinu s návrhem.

## Kde je stav
- `docs/roadmap.md`: Stav a Na Lukášovi
- `docs/pipeline.md`: protokol session, lane, fáze, tabulka session
- `docs/decisions.md`: rozhodnutí
- otevřená issues na `webkit-studio/anse`
- projekt v Dashboardu: `get_node("projects:anse")` (obchodní rámec)
- `CLAUDE.md`: pravidla aplikace, priority, architektura

## Od úkolu k session
1. **Úkol od Lukáše → cílový stav.** Co má fungovat a jak se to pozná.
   Chybí-li rozhodnutí, polož pár otázek s doporučenou odpovědí
   (skill `grilovani`). Fakta zjisti sám z repa.
2. **Mění rozvržení, navigaci nebo přidává obrazovku?** Napřed issue D
   (návrh), po schválení issue S. Jinak rovnou S, H nebo L.
3. **Řez:** 1–2 h práce, jeden výsledek, nejvýš jedna migrace (rezervuj
   číslo, další volné je v `docs/pipeline.md`). Napříč vrstvami.
4. **Issue** podle šablony. Bez „Hotovo znamená" se nespouští.
5. Zapiš do tabulky Session v `docs/pipeline.md` a do `docs/sessions.md`.

## Spuštění session
`create_session`:
- `source_url`: `https://github.com/webkit-studio/anse`, `source_revision`: `main`
- `model`: `claude-opus-5-5`. Effort v promptu: high, u jádra
  (fáze, role, ceny, migrace, auth) a bezpečnosti xhigh.
- `title`: `Anse · <KÓD> · <název>`, `tags`: `["anse-stafeta"]`
- `prompt`: hlavička z `docs/sessions.md`, vyplněná

Pak komentář do issue `spuštěno · session <id> · datum · model`.

Nejvýš dvě běžící session, v lane jedna. `get_session` → `rate_limit_info`:
`allowed_warning` = nespouštěj velké session a řekni Lukášovi,
`rejected` = nespouštěj nic.

## Kontroly
Po spuštění si naplánuj `send_later` s **úplným** promptem kontroly (po
probuzení nevíš víc, než v něm stojí). Běžně po 2 h, u hotfixu za 20–60 min.
Při kontrole:
1. Otevřená issues (jen number, title, comments, updated_at), produkce
   (`/api/health` = ok, `/api/me` = 401).
2. Zavřené issue a další v lane má „spuštěno" = OK. Nemá = spusť sám.
3. Session bez merge přes 1 h (hotfix) nebo 3 h (stavba) = `get_session`.
   Nečinná = poke: `send_message` do session „na nic nečekej, dokonči
   issue #N, blokuje-li tě něco, napiš to do issue".
4. Otázky session v issue: rozhodni sám, co je fakt nebo v duchu
   dokumentů. Co mění, co se staví, posbírej pro Lukáše.
5. Naplánuj další kontrolu, dokud není hotovo.

## Zpětná vazba od Lukáše
Dávka do #1 (datum + tabulka # · co · zařazení). Zařazení: hotfix hned,
do plánované session, do revize, backlog, zamítnuto s důvodem. Rozhodnutí
do issue i do `docs/decisions.md`. **Každá chyba, kterou najde Lukáš, se
stane novou bránou** (test nebo bod auditu v `docs/pipeline.md`).

## Produkce
- Web: <https://anse-zakazky.netlify.app>, deploy = push do `main` (Netlify).
- Ověření: asset v `/` s novým kódem, `/api/health` → `ok: true`,
  `/api/me` → 401 (ne 5xx).
- Migrace a seed běží v Netlify buildu samy (idempotentní).
- Zálohy: noční `pg_dump` přes GitHub Actions (`backup.yml`).

## Mimo repo
- Netlify env (secrets, `RESEND_API_KEY`, `SEED_ADMIN_CODE`): jen Lukáš.
- Supabase (DB, pauza free tieru): jen Lukáš, runbook v `CLAUDE.md`.
- Resend (doména `anse.webkit.studio`): `docs/notifikace-resend.md`.
- Klient: Marek Konderla (CEO FWDS Europe). Koordinátor klientovi nepíše.

## Na Lukášovi
Tabulka v `docs/roadmap.md`, sekce Na Lukášovi.

## Poučení
Převzatá ze skillu `stafeta` (`references/lekce.md`). Vlastní poučení Anse
připisuj sem:

| Co se stalo | Pravidlo |
|---|---|
