# Anse — podklady dodavatelů

Strojově čitelné podklady pro interní konfigurační aplikaci **Anse**: pole formulářů, číselníky a naměřená pravidla závislostí z konfigurátorů dodavatelů.

Data nepocházejí z dokumentace, ale z **empirického měření produkčních konfigurátorů** — u každého pole se postupně nastavila každá hodnota a po každé změně se porovnal stav celého formuláře proti baseline.

## Obsah

| Cesta | Co to je |
|---|---|
| `data/jack-west/produkty-davka-2.json` | 42 produktů: pole, volby, pravidla |
| `data/jack-west/katalog-52-produktu.json` | seznam všech 52 produktů se skupinami a ID |
| `data/jack-west/raw/` | surová naměřená data před zpracováním |
| `data/suys/produkty.json` | 3 typy screenových clon vč. odvozených limitů |
| `data/suys/raw/` | surové snapshoty a měření |
| `docs/datovy-model.md` | **začni tady** — schéma obou souborů a jak číst pravidla |
| `docs/jack-west-specifikace.md` | čitelná specifikace pro lidi (4 258 řádků) |
| `docs/suys-specifikace.md` | totéž pro SUYS |

## Čísla

| Dodavatel | Produktů | Polí | Pravidel | Chyb při měření |
|---|---:|---:|---:|---:|
| Jack West — dávka 2 | 42 | 1 483 | 1 052 | 0 |
| SUYS — screenové clony | 3 | 59 | 119 | 0 |

Katalog Jack Westu je tím pokrytý celý: 52 z 52 produktů poptávkového formuláře.

## Co chybí

- **Dávka 1 Jack Westu** (10 produktů z 11. 8. 2026, 384 polí, 186 pravidel) — soubor `anse-produkty.json` zatím není v repu, je potřeba ho dohledat a přiložit jako `data/jack-west/produkty-davka-1.json`.
- **Obsah vzorkovníků a skladových karet** — u polí je jen příznak `hasSampleBook` / `hasStockCard`. Katalog látek (801 karet) a 949 obrázků vzorků zatím nezpracované.
- **Ceny** — nesbíraly se.
- **Neva** (třetí dodavatel) — pole hotová, závislosti chybí.
- **Seznam vyřazených polí** — co v aplikaci nebude, určuje Marek.

## Pozor: dva různé modely

Jack West pole **zamyká** (`disables`) a nese `min`/`max` přímo na poli. SUYS pole **skrývá** (`hides`/`shows`) a limity má vypočítané v `derivedLimits`. Sjednocení bez rozmyslu rozbije validaci rozměrů u jednoho z nich — podrobně v `docs/datovy-model.md`.
