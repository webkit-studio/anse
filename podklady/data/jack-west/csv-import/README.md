# Vzory importních CSV od Jack Westu

Soubory, které vyexportoval **sám portál** JW (poptávka → vyplnit první položku →
uložit → *Export CSV*). Jsou to jediné podklady, podle kterých se dá skládat
soubor pro `Import CSV`, protože názvy sloupců i přípustné hodnoty se liší
výrobek od výrobku.

- `esd-vzor.csv` — ESD, od V. Syryčanské (JW), 3. 9. 2026

Neupravovat: test `shared/jw-csv.test.ts` proti nim skládá soubor znovu a
porovnává, takže úprava vzoru rozbije kontrolu, která nás hlídá.

Chybí vzor pro `SEL-15` (dnes odvozený z naměřené masky SEL-13). Postup a
souvislosti: `docs/jackwest-import-csv.md`.
