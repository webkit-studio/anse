# Anse — podklady dodavatelů: předávka pro Claude Code

> Stav k 27. 8. 2026. Dva dodavatelé vytažení z jejich konfigurátorů, každý s vlastním datovým modelem. Tenhle dokument popisuje, co v souborech je, jak to číst a kde jsou hranice.

## Co předat

| Soubor | Obsah | Velikost |
|---|---|---|
| `jw-nove-produkty.json` | **Jack West, 42 produktů** — pole, volby, pravidla | 1,7 MB |
| `suys-produkty.json` | **SUYS, 3 typy screenových clon** — pole, volby, pravidla, odvozené limity | 372 kB |
| `ANSE-JACKWEST-NOVE.md` | čitelná specifikace Jack Westu (pro člověka, ne pro parser) | 296 kB |
| `ANSE-SUYS.md` | čitelná specifikace SUYS | 33 kB |
| `JW__produkty-seznam.json` | katalog všech 52 produktů JW se skupinami a ID | 23 kB |
| `JW__vsech42.json` | surová naměřená data před zpracováním (záloha) | 942 kB |

**Chybí v tomhle balíku:** `anse-produkty.json` a `ANSE-PRODUKTY.md` z první dávky (10 produktů JW z 11. 8.) — nejsou ve složce Downloads, dohledej je a přilož; bez nich je katalog Jack Westu neúplný.

---

## Datový model: Jack West

```
{ source, generated, products: [ Product ] }

Product {
  zkratka, name, id, skupina,     // skupina: EŽ RS HŽ VŽ P LR OS PS DS VR ND
  stats: { fields, selects, rules, measuredSteps, measuredMs, sampledFields, errors },
  sections: [string],             // pořadí sekcí formuláře
  fields:   [ Field ],
  rules:    [ Rule ]
}

Field {
  code,                           // technický kód, klíč pro pravidla
  label, section,
  inputType,                      // select | text | number | textarea
  tag,                            // SELECT | INPUT | TEXTAREA
  required,
  disabledByDefault, visibleByDefault,
  min, max, step, maxLength,      // řetězce, ne čísla — parsuj
  defaultValue,
  hasSampleBook, hasStockCard,    // pole odkazuje na vzorkovník / katalog skladových karet
  lecg,                           // interní příznak JW
  options: [ { value, label } ]
}

Rule {
  when: { field, label, value, valueLabel },
  then: { disables?, enables?, shows?, hides?, restricts?, setsValue?, limits? },
  measured,                       // full | sample | escalated
  alerts: [string]
}
```

**Čísla:** 1 483 polí (759 selectů, 609 text, 73 number, 42 textarea), 788 povinných, **181 polí má min/max přímo v masce** — to je hotová validace rozměrů. 236 polí odkazuje na vzorkovník, 42 na skladovou kartu.

**Rozložení efektů:** `disables` 724, `enables` 309, `shows` 192, `setsValue` 112, `hides` 41, `limits` 26.

---

## Datový model: SUYS

```
Product {
  code, name,                     // C-SC_01 LOCKSCREEN, C-SC_03 CABLESCREEN, C-SC_05 HANDSCREEN
  stats: { paramsTotal, paramsVisible, pages, rules, ... },
  pages:  [ { name, fields: [code] } ],   // taby konfigurátoru
  fields: [ Field ],                       // jen viditelná pole
  internalFields: [ { code, label, dataType, defaultValue } ],   // 552 interních
  rules: [ Rule ],
  derivedLimits: { CODE: { label, dependsOn: { srcField: { srcValue: limit } } } }
}

Field {
  code, label, page, pageIndex, group, order,
  dataType,                       // Text | Code | Integer | Decimal | Boolean
  displayType,                    // string | Slider | ListBox | Color
  mandatory, editable, showOnWeb, visible,
  maxLength, defaultValue, defaultValueLabel,
  options: [ { value, label, group, color, image } ]   // image = URL náhledu
}
```

**Rozložení efektů:** `shows` 84, `restricts` 68, `setsValue` 63, `hides` 48.

---

## Dva různé modely — nesjednocuj je slepě

Tohle je nejdůležitější věc na téhle předávce.

| | Jack West | SUYS |
|---|---|---|
| **Hlavní mechanismus** | `disables` / `enables` — pole zůstává vidět, jen zšedne | `shows` / `hides` — pole z formuláře zmizí |
| **Omezení nabídky** | vzácné | `restricts` — 68 pravidel mění seznam voleb |
| **Limity rozměrů** | `min`/`max` **přímo na poli** (181×) | vypočítané v `derivedLimits`, na poli nejsou |
| **Skrytá pole** | 71 technických `TEditXXXXX` | 552 interních parametrů |

U Jack Westu tedy validuješ rozměr proti `field.min`/`field.max`; u SUYS musíš sáhnout do `derivedLimits` a vyhodnotit, na čem limit visí. Například `CURTAIN_MAX_WIDTH` = 1700–3200 mm podle typu látky, `CURTAIN_MAX_HEIGHT` navíc podle typu clony a velikosti boxu.

Pokud UI sjednotíš na jeden model, doporučuju **skrývat** (SUYS chování) a `disables` z JW mapovat na skrytí — zamčené šedé pole uživatele mate víc, než když prostě není. Ale je to rozhodnutí, ne fakt z dat.

---

## Jak číst pravidla

Pravidlo je vždy **naměřený stav po nastavení jedné hodnoty**, ne odvozená logika. Sémantika:

- `disables` / `enables` — cílové pole se zamklo / odemklo
- `shows` / `hides` — cílové pole se objevilo / zmizelo
- `restricts` — změnil se seznam voleb; `count: [před, po]`, `removedOptions`, `addedOptions`
- `setsValue` — konfigurátor sám přepsal hodnotu jiného pole (`from` → `to`)
- `limits` — změnilo se `min`/`max` cílového pole
- `requires` / `optional` — změnila se povinnost

`measured` říká, jak důkladně: `full` = projeté všechny hodnoty, `sample` = vzorek tří (u číselníků nad 10 hodnot, kde vzorek neukázal žádný dopad), `escalated` = vzorek něco ukázal, takže se doměřil celý číselník.

**Pozor u `sample`:** u těch polí je nabídka hodnot úplná, ale pravidla nemusí. Šlo o barvy a spínače, kde vzorek nenašel žádný vliv. Kdyby se v aplikaci ukázalo, že tam vliv je, doměření je otázka minut.

---

## Co v datech není

1. **První dávka JW** (10 produktů) — viz výše, dohledat.
2. **Obsah vzorkovníků a skladových karet** — je jen příznak, že pole nějaký má. Katalog látek (801 skladových karet, 765 s obrázkem) a 949 obrázků vzorků čeká na zpracování.
3. **Ceny** — nesbíraly se.
4. **Markovy výjimky** — které z 42 nových produktů a 3 typů SUYS v aplikaci nebudou. U staré dávky to je v `meta.appExclusions`, u nové to teprve vznikne.
5. **Výchozí hodnoty za vyřazená pole** — 17 polí je u staré dávky JW povinných, ale uživateli se nezobrazí. Musí je určit Marek.
6. **Neva** — třetí dodavatel, pole hotová, závislosti chybí.
7. **Popisky u 95 polí JW** — 71 z nich jsou skryté technické inputy, zbylých 24 má aspoň smysluplný kód (Klika, Brzda, Profil, Madlo, Aretace).

---

## Doporučený postup

1. **Načíst oba JSONy jako zdroj pravdy**, ne markdown. MD je pro čtení lidmi.
2. **Postavit generický renderer formuláře** ze schématu pole (`inputType` + `options` + `min`/`max`) — ne 45 ručně psaných formulářů.
3. **Pravidla vyhodnocovat jako tabulku** `(pole, hodnota) → efekty`, ne jako podmínky v kódu. Data mají tvar, který se dá rovnou nasypat do lookup tabulky.
4. **Validaci rozměrů** řešit odděleně pro každého dodavatele podle rozdílu popsaného výše.
5. **Ověřovací test:** projít všechna pravidla a zkontrolovat, že každé cílové `field` existuje ve `fields` daného produktu. Na téhle dávce to vychází na nulu sirotků; pokud po nějaké transformaci vyskočí, něco se rozbilo.

---

## Provenience

Data pocházejí z empirického měření produkčních konfigurátorů, ne z dokumentace dodavatelů:

- **Jack West** — poptávkový formulář `eshop.jackwest.cz`, masky `POST /dynamicMask`, klientský přepočet. 42 produktů, 1 965 měřicích kroků, 29 minut, **0 chyb**.
- **SUYS** — b2b konfigurátor `eshop.b2b-suys.eu` na GraphQL (`configurationParamList` + `configurationParamUpdate`). 3 typy, 251 kroků, **0 chyb**.

Metodika u obou stejná: pro každé pole se pořídí baseline, postupně se nastaví každá hodnota a po každé změně se porovná stav všech polí proti baseline. Baseline musí být per-pole, jinak se efekty kumulují.

Kompletní postup včetně pastí je v projektu Anse: `claude/jackwest-extrakce-stav.md`.
