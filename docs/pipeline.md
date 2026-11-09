# Pipeline: štafeta session

Anse staví štafeta: řada krátkých čerstvých session, každá dělá jedno issue.
Tenhle dokument má přednost před obecným skillem `stafeta`
(`webkit-studio/webkit-studio`, `.claude/skills/stafeta/`) i před uzlem mapy
`standardy-stafeta`. Pravidla aplikace drží `CLAUDE.md`.

**Odchylka od obecné štafety:** Anse nejede přes PR. Podle `CLAUDE.md` jde
hotová práce rovnou do `main` (= produkce). Brány proto běží **před merge**
a jejich výstup jde do komentáře issue místo do PR.

## Protokol (kroky 0–8)

### 0. Vstup
Prompt = hlavička z `docs/sessions.md` + číslo issue. Celé zadání je v issue.
Přečti `CLAUDE.md`, sekci Stav v `docs/roadmap.md`, tenhle dokument a jen
části kódu, kterých se issue týká.

### 1. Závislosti
Otevřené issue ze „Závisí na" = komentář `čeká na #N` a konec bez práce.

### 2. Převzetí
- Běží-li ve tvé lane jiná session (issue se stavem `běží`), konec.
- Tělo issue `**Stav:** běží`, komentář `start · datum · model`.
- Převzetí produkce: `curl -s https://anse-zakazky.netlify.app/api/health`
  (čeká `ok: true`) a `/api/me` (čeká 401, ne 5xx). Chyba předchůdce = první
  commit tvé větve a komentář do jeho issue. Větší než hodina = nové issue
  `H.. · …` a komentář do #1.

### 3. Práce
- Větev `stafeta/<kód>-<slug>` z aktuální `main`, jen rozsah issue.
- Lokální prostředí: `npm ci`, lokální Postgres podle `CLAUDE.md` (port 5433,
  DB `anse`), `.env` z `.env.example`, `npm run migrate && npm run seed`.
- Migrace jen s číslem rezervovaným v issue. Musí být **aditivní**
  (nový sloupec s defaultem, nová tabulka). Netlify build pouští
  `migrate` po buildu, takže starý kód musí běžet nad novým schématem
  a přihlášení (`/api/auth`, `/api/me`) nesmí na nové schéma spoléhat.
  Mazání sloupců až další migrací, když je kód venku.
- Rozhodnutí mimo architekturu do `docs/decisions.md`.

### 4. Brány před merge (v tomto pořadí)
Výstupy příkazů do souboru (`> /tmp/…log`), do kontextu jen souhrn.

a. `git merge origin/main`, konflikty vyřešit (v dokumentech zachovat obě strany).
b. `npm run build` bez chyb.
c. `npm test` zelené. Při změně definic i `npm run validate:definitions`.
   Při změně toků v UI i `npm run test:e2e`
   (v sandboxu `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`).
   **Červený test se opravuje, nikdy nevypíná ani nepřeskakuje.**
d. Code review nad vlastním diffem vůči `main` (`/code-review high` nebo
   subagent). Potvrzené nálezy opravit, ostatní zdůvodnit v komentáři issue.
e. **Vzhled** (mění-li se cokoli viditelného): snímky mobil 390 px
   a desktop 1440 px před a po (Playwright proti `npm run dev`), jako
   artifact s odkazem v issue. Kontrola: bloky bez mezery, obsah na hraně,
   překryv dropdownu, touch targety ≥ 48 px, fonty inputů ≥ 16 px,
   zelený text na bílé (zakázaný), texty výhradně česky.
f. **Výkon** (mění-li se dotazy nebo výpisy): počet dotazů na request,
   žádné base64 ve výpisech (limit odpovědi funkce).
g. **Security review** u přihlášení, rolí, cen, fotek, exportů, notifikací.
   Hlavně: technik nesmí dostat cenu zakázky (`orderCols()`), server
   revaliduje vše od klienta.
h. Po opravách z d–g znovu c.

### 5. Merge
`git checkout main && git merge --no-ff stafeta/<…> -m "<KÓD> · <název> (Closes #N)"`,
push do `main`. Do issue komentář s výstupy bran (build, testy, review,
snímky). Merguje session sama, jen po zelených branách.

### 6. Produkce
Deploy trvá pár minut. Mezitím udělej krok 7, nečekej nečinně. Pak:
- asset v `/` obsahuje nový kód (název nového hashe nebo unikátní řetězec),
- `/api/health` vrací `ok: true`, `/api/me` vrací 401,
- smoke změněné obrazovky.

Červená produkce = oprava a další merge **před** předáním. Netlify build log
přes Netlify MCP, když je k dispozici.

### 7. Uzavření
Sekce Stav v `docs/roadmap.md` (jen tvoje řádky), `docs/decisions.md`,
komentář `hotovo · <commit>`: co vzniklo, co zůstalo, známé nedostatky,
**co potřebuje Lukáš**. Tělo `**Stav:** hotovo`, zavřít issue.

### 8. Předání
V lane nic neběží a další issue v lane má `čeká` se zavřenými závislostmi =
spusť ho (`create_session`, hlavička z `docs/sessions.md`, model podle
`docs/koordinator.md`) a zapiš `spuštěno · session <id> · datum · model`.
Konec lane = nic nespouštět. Session D, H a R spouští jen koordinátor.

## Fáze a schválení

Anse je v produkci a má design systém (`src/styles/tokens.css`). Fáze 0–3
se dělají jen pro novou práci, která mění rozvržení, navigaci nebo přidává
nový typ obrazovky. Pak napřed session D (návrh jako artifact nebo soubor
v `docs/`, nesahá na `src/`), schválení Lukášem, teprve potom stavba.

Schválení = komentář koordinátora v issue návrhu
`schváleno · datum · odkaz na návrh`. Issue stavby na něj odkazuje.

**Rovnou stavba:** oprava chyby bez změny vzhledu, data, API, definice
formulářů a konfigurátor, exporty, rutiny, drobná změna ve schváleném vzoru.

| Návrh | Issue | Stav | Schváleno |
|---|---|---|---|

## Lane

| Lane | Co vlastní | Nesahá na |
|---|---|---|
| **A · aplikace** | `src/` (mimo `navody-mapa.json`), `server/`, `shared/` (mimo `konfigurator/`, `dodavatele.ts`, `jw-csv.ts`), `db/migrations/`, `netlify/` | soubory lane B |
| **B · katalog a podklady** | `db/seeds/`, `podklady/`, `navody/`, `src/navody-mapa.json`, `shared/konfigurator/`, `shared/dodavatele.ts`, `shared/jw-csv.ts` | soubory lane A, migrace |

- Nejvýš dvě běžící session, v každé lane jedna. Hotfix H se počítá do limitu.
- Řez jde napříč vrstvami (DB → server → UI) a funguje sám, proto lane A
  drží celou aplikaci. Lane B jde souběžně, jen když issue A nesahá na její soubory.
- Migrace jen v lane A. Další volné číslo: **018** (014–017 rezervováno pro S01–S04).

## Kódy session
S stavba · D návrh · H oprava · R revize · P výkon · L drobná úprava pro provoz.

## Session

| Kód | Název | Issue | Lane | Závisí na | Migrace | Sady | Stav |
|---|---|---|---|---|---|---|---|
| S01 | Termín dodání po dodavatelích + změna s notifikací | #2 | A | – | 014 | test + e2e | spuštěno |
| S02 | Kancelář zadává položky, kdo montuje, smazat staré sloupce | #3 | A | #2 | 015 | test + e2e | čeká |
| S03 | Typ zakázky Nová / Oprava | #4 | A | #3 | 016 | test + e2e | čeká |
| S04 | Zaměření a montáže v kalendáři (ICS) | #5 | A | #4 | 017 | test + e2e | čeká |

Tabulka je jen snímek. Pravdu drží issue.
