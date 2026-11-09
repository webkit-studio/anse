# Session štafety: hlavička promptu a šablona issue

## Hlavička promptu

Celé zadání patří do issue, ne do promptu. Issue přežije restart, prompt ne.

```
Jsi session <KÓD> štafety projektu Anse (repo webkit-studio/anse). Lukáš
u chatu není – na nic nečekej, otázky piš do issue a dokonči, co jde.
Effort <high|xhigh> – pracuj důkladně, ale čti jen to, co potřebuješ.

Řiď se protokolem v docs/pipeline.md (kroky 0–8). Přečti CLAUDE.md, sekci
Stav v docs/roadmap.md a issue #<N> – celé zadání je tam. Tajemství ber jen
z prostředí, nikdy je nevypisuj ani nezapisuj.

Issue: #<N>
Lane: <A | B>
Schválený návrh: <odkaz | nepotřeba – důvod>
Rezervovaná migrace: <NNN | žádná>
Sady testů: <npm test | + validate:definitions | + test:e2e>
Další v lane: <KÓD #N | konec lane>
Nesahej na: <soubory souběžné lane>
```

## Šablona issue session

```markdown
# <KÓD> · <název>

**Model:** claude-opus-5-5 · effort <high|xhigh>
**Lane:** <A|B> · **Další v lane:** <KÓD #N | konec>
**Závisí na:** <#N | nic>
**Schválený návrh:** <odkaz na komentář „schváleno" | nepotřeba – důvod>
**Migrace:** <NNN | žádná>
**Sady testů:** <…>
**Stav:** čeká

## Proč
> <citace Lukáše>

## Zadání
- …

## Mimo rozsah
- …

## Hotovo znamená
- [ ] <ověřitelné kritérium>
- [ ] Brány z docs/pipeline.md zelené, mergnuto do main
- [ ] Produkce ověřena (asset, /api/health, /api/me 401, smoke)
- [ ] Snímky před/po u UI, porovnané se schváleným návrhem
```

## Zadané session

| Kód | Issue |
|---|---|
| S01 | #2 |
| S02 | #3 |
| S03 | #4 |
| S04 | #5 |
