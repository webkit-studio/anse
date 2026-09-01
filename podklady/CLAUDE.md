# CLAUDE.md — anse-podklady

Repo s **daty**, ne s aplikací. Obsahuje strojově čitelné podklady dodavatelů pro konfigurátor Anse.

## Pravidla

- **Zdroj pravdy jsou JSONy v `data/`.** Markdown v `docs/` je odvozený, pro čtení lidmi — nikdy z něj neparsuj.
- **Data se needitují ručně.** Vznikla měřením konfigurátorů; ruční zásah rozbije provenienci. Oprava = přeměřit.
- **`data/*/raw/` neupravuj vůbec.** Je to záloha surových měření.
- Před prací si přečti `docs/datovy-model.md` — popisuje schéma i past se dvěma různými modely (Jack West zamyká pole, SUYS je skrývá).

## Ověřovací test

Každé pravidlo odkazuje na cílové pole. Po jakékoli transformaci musí platit, že každý `field` v `rules[].then.*[].field` existuje ve `fields` téhož produktu. Na dodaných datech je sirotků nula.
