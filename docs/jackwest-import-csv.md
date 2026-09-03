# Import objednávky do portálu Jack West přes CSV

Portál Jack Westu umí položky poptávky/objednávky načíst ze souboru místo
ručního přepisování. Aplikace ten soubor umí vyrobit ze zaměření.

Podklady: návod „Import souboru CSV do webového portálu" a vzorový `tab.csv`
od Věry Syryčanské (systémový analytik JW), 3. 9. 2026. Vzor je v repu jako
`podklady/data/jack-west/csv-import/esd-vzor.csv`.

## Jak to používá kancelář

1. Zakázka ve fázi **K nacenění** (nebo **K montáži**, kdyby import napoprvé
   nevyšel) → panel vpravo, sekce **Podklady pro dodavatele**.
2. Tlačítko **CSV pro Jack West · ZKRATKA** stáhne soubor. Jeden soubor je vždy
   na **jeden výrobek** — každý má v portálu jinou masku, jiné sloupce.
3. V portálu: založit poptávku/objednávku → **Import CSV** → vybrat soubor.
4. Portál po importu ukáže, co nesedí, a nabídne opravu hodnot. Výrobce
   doporučuje první importovanou objednávku projít, než se odešle.

Tlačítko se objeví jen u výrobků, kde má **JW import zapnutý**: `ESD`, `PD`,
`SEL-13`, `SEL-15`. Ostatní výrobky Jack Westu v zakázce se v panelu **vypíšou
jménem** s poznámkou, že se přepisují ručně — ať se na ně nezapomene a nezjistí
se to až u dodavatele podle chybějících položek.

## Tvar souboru

UTF-8 **s BOM**, konce řádků **CRLF**, oddělovač **`;`** — přesně jako export
portálu. Čtyři řádky:

| řádek | co v něm je |
| --- | --- |
| 1 | české popisky sloupců — jen pro člověka |
| 2 | typ pole: `Text` / `Datum` / `Výběr` / `Dlouhý text` |
| 3 | **názvy sloupců** = pole v masce výrobku; podle nich importér páruje |
| 4+ | jedna položka zaměření na řádek |

První čtyři sloupce jsou u všech výrobků stejné:

- `Vase_znacka` — naše číslo zakázky (bez něj jméno zákazníka)
- `Pozadovany_Datum` — termín dodání, `DD.MM.YYYY`
- `Komentar` — necháváme prázdný, naše poznámka k zakázce je interní
- `Vyrobek` — zkratka výrobku, podle ní portál pozná, co zakládá

Zbytek jsou pole masky seřazená podle názvu sloupce (tak je má i export portálu).

Co víme z chování importéru:

- Neznámý sloupec se **nenahraje**, ale import pokračuje.
- Jiný počet sloupců než maska = **varování**, ne chyba.
- Hodnota mimo číselník → portál nabídne v dialogu opravu a dá pokračovat.

## Odkud se berou hodnoty

Klíčové zjištění z naměřených podkladů: v maskách Jack Westu se **hodnota volby
rovná jejímu popisku** (`9948 -př.`, `L-levá`, `C-celostín`). Do souboru se tedy
píše přesně to, co má konfigurátor v číselníku.

- **Výrobky z konfigurátoru** (`konfig_key`, např. `jackwest:PD`) — parametry
  ukládáme rovnou pod názvy polí masky a s jejími hodnotami. Sloupce, typy
  i výchozí hodnoty se počítají ze schématu, žádný převod se nedělá.
- **Výrobky s ruční definicí** (`ESD`, `SEL-15`) — naše klíče i hodnoty jsou
  vlastní, takže mají v `shared/jw-csv.ts` mapu: sloupec ↔ klíč pole, případně
  převod hodnoty (`P` → `P-pravá`) nebo „ber popisek volby" (barva lamely).

Co formulář nesbírá, se pošle jako **výchozí hodnota masky**. Že je to správně,
je ověřené: vzorový řádek od výrobce jsou přesně výchozí hodnoty masky a test
ho skládá znovu a porovnává se souborem od výrobce.

Dopočítává se:

- `Pocet` = 1 — jedna položka zaměření je jeden kus (množství u položek nevedeme)
- `Pozice` = místnost a pořadí v ní („Obývák 1")
- `Poznamka` = poznámka položky; víceřádková se srazí na jeden řádek
- `Metraz_ks` = plocha v m² ze šířky a výšky, desetinná čárka

## Stav map a jak přidat další výrobek

| výrobek | stav | odkud sloupce |
| --- | --- | --- |
| `ESD` | ověřeno | export portálu (`esd-vzor.csv`) |
| `SEL-15` | **neověřeno** | naměřená maska `SEL-13` + RAL profilu |
| `PD`, `SEL-13` | ověřeno schématem | naměřená maska konfigurátoru |

`PD` a `SEL-13` jsou v katalogu jako neaktivní podkategorie z konfigurátoru —
až je kancelář zapne v **Nastavení → Produkty**, soubor pro ně vzniká sám ze
schématu, bez zásahu do kódu.

**Přidání dalšího výrobku**, kterému JW import zapne:

1. Doplnit zkratku do `JW_CSV_VYROBKY` v `shared/jw-csv.ts`.
2. Je-li to výrobek z konfigurátoru, hotovo — mapa se odvodí ze schématu.
3. Je-li to výrobek s ruční definicí, přidat mapu do `JW_CSV_MAPY`.

**Dorovnání SEL-15 na ověřeno:** poprosit JW o vzorový `tab.csv` pro SEL-15
(v portálu: založit poptávku SEL-15, vyplnit jednu položku, uložit,
**Export CSV**), uložit ho vedle `esd-vzor.csv`, přepsat sloupce podle něj
a přepnout `overeno: true`.

## Kde to v kódu žije

- `shared/jw-csv.ts` — tvar souboru, mapy výrobků, skládání (čistý modul)
- `shared/jw-csv.test.ts` — skládá vzor od výrobce znovu a porovnává
- `server/export/jw-csv.ts` — data ze zakázky, nabídka výrobků ke stažení
- `netlify/functions/export.ts` — `GET /export/jw-csv/:orderId/:subcategoryId`
