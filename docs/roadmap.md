# Roadmapa

Aplikace je v produkci (<https://anse-zakazky.netlify.app>). Další práce
jde štafetou (`docs/pipeline.md`), koordinuje ji chat podle
`docs/koordinator.md`.

## Stav
_Aktualizováno: 10. 11. 2026 · koordinátor po nočním běhu_

**Hotovo:** kontakty s přidělením víc lidem, zakázky v pěti fázích,
formuláře podle výrobce, konfigurátor (Jack West, SUYS, Neva), návody,
galerie fotek, podpis a montážní list PDF, XML a CSV export pro Jack West,
notifikace in-app a e-mail, lišta „Je tu nová verze". Podrobně `README.md`.
**Rozpracováno:** nic. Noční běh S01–S04 (#2–#5) hotový a v produkci 9. 11. 23:17–00:27: termíny dodání po dodavatelích, kancelář zadává položky + Kdo montuje, typ Nová / Oprava, kalendář (ICS).
**Další krok:** Lukáš projde snímky a rozhodne otevřené body níže.
**Blokery:** žádné.

### Na Lukášovi
| Co | Proč | Od kdy |
|---|---|---|
| Ráno zkontrolovat snímky S01–S04 | Úpravy panelu kanceláře bez samostatného návrhu | 10. 11. 2026 |
| Rozhodnout: má „Kdo montuje“ být prázdné, dokud ho kancelář vědomě nevybere? (dnes předvyplněno tím, kdo měřil) | Jinak Jakub nemusí být přidělen; navíc přepnutí montážníka vezme měřiči zaměření z kalendáře (S02 #3, S04 #5) | 10. 11. 2026 |
| Rozhodnout: zvednout chipy a ikonová tlačítka na 48 px v celé appce? | Dnes 44 px, pravidlo `--tap` je 48 px (S03 #4) | 10. 11. 2026 |
| Říct technikům, kde je Kalendář (Zprávy → ⚙ Nastavení → Kalendář, přímý odkaz `/nastaveni/kalendar`) a vyzkoušet přidání na Androidu i iPhonu | Technik nemá stránku Nastavení, vstup je schovaný u Zpráv; reálné telefony jsem neměl (S04 #5) | 10. 11. 2026 |
| Rozhodnout, jestli technikům stačí, že jméno, telefon a adresa zákazníka jdou do jejich Google / iCloud kalendáře | Nový tok osobních údajů k třetí straně; zmínit při předání spolu s Netlify v US (S04 #5) | 10. 11. 2026 |

## Dluh, který stojí za session
- ~~Smazat zastaralé sloupce~~ → přibaleno do S02 #3 (migrace 015).
- Kalendář bere přidělení zakázky pro zaměření i montáž. Když kancelář přepne „Kdo montuje" na jiné lidi, měřič ztratí minulé zaměření z kalendáře a montážníci ho uvidí. Kdo měřil, se zvlášť neukládá (S04 #5).
- Chipy (`.chip`) mají `min-height: 44px`, `CLAUDE.md` chce touch target 48 px (`--tap`). Platí pro všechny chipy v appce (filtry, místnosti, termíny, Nová / Oprava). Oprava je jeden řádek CSS, ale mění výšku všude – chce kontrolu snímků (S03 #4).
