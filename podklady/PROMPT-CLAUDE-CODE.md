# Prompt pro Claude Code

Zkopíruj obsah bloku níž do Claude Code v adresáři, kde chceš datovou vrstvu stavět.
Před odesláním doplň řádek **Kontext projektu** — bez něj Claude Code neví, do čeho to má zapojit.

---

```
Mám repo s podklady pro konfigurátor: https://github.com/<uživatel>/anse-podklady
(nebo lokálně: ~/Downloads/anse-podklady)

Kontext projektu: <DOPLŇ — jaký stack má Anse, jestli už kód existuje,
kam datová vrstva patří. Když stavíš na zelené louce, napiš to.>

Úkol: postav nad těmi daty datovou vrstvu — typy, loader, validátor a vyhodnocovač
pravidel. Ne UI, to přijde potom.

Začni tím, že si přečteš docs/datovy-model.md. Popisuje schéma obou JSONů a jednu
past, na kterou si dej pozor: Jack West a SUYS mají různý model závislostí. Jack West
pole zamyká (disables/enables, 724 pravidel) a nese min/max přímo na poli u 181 polí.
SUYS pole skrývá (hides/shows) a limity má vypočítané zvlášť v derivedLimits, na poli
žádné nejsou. Nesjednocuj to slepě do jednoho tvaru — rozbiješ tím validaci rozměrů
u jednoho z dodavatelů.

Co potřebuju:

1. TypeScript typy pro obě schémata (data/jack-west/produkty-davka-2.json
   a data/suys/produkty.json). Odvoď je z dat, ne z dokumentace — když se liší,
   platí data, a řekni mi kde.

2. Loader, který oba soubory načte do jednoho vnitřního tvaru. Kde se modely liší,
   drž rozdíl explicitně (např. discriminated union podle dodavatele), ať je
   v kódu vidět, že Jack West a SUYS se chovají jinak.

3. Vyhodnocovač pravidel: na vstup stav konfigurace (mapa kód pole → hodnota),
   na výstup pro každé pole, jestli je viditelné, zamčené, povinné, jaká je jeho
   aktuální nabídka voleb a jaké má min/max. Pravidla jsou naměřené dvojice
   (pole, hodnota) → efekty, takže je ber jako lookup tabulku, ne jako podmínky
   psané v kódu.

4. Validátor rozměrů. U Jack Westu z field.min/field.max, u SUYS z derivedLimits —
   tam limit visí na hodnotě jiného pole (např. CURTAIN_MAX_WIDTH je 1700–3200 mm
   podle typu látky, CURTAIN_MAX_HEIGHT navíc podle typu clony a velikosti boxu).

5. Testy. Jeden z nich povinně: projít všechna pravidla a ověřit, že každé cílové
   pole existuje ve fields daného produktu. Na dodaných datech to vychází na nulu
   sirotků, takže když test spadne, rozbila to transformace.

Až to bude stát, napiš mi krátce, na co jsi v datech narazil — nekonzistence,
pole bez popisku, pravidla, která si odporují. Zajímá mě to víc než hlášení,
že vše proběhlo v pořádku.
```

---

## Čísla, kdyby se hodila

| Dodavatel | Produktů | Polí | Pravidel | Chyb při měření |
|---|---:|---:|---:|---:|
| Jack West — dávka 2 | 42 | 1 483 | 1 052 | 0 |
| SUYS | 3 | 59 | 119 | 0 |

Rozložení efektů — Jack West: `disables` 724, `enables` 309, `shows` 192, `setsValue` 112, `hides` 41, `limits` 26. SUYS: `shows` 84, `restricts` 68, `setsValue` 63, `hides` 48.

## Co Claude Code v datech nenajde

Dávku 1 Jack Westu (10 produktů z 11. 8.), obsah vzorkovníků a skladových karet, ceny, Nevu a seznam vyřazených polí od Marka. Podrobně v `README.md`.
