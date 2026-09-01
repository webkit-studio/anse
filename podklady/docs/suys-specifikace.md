# SUYS — screenové clony: podklad pro aplikaci Anse

> Extrahováno 27. 8. 2026 z b2b konfigurátoru SUYS (`eshop.b2b-suys.eu`). Kategorie **Screenové clony** (`C-SC`). Pomocné profily na míru (`C-PP_01`) nejsou součástí.

## Souhrn

| Typ | Kód | Viditelných polí | Interních parametrů | Pravidel | Odvozených limitů |
|---|---|---:|---:|---:|---:|
| LOCKSCREEN | `C-SC_01` | 27 | 233 | 68 | 9 |
| CABLESCREEN | `C-SC_03` | 21 | 223 | 48 | 9 |
| HANDSCREEN | `C-SC_05` | 11 | 96 | 3 | 0 |
| **celkem** | | **59** | **552** | **119** | |

**Jak to bylo změřeno.** Konfigurátor běží na GraphQL. Celý formulář se čte jedním dotazem (`configurationParamList`), hodnoty se mění mutací (`configurationParamUpdate`). Závislosti jsou naměřené empiricky: u každého pole se postupně nastavila každá hodnota a po každé změně se porovnal stav všech parametrů proti baseline pořízené těsně před tím polem. U číselníků nad 10 hodnot se sáhlo na vzorek tří hodnot a při jakémkoli dopadu se doměřil celý číselník.


---

# LOCKSCREEN (`C-SC_01`)

*Lockscreen s extrudovaným boxem 103 se zipem, s trubkovým pohonem SE Plus 2*

27 viditelných polí v 5 tabech, 233 interních parametrů, 68 naměřených pravidel. Měřeno 135 kroky (572 s), 0 chyb.

## Pole


### ZÁKLADNÍ VOLBY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Množství [ks] | `POCET_MNOZSTVI` | Integer | — | 1 |
| REFERENCE POZICE | `POZICE_REFERENCE` | Text | — | — |
| POZNÁMKA POZICE | `POZNAMKA_K_VYROBKU` | Text | — | — |
| Šířka [mm] | `WIDTH_01` | Integer | — | 1000 |
| Výška [mm] | `HEIGHT_01` | Integer | — | 1000 |
| Typ screenové clony | `TYP_SCREENU` | Text / Slider | 5 | LOCKSCREEN |
| Orientace boxu (pohled z exteriéru) | `ORIENTACE_MONTAZE` | Text / ListBox | 2 | do exteriéru |
| Screenová látka [typ] | `TYP_LATKY_1` | Text / Slider | 9 | Serge 600 |
| Rozměr krycího boxu [mm] | `S_VELIKOST_BOX_1` | Integer / ListBox | 4 | 103 × 103 mm |
| Barva látky | `BARVA_LATKY_1` | Text / Slider | 49 | SE6-001001 |
| Orientace látky (pohled z exteriéru) | `ORIENTACE_LATKY` | Text / ListBox | 2 | Lícem do exteriéru |

### OVLÁDÁNÍ

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Ovládání [typ] | `SHUTTER_OPERATION_01` | Text / Slider | 3 | Elektrický pohon |
| Strana ovládání | `STRANA_OVLADANI_0` | Text / ListBox | 2 | vpravo |
| Vývod ovládání | `STRANA_OVLADANI_2` | Text / Slider | 6 | D+ |
| Elektrický pohon [typ] | `DRIVE_TYPE_01` | Text / ListBox | 3 | elektronický koncový spínač |
| Elektrický pohon [model] | `DRIVE_MODEL_01` | Text / Slider | 3 | SELVE typ SE Plus 2 |
| Délka kabelu | `DRIVE_CAB_LENGTH_01` | Text / Slider | 6 | 2,5 m |

### OVLADAČE

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| 1 - Spínač | `WIRED_CONTROLLER_01` | Text / Slider | 33 | NE |

### ROZŠÍŘENÉ VOLBY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Vrtání krycího boxu | `PREDVRTANI_BOXU` | Text / Slider | 4 | NE |
| Rozdílné vodící lišty | `HE_GL_ROZDILNE` | Text / ListBox | 2 | NE |
| Vodící lišty [typ] | `SC_TYP_GL` | Text / Slider | 2 | GLSZ (32 × 46 mm) |
| Vynášecí konzoly | `SC_VYNAS_KONZ_L` | Text / Slider | 3 | NE |
| Zarážka do vodící lišty | `GL_BOTTOM_PLUG` | Text / Slider | 2 | PVC |
| Vrtání vodicích lišt | `PREDVRTANI_LIST` | Text / ListBox | 9 | NE |
| Koncová lamela [typ] | `TYP_KONCOVE_FIN2` | Text / Slider | 3 | FINSVC (37 × 27 mm) |

### BARVY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Detailní volba | `DET_COLOR_CHOICE` | Text / Slider | 2 | NE |
| Základní barva | `BASIC_COLOR_02` | Text / Color | 49 | 71 sněhově bílá ±RAL9016 |

## Číselníky (do 12 hodnot)

- **Typ screenové clony** — **LOCKSCREEN** (`LOCKSCREEN`), **LOCKSCREEN FASADE** (`LOCKSCREEN F`), **LOCKSCREEN HELUZ** (`LOCKSCREEN H`), **LOCKSCREEN INTEGRATED** (`LOCKSCREEN IN`), **LOCKSCREEN 140** (`LOCKSCREEN 140`)
- **Orientace boxu (pohled z exteriéru)** — **do exteriéru** (`CD`), **do interiéru** (`AB`)
- **Screenová látka [typ]** — **Serge 600** (`SRG05A`), **Serge 1%** (`SRG01A`), **Serge 600 BO Lunar** (`LUN00A`), **Serge 600 BO Solar** (`SOL03A`), **Soltis Veozip** (`SVZ05A`), **Soltis 86 Color, Alu** (`SOL86A`), **Soltis 92 Color, Alu** (`SOL92A`), **Soltis 92 Opaque Alu** (`SOL00A`), **Flexlight 6002 Color, Bicolor** (`STM00A`)
- **Rozměr krycího boxu [mm]** — **89 × 89 mm** (`89`), **103 × 103 mm** (`103`), **120 × 120 mm** (`120`), **131 × 131 mm** (`131`)
- **Orientace látky (pohled z exteriéru)** — **Lícem do exteriéru** (`Confection 1`), **Rubem do exteriéru** (`Confection 2`)
- **Ovládání [typ]** — **Elektrický pohon** (`M`), **Klika** (`T`), **Kompenzační pružina** (`VA`)
- **Strana ovládání** — **vlevo** (`vlevo`), **vpravo** (`vpravo`)
- **Vývod ovládání** — **D+** (`D+`), **AH** (`AH `), **DH25** (`DH25`), **AHZ** (`AHZ`), **DHZ** (`DHZ`), **DGL** (`DGL`)
- **Elektrický pohon [typ]** — **elektronický koncový spínač** (`E`), **elektronický koncový spínač, integrovaný přijímač** (`ER`), **elektronický koncový spínač, integrovaný přijímač, solární panel** (`ERS`)
- **Elektrický pohon [model]** — **SOMFY typ Maestria WT** (`E243`), **SELVE typ SE Plus 2** (`E232`), **SELVE typ SEZ 2** (`E233`)
- **Délka kabelu** — **2,5 m** (`SE290545`), **5 m** (`SE290548`), **10 m** (`SE290549`), **3 m** (`SE290556`), **5 m** (`SE290558`), **10 m** (`SE290559`)
- **Vrtání krycího boxu** — **NE** (`NE`), **B25R** (`B25R`), **B25F** (`B25F`), **A25U** (`A25U`)
- **Rozdílné vodící lišty** — **NE** (`ne`), **ANO** (`ano`)
- **Vodící lišty [typ]** — **GLSZ (32 × 46 mm)** (`GLSZ`), **GLHSZ028 (31 × 34 mm)** (`GLHSZ028`)
- **Vynášecí konzoly** — **NE** (`NE`), **KUSZ032** (`KUSZ032`), **KUSZ064** (`KUSZ064`)
- **Zarážka do vodící lišty** — **PVC** (`AZSZ`), **PVC** (`AZSZ5 `)
- **Vrtání vodicích lišt** — **NE** (`NE`), **[L+P] do okna** (`L_FRONT_R_FRONT`), **[L+P] do ostění** (`L_SIDE_R_SIDE`), **[L] do okna | [P] do ostění** (`L_FRONT_R_SIDE`), **[L] do ostění | [P] do okna** (`L_SIDE_R_FRONT`), **[L] NE | [P] do okna** (`L_NONE_R_FRONT`), **[L] do okna | [P] NE** (`L_FRONT_R_NONE`), **[L] NE | [P] do ostění** (`L_NONE_R_SIDE`), **[L] do ostění | [P] NE** (`L_SIDE_R_NONE`)
- **Koncová lamela [typ]** — **FINSZL (55 × 44 mm)** (`FINSZL`), **FINSVB (35 × 35 mm)** (`FINSVB`), **FINSVC (37 × 27 mm)** (`FINSVC`)
- **Detailní volba** — **NE** (`NE`), **ANO** (`ANO`)


## Dlouhé číselníky

- **Barva látky** (`BARVA_LATKY_1`) — 49 hodnot, např. SE6-001001, SE6-010011, SE6-008002, SE6-008003 …
- **1 - Spínač** (`WIRED_CONTROLLER_01`) — 33 hodnot, např. NE, NEO, ELEMENT, TANGO …
- **Základní barva** (`BASIC_COLOR_02`) — 49 hodnot, např. 01 bílá ±RAL9010, 02 hnědá ±RAL8019, 03 stříbrná ±RAL9006, 04 šedá ±RAL7038 …


## Odvozené limity a výpočty

Konfigurátor je počítá sám a nezobrazuje je. Pro validaci v Anse jsou zásadní.

| Parametr | Závisí na | Rozsah naměřených hodnot |
|---|---|---|
| Max. šířka látky [mm] (`CURTAIN_MAX_WIDTH`) | Screenová látka [typ], Barva látky | 0 – 3200 |
| Max. výška látky [mm] (`CURTAIN_MAX_HEIGHT`) | Typ screenové clony, Screenová látka [typ], Rozměr krycího boxu [mm], Barva látky | 103 – 3640 |
| Max. šířka role tkaniny [mm] (`LATKA_SIRKA_ROLE`) | Screenová látka [typ], Barva látky | 1700 – 3200 |
| Tloušťka látky [mm] (`FABRIC_THICKNESS`) | Screenová látka [typ] | 0.45 – 0.9 |
| Hmotnost pancíře vč. tření X% [kg] (`TOTAL_CURT_WEIGHT_01`) | Typ screenové clony, Screenová látka [typ], Ovládání [typ], Koncová lamela [typ] | 6.44 – 9.55 |
| Kroutící moment [Nm] (`DRIVE_TORQUE_01`) | Typ screenové clony, Screenová látka [typ], Rozměr krycího boxu [mm], Ovládání [typ], Koncová lamela [typ] | 2.023 – 4.686 |
| Kroutící moment [kgfm] (`GEAR_TORQUE_01`) | Typ screenové clony, Screenová látka [typ], Rozměr krycího boxu [mm], Ovládání [typ], Koncová lamela [typ] | 0.206289 – 0.477839 |
| Hmotnost látky [kg/m²] (`FABRIC_SURF_WEIGHT`) | Screenová látka [typ] | 0.38 – 0.678 |
| Tloušťka lamely [mm] (`SLAT_THICKNESS`) | Screenová látka [typ] | 0.45 – 0.9 |


## Pravidla závislostí


### 1 - Spínač (`WIRED_CONTROLLER_01`)

- **Smoove UNO IB+ Silver Shine** → zobrazí 2× interní
- **commeo Receive** → zobrazí 2× interní
- **NEO** → zobrazí 2× interní
- **ELEMENT** → zobrazí 2× interní
- **TANGO** → zobrazí 2× interní
- **TANGO na omítku** → zobrazí 2× interní
- **TIME** → zobrazí 2× interní
- **Plošný spínač BP bez aretace** → zobrazí 2× interní
- **Plošný spínač BP s aretací** → zobrazí 2× interní
- **Smoove Uno WT FP** → zobrazí 2× interní
- **Smoove Uno WT MP** → zobrazí 2× interní
- **Smoove Duo WT FP** → zobrazí 2× interní
- **Smoove Duo WT MP** → zobrazí 2× interní
- **Krabice inteo − bílá** → zobrazí 2× interní
- **Krabice Smoove** → zobrazí 2× interní
- **Smoove Origin IB** → zobrazí 2× interní
- **Smoove UNO IB+ Pure Shine** → zobrazí 2× interní
- **Smoove UNO IB+ Black Shine** → zobrazí 2× interní
- **Ondeis** → zobrazí 2× interní
- **R1J-U-E-230** → zobrazí 2× interní
- **Pure Smoove Frame** → zobrazí 2× interní
- **Black Smoove Frame** → zobrazí 2× interní
- **Silver Mat Smoove Frame** → zobrazí 2× interní
- **Pure Smoove Frame Double** → zobrazí 2× interní
- **Shutter in-wall receiver RTS** → zobrazí 2× interní
- **Slim io receiver Screen + Plug** → zobrazí 2× interní
- **IZYMO™ Shutter Receiver io F/CE/NE/SE** → zobrazí 2× interní
- **Centralis Platine RTS** → zobrazí 2× interní
- **i-Switch** → zobrazí 2× interní
- **Selvetimer Plus** → zobrazí 2× interní
- **Smarttimer Plus** → zobrazí 2× interní
- **i-Light Sensor 5** → zobrazí 2× interní

### Screenová látka [typ] (`TYP_LATKY_1`)

- **Serge 1%** → omezí **Barva látky** (49 → 9); přepne **Barva látky** na `SE1-001001`
- **Serge 600 BO Lunar** → omezí **Barva látky** (49 → 8); přepne **Barva látky** na `LUN-001001`
- **Serge 600 BO Solar** → omezí **Barva látky** (49 → 8); přepne **Barva látky** na `SOL-001001`
- **Soltis Veozip** → omezí **Barva látky** (49 → 15); přepne **Barva látky** na `7605-51184`
- **Soltis 86 Color, Alu** → omezí **Barva látky** (49 → 23); přepne **Barva látky** na `S86-2012`
- **Soltis 92 Color, Alu** → omezí **Barva látky** (49 → 38); přepne **Barva látky** na `S92-2012`
- **Soltis 92 Opaque Alu** → omezí **Barva látky** (49 → 7); přepne **Barva látky** na `B92-1043`
- **Flexlight 6002 Color, Bicolor** → omezí **Barva látky** (49 → 12); přepne **Barva látky** na `STA-20007`

### Vrtání vodicích lišt (`PREDVRTANI_LIST`)

- **[L+P] do okna** → zobrazí 1× interní; skryje 1× interní
- **[L+P] do ostění** → zobrazí 1× interní; skryje 1× interní
- **[L] do okna | [P] do ostění** → zobrazí 1× interní; skryje 1× interní
- **[L] do ostění | [P] do okna** → zobrazí 1× interní; skryje 1× interní
- **[L] NE | [P] do okna** → zobrazí 1× interní; skryje 1× interní
- **[L] do okna | [P] NE** → zobrazí 1× interní; skryje 1× interní
- **[L] NE | [P] do ostění** → zobrazí 1× interní; skryje 1× interní
- **[L] do ostění | [P] NE** → zobrazí 1× interní; skryje 1× interní

### Typ screenové clony (`TYP_SCREENU`)

- **LOCKSCREEN FASADE** → zobrazí 2× interní; skryje 3× interní; omezí **Krycí box [typ]** (1 → 1); omezí **Rozměr krycího boxu [mm]** (4 → 1); omezí **Ovládání [typ]** (3 → 1); omezí **Elektrický pohon [typ]** (3 → 2); omezí **Vodící lišty [typ]** (2 → 1); přepne **Rozměr krycího boxu [mm]** na `131`
- **LOCKSCREEN HELUZ** → zobrazí 2× interní; skryje **Vynášecí konzoly**, **Zarážka do vodící lišty**; omezí **Rozměr krycího boxu [mm]** (4 → 1); omezí **Ovládání [typ]** (3 → 1); přepne **Vodící lišty [typ]** na `GLHSZ028`
- **LOCKSCREEN INTEGRATED** → zobrazí 3× interní; skryje 2× interní; omezí **Krycí box [typ]** (1 → 2); omezí **Rozměr krycího boxu [mm]** (4 → 1); omezí **Ovládání [typ]** (3 → 1); omezí **Vývod ovládání** (6 → 5); omezí **Vrtání krycího boxu** (4 → 3); omezí **Vodící lišty [typ]** (2 → 3); omezí **Koncová lamela [typ]** (3 → 2); přepne **Rozměr krycího boxu [mm]** na `110`
- **LOCKSCREEN 140** → skryje 1× interní; omezí **Rozměr krycího boxu [mm]** (4 → 1); omezí **Ovládání [typ]** (3 → 1); omezí **Elektrický pohon [typ]** (3 → 2); omezí **Vodící lišty [typ]** (2 → 2); omezí **Koncová lamela [typ]** (3 → 1); přepne **Rozměr krycího boxu [mm]** na `140`; přepne **Koncová lamela [typ]** na `FINSZL`

### Rozměr krycího boxu [mm] (`S_VELIKOST_BOX_1`)

- **89 × 89 mm** → skryje **Vrtání krycího boxu**; omezí **Ovládání [typ]** (3 → 2); omezí **Vývod ovládání** (6 → 5)
- **120 × 120 mm** → omezí **Ovládání [typ]** (3 → 2); omezí **Elektrický pohon [typ]** (3 → 2); omezí **Vodící lišty [typ]** (2 → 2)
- **131 × 131 mm** → zobrazí 1× interní; omezí **Ovládání [typ]** (3 → 1); omezí **Elektrický pohon [typ]** (3 → 2)

### Ovládání [typ] (`SHUTTER_OPERATION_01`)

- **Klika** → zobrazí 7× interní; skryje **Elektrický pohon [typ]**, **Elektrický pohon [model]**, **Délka kabelu**, **1 - Spínač** + 16× interní; omezí **Vývod ovládání** (6 → 1); přepne **Vývod ovládání** na `C+ `
- **Kompenzační pružina** → zobrazí 3× interní; skryje **Strana ovládání**, **Vývod ovládání**, **Elektrický pohon [typ]**, **Elektrický pohon [model]**, **Délka kabelu**, **1 - Spínač**, **Vrtání krycího boxu** + 13× interní; omezí **Vodící lišty [typ]** (2 → 1); omezí **Zarážka do vodící lišty** (2 → 1); omezí **Koncová lamela [typ]** (3 → 2); přepne **Zarážka do vodící lišty** na `AZSZ046`

### Elektrický pohon [typ] (`DRIVE_TYPE_01`)

- **elektronický koncový spínač, integrovaný přijímač** → zobrazí 1× interní; omezí **Elektrický pohon [model]** (3 → 6); omezí **Délka kabelu** (6 → 6); přepne **Elektrický pohon [model]** na `ER234`; přepne **Délka kabelu** na `SE290575`
- **elektronický koncový spínač, integrovaný přijímač, solární panel** → zobrazí 3× interní; skryje **Strana ovládání**, **Vývod ovládání**, **1 - Spínač** + 2× interní; omezí **Strana ovládání** (2 → 1); omezí **Vývod ovládání** (6 → 6); omezí **Elektrický pohon [model]** (3 → 1); omezí **Délka kabelu** (6 → 1); přepne **Strana ovládání** na `vpravo`; přepne **Vývod ovládání** na `D+`; přepne **Elektrický pohon [model]** na `S184`; přepne **Délka kabelu** na `CAB0000`

### Vynášecí konzoly (`SC_VYNAS_KONZ_L`)

- **KUSZ032** → zobrazí 1× interní
- **KUSZ064** → zobrazí 1× interní

### Orientace boxu (pohled z exteriéru) (`ORIENTACE_MONTAZE`)

- **do interiéru** → omezí **Vývod ovládání** (6 → 6); omezí **Zarážka do vodící lišty** (2 → 2); přepne **Vývod ovládání** na `A`

### Strana ovládání (`STRANA_OVLADANI_0`)

- **vpravo** → omezí **Vývod ovládání** (6 → 6); přepne **Vývod ovládání** na `D+`

### Elektrický pohon [model] (`DRIVE_MODEL_01`)

- **SOMFY typ Maestria WT** → omezí **Délka kabelu** (6 → 3); přepne **Délka kabelu** na `S9203803`

### Rozdílné vodící lišty (`HE_GL_ROZDILNE`)

- **ANO** → zobrazí 3× interní; skryje **Vodící lišty [typ]**, **Zarážka do vodící lišty**

### Vodící lišty [typ] (`SC_TYP_GL`)

- **GLHSZ028 (31 × 34 mm)** → zobrazí 1× interní; skryje **Vynášecí konzoly**, **Zarážka do vodící lišty**

### Detailní volba (`DET_COLOR_CHOICE`)

- **ANO** → zobrazí 14× interní; skryje **Základní barva** + 14× interní

### Základní barva (`BASIC_COLOR_02`)

- **99 lakováno** → zobrazí 10× interní; skryje 8× interní


---

# CABLESCREEN (`C-SC_03`)

*Cablescreen s extrudovaným boxem 089 s lankem, s trubkovým pohonem SE Plus 2*

21 viditelných polí v 5 tabech, 223 interních parametrů, 48 naměřených pravidel. Měřeno 103 kroky (381 s), 0 chyb.

## Pole


### ZÁKLADNÍ VOLBY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Množství [ks] | `POCET_MNOZSTVI` | Integer | — | 1 |
| REFERENCE POZICE | `POZICE_REFERENCE` | Text | — | — |
| POZNÁMKA POZICE | `POZNAMKA_K_VYROBKU` | Text | — | — |
| Šířka [mm] | `WIDTH_01` | Integer | — | 1000 |
| Výška [mm] | `HEIGHT_01` | Integer | — | 1000 |
| Typ screenové clony | `TYP_SCREENU` | Text / Slider | 3 | CABLESCREEN |
| Orientace boxu (pohled z exteriéru) | `ORIENTACE_MONTAZE` | Text / ListBox | 2 | do exteriéru |
| Screenová látka [typ] | `TYP_LATKY_1` | Text / Slider | 9 | Serge 600 |
| Barva látky | `BARVA_LATKY_1` | Text / Slider | 49 | SE6-001001 |
| Orientace látky (pohled z exteriéru) | `ORIENTACE_LATKY` | Text / ListBox | 2 | Lícem do exteriéru |

### OVLÁDÁNÍ

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Ovládání [typ] | `SHUTTER_OPERATION_01` | Text / Slider | 2 | Elektrický pohon |
| Strana ovládání | `STRANA_OVLADANI_0` | Text / ListBox | 2 | vpravo |
| Vývod ovládání | `STRANA_OVLADANI_2` | Text / Slider | 3 | D+ |
| Elektrický pohon [typ] | `DRIVE_TYPE_01` | Text / ListBox | 3 | elektronický koncový spínač |
| Elektrický pohon [model] | `DRIVE_MODEL_01` | Text / Slider | 3 | SELVE typ SE Plus 2 |
| Délka kabelu | `DRIVE_CAB_LENGTH_01` | Text / Slider | 6 | 2,5 m |

### OVLADAČE

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| 1 - Spínač | `WIRED_CONTROLLER_01` | Text / Slider | 33 | NE |

### ROZŠÍŘENÉ VOLBY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Rozměr krycího boxu [mm] | `S_VELIKOST_BOX_1` | Integer / ListBox | 3 | 89 × 89 mm |
| Koncová lamela [typ] | `TYP_KONCOVE_FIN2` | Text / Slider | 2 | FINSVC (37 × 27 mm) |

### BARVY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Detailní volba | `DET_COLOR_CHOICE` | Text / Slider | 2 | NE |
| Základní barva | `BASIC_COLOR_02` | Text / Color | 50 | 71 sněhově bílá ±RAL9016 |

## Číselníky (do 12 hodnot)

- **Typ screenové clony** — **CABLESCREEN** (`CABLESCREEN`), **CABLESCREEN INTEGRATED** (`CABLESCREEN IN`), **CABLESCREEN K** (`CABLESCREEN K`)
- **Orientace boxu (pohled z exteriéru)** — **do exteriéru** (`CD`), **do interiéru** (`AB`)
- **Screenová látka [typ]** — **Serge 600** (`SRG05A`), **Serge 1%** (`SRG01A`), **Serge 600 BO Lunar** (`LUN00A`), **Serge 600 BO Solar** (`SOL03A`), **Soltis Veozip** (`SVZ05A`), **Soltis 86 Color, Alu** (`SOL86A`), **Soltis 92 Color, Alu** (`SOL92A`), **Soltis 92 Opaque Alu** (`SOL00A`), **Flexlight 6002 Color, Bicolor** (`STM00A`)
- **Orientace látky (pohled z exteriéru)** — **Lícem do exteriéru** (`Confection 1`), **Rubem do exteriéru** (`Confection 2`)
- **Ovládání [typ]** — **Elektrický pohon** (`M`), **Klika** (`T`)
- **Strana ovládání** — **vlevo** (`vlevo`), **vpravo** (`vpravo`)
- **Vývod ovládání** — **D+** (`D+`), **AH** (`AH `), **AHZ** (`AHZ`)
- **Elektrický pohon [typ]** — **elektronický koncový spínač** (`E`), **elektronický koncový spínač, integrovaný přijímač** (`ER`), **elektronický koncový spínač, integrovaný přijímač, solární panel** (`ERS`)
- **Elektrický pohon [model]** — **SOMFY typ Maestria WT** (`E243`), **SELVE typ SE Plus 2** (`E232`), **SELVE typ SEZ 2** (`E233`)
- **Délka kabelu** — **2,5 m** (`SE290545`), **5 m** (`SE290548`), **10 m** (`SE290549`), **3 m** (`SE290556`), **5 m** (`SE290558`), **10 m** (`SE290559`)
- **Rozměr krycího boxu [mm]** — **89 × 89 mm** (`89`), **103 × 103 mm** (`103`), **131 × 131 mm** (`131`)
- **Koncová lamela [typ]** — **FINSVB (35 × 35 mm)** (`FINSVB`), **FINSVC (37 × 27 mm)** (`FINSVC`)
- **Detailní volba** — **NE** (`NE`), **ANO** (`ANO`)


## Dlouhé číselníky

- **Barva látky** (`BARVA_LATKY_1`) — 49 hodnot, např. SE6-001001, SE6-010011, SE6-008002, SE6-008003 …
- **1 - Spínač** (`WIRED_CONTROLLER_01`) — 33 hodnot, např. NE, NEO, ELEMENT, TANGO …
- **Základní barva** (`BASIC_COLOR_02`) — 50 hodnot, např. 01 bílá ±RAL9010, 02 hnědá ±RAL8019, 03 stříbrná ±RAL9006, 04 šedá ±RAL7038 …


## Odvozené limity a výpočty

Konfigurátor je počítá sám a nezobrazuje je. Pro validaci v Anse jsou zásadní.

| Parametr | Závisí na | Rozsah naměřených hodnot |
|---|---|---|
| Max. šířka látky [mm] (`CURTAIN_MAX_WIDTH`) | Screenová látka [typ], Barva látky | 0 – 3200 |
| Max. výška látky [mm] (`CURTAIN_MAX_HEIGHT`) | Typ screenové clony, Screenová látka [typ], Barva látky, Rozměr krycího boxu [mm] | 89 – 3631 |
| Max. šířka role tkaniny [mm] (`LATKA_SIRKA_ROLE`) | Screenová látka [typ], Barva látky | 1700 – 3200 |
| Tloušťka látky [mm] (`FABRIC_THICKNESS`) | Screenová látka [typ] | 0.45 – 0.9 |
| Hmotnost pancíře vč. tření X% [kg] (`TOTAL_CURT_WEIGHT_01`) | Screenová látka [typ], Koncová lamela [typ] | 4.85 – 5.41 |
| Kroutící moment [Nm] (`DRIVE_TORQUE_01`) | Typ screenové clony, Screenová látka [typ], Rozměr krycího boxu [mm], Koncová lamela [typ] | 1.52 – 2.333 |
| Kroutící moment [kgfm] (`GEAR_TORQUE_01`) | Typ screenové clony, Screenová látka [typ], Rozměr krycího boxu [mm], Koncová lamela [typ] | 0.154997 – 0.2379 |
| Hmotnost látky [kg/m²] (`FABRIC_SURF_WEIGHT`) | Screenová látka [typ] | 0.38 – 0.678 |
| Tloušťka lamely [mm] (`SLAT_THICKNESS`) | Screenová látka [typ] | 0.45 – 0.9 |


## Pravidla závislostí


### Elektrický pohon [model] (`DRIVE_MODEL_01`)

- **SOMFY typ Solus** → zobrazí **1 - Spínač**; omezí **Délka kabelu** (1 → 1); omezí **RADIO_CONTROLLER_01** (23 → 89); přepne **Délka kabelu** na `CAB2500`
- **SELVE typ SE Plus 2** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290545`
- **SIMU typ T8 S DMI [NHK]** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 51); přepne **Délka kabelu** na ``
- **SOMFY typ Oximo WT** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 3); přepne **Délka kabelu** na `S9203803`
- **SOMFY typ Ilmo2 WT** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 3); přepne **Délka kabelu** na `S9203803`
- **SOMFY typ Maestria WT** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 3); přepne **Délka kabelu** na `S9203803`
- **SOMFY typ Oximo io** → omezí **Délka kabelu** (1 → 4); přepne **Délka kabelu** na `S9203895`
- **SOMFY typ Oximo 40 Solar io** → zobrazí 1× interní; skryje 1× interní
- **SOMFY typ S&SO RS100 io** → omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `S9018464`
- **SOMFY typ S&SO RS100 io Hybrid** → omezí **Délka kabelu** (1 → 3); přepne **Délka kabelu** na `S9018611`
- **SOMFY typ RS100 Solar io** → omezí **Délka kabelu** (1 → 3)
- **SOMFY typ Maestria+ io** → omezí **Délka kabelu** (1 → 3); přepne **Délka kabelu** na `S9203863`
- **SOMFY typ Oximo RTS** → omezí **Délka kabelu** (1 → 4); omezí **RADIO_CONTROLLER_01** (23 → 18); přepne **Délka kabelu** na `S9203895`
- **SOMFY typ Altus RTS** → omezí **Délka kabelu** (1 → 4); omezí **RADIO_CONTROLLER_01** (23 → 18); přepne **Délka kabelu** na `S9203895`
- **SELVE typ SP 2** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290545`
- **SELVE typ SEZ 2** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290545`
- **SELVE typ SE Pro 2** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290545`
- **SELVE typ SE Plus 2-RC** → zobrazí **1 - Spínač** + 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290575`
- **SELVE typ SEZ 2-RC** → zobrazí **1 - Spínač** + 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290575`
- **SELVE typ SE Pro 2-RC** → zobrazí **1 - Spínač** + 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290575`
- **SELVE typ SE Breeze 2-com** → zobrazí **1 - Spínač** + 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 6); přepne **Délka kabelu** na `SE290575`
- **SELVE typ SP 2 NHK** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 51); přepne **Délka kabelu** na ``
- **SELVE typ SP 3 NHK** → zobrazí **1 - Spínač**; skryje 1× interní; omezí **Délka kabelu** (1 → 51); přepne **Délka kabelu** na ``
- **GEIGER SOLIDLine-SOC Flex AIR** → zobrazí 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 1); přepne **Délka kabelu** na `M56E699`
- **GEIGER SOLIDline Zip AIR** → zobrazí 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 1); přepne **Délka kabelu** na `M56E699`
- **BECKER typ R-C18 CentronicPLUS** → zobrazí 1× interní; skryje 1× interní; omezí **Délka kabelu** (1 → 3); přepne **Délka kabelu** na `ELE20102704420`
- **SUYS 35 Solar Radio+** → zobrazí 3× interní; skryje 3× interní

### Screenová látka [typ] (`TYP_LATKY_1`)

- **Serge 1%** → omezí **Barva látky** (49 → 9); přepne **Barva látky** na `SE1-001001`
- **Serge 600 BO Lunar** → omezí **Barva látky** (49 → 8); přepne **Barva látky** na `LUN-001001`
- **Serge 600 BO Solar** → omezí **Barva látky** (49 → 8); přepne **Barva látky** na `SOL-001001`
- **Soltis Veozip** → omezí **Barva látky** (49 → 15); přepne **Barva látky** na `7605-51184`
- **Soltis 86 Color, Alu** → omezí **Barva látky** (49 → 23); přepne **Barva látky** na `S86-2012`
- **Soltis 92 Color, Alu** → omezí **Barva látky** (49 → 38); přepne **Barva látky** na `S92-2012`
- **Soltis 92 Opaque Alu** → omezí **Barva látky** (49 → 7); přepne **Barva látky** na `B92-1043`
- **Flexlight 6002 Color, Bicolor** → omezí **Barva látky** (49 → 12); přepne **Barva látky** na `STA-20007`

### Elektrický pohon [typ] (`DRIVE_TYPE_01`)

- **elektronický koncový spínač** → omezí **Elektrický pohon [model]** (28 → 3)
- **elektronický koncový spínač, integrovaný přijímač** → zobrazí 1× interní; omezí **Elektrický pohon [model]** (28 → 5); omezí **Délka kabelu** (6 → 6); přepne **Elektrický pohon [model]** na `ER234`; přepne **Délka kabelu** na `SE290575`
- **elektronický koncový spínač, integrovaný přijímač, solární panel** → zobrazí 3× interní; skryje **Strana ovládání**, **Vývod ovládání**, **1 - Spínač** + 2× interní; omezí **Strana ovládání** (2 → 1); omezí **Vývod ovládání** (3 → 3); omezí **Elektrický pohon [model]** (28 → 1); omezí **Délka kabelu** (6 → 1); přepne **Strana ovládání** na `vpravo`; přepne **Vývod ovládání** na `D+`; přepne **Elektrický pohon [model]** na `S184`; přepne **Délka kabelu** na `CAB0000`

### Typ screenové clony (`TYP_SCREENU`)

- **CABLESCREEN INTEGRATED** → zobrazí 2× interní; skryje 2× interní; omezí **Krycí box [typ]** (1 → 2); omezí **Ovládání [typ]** (2 → 1); omezí **Vývod ovládání** (3 → 1); omezí **Rozměr krycího boxu [mm]** (3 → 1); omezí **Základní barva** (50 → 49); přepne **Vývod ovládání** na `BH `; přepne **Rozměr krycího boxu [mm]** na `110`
- **CABLESCREEN K** → zobrazí 6× interní; skryje **Základní barva** + 5× interní; omezí **Krycí box [typ]** (1 → 1); omezí **Ovládání [typ]** (2 → 1); omezí **Vývod ovládání** (3 → 6); omezí **Elektrický pohon [typ]** (3 → 2); omezí **Rozměr krycího boxu [mm]** (3 → 2); omezí **Detailní volba** (2 → 1); přepne **Rozměr krycího boxu [mm]** na `100`; přepne **Detailní volba** na `ANO`

### Rozměr krycího boxu [mm] (`S_VELIKOST_BOX_1`)

- **103 × 103 mm** → zobrazí **1 - Spínač**; skryje 3× interní; omezí **Elektrický pohon [typ]** (5 → 3); omezí **Elektrický pohon [model]** (28 → 3); omezí **Délka kabelu** (1 → 6); přepne **Elektrický pohon [typ]** na `E`; přepne **Elektrický pohon [model]** na `E232`; přepne **Délka kabelu** na `SE290545`
- **131 × 131 mm** → zobrazí **1 - Spínač**; skryje 3× interní; omezí **Ovládání [typ]** (2 → 1); omezí **Elektrický pohon [typ]** (5 → 2); omezí **Elektrický pohon [model]** (28 → 3); omezí **Délka kabelu** (1 → 6); přepne **Elektrický pohon [typ]** na `E`; přepne **Elektrický pohon [model]** na `E232`; přepne **Délka kabelu** na `SE290545`

### Základní barva (`BASIC_COLOR_02`)

- **potaženo fólií** → zobrazí 1× interní; skryje 1× interní
- **99 lakováno** → zobrazí 10× interní; skryje 8× interní

### Orientace boxu (pohled z exteriéru) (`ORIENTACE_MONTAZE`)

- **do interiéru** → omezí **Vývod ovládání** (3 → 3); přepne **Vývod ovládání** na `A`

### Ovládání [typ] (`SHUTTER_OPERATION_01`)

- **Klika** → zobrazí 7× interní; skryje **Elektrický pohon [typ]**, **Elektrický pohon [model]**, **Délka kabelu**, **1 - Spínač** + 16× interní; omezí **Vývod ovládání** (3 → 1); přepne **Vývod ovládání** na `C+ `

### Strana ovládání (`STRANA_OVLADANI_0`)

- **vpravo** → omezí **Vývod ovládání** (3 → 3); přepne **Vývod ovládání** na `D+`

### Detailní volba (`DET_COLOR_CHOICE`)

- **ANO** → zobrazí 4× interní; skryje **Základní barva** + 4× interní


---

# HANDSCREEN (`C-SC_05`)

*Screen s extrudovaným boxem 070 bez zipu, ovládaný pružinou*

11 viditelných polí v 2 tabech, 96 interních parametrů, 3 naměřených pravidel. Měřeno 13 kroky (49 s), 0 chyb.

## Pole


### ZÁKLADNÍ VOLBY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Množství [ks] | `POCET_MNOZSTVI` | Integer | — | 1 |
| REFERENCE POZICE | `POZICE_REFERENCE` | Text | — | — |
| POZNÁMKA POZICE | `POZNAMKA_K_VYROBKU` | Text | — | — |
| Šířka [mm] | `WIDTH_01` | Integer | — | 800 |
| Výška [mm] | `HEIGHT_01` | Integer | — | 800 |
| Screenová látka [typ] | `TYP_LATKY_1` | Text / Slider | 4 | Serge 600 |
| Barva látky | `BARVA_LATKY_1` | Text / Slider | 49 | SE6-001001 |
| Orientace látky (pohled z exteriéru) | `ORIENTACE_LATKY` | Text / ListBox | 2 | Lícem do exteriéru |
| Poziční háčky [ks] | `SC_POCET_HACKU` | Text / ListBox | 3 | 4 |
| Stahovací popruh | `STAHOVACI_POPRUH` | Text / Slider | 2 | NE |

### BARVY

| Pole | Kód | Typ | Volby | Výchozí |
|---|---|---|---|---|
| Základní barva | `BASIC_COLOR_03` | Text / Color | 5 | 71 sněhově bílá ±RAL9016 |

## Číselníky (do 12 hodnot)

- **Screenová látka [typ]** — **Serge 600** (`SRG05A`), **Serge 1%** (`SRG01A`), **Soltis 86 Color, Alu** (`SOL86A`), **Soltis 92 Color, Alu** (`SOL92A`)
- **Orientace látky (pohled z exteriéru)** — **Lícem do exteriéru** (`Confection 1`), **Rubem do exteriéru** (`Confection 2`)
- **Poziční háčky [ks]** — **4** (`4`), **6** (`6`), **8** (`8`)
- **Stahovací popruh** — **NE** (`NE`), **ANO** (`ANO`)
- **Základní barva** — **03 stříbrná ±RAL9006** (`03`), **28 antuková hnědá RAL8003** (`28`), **67 antracitová šedá RAL7016** (`67`), **71 sněhově bílá ±RAL9016** (`71`), **88 sépiová hnědá RAL8014** (`88`)


## Dlouhé číselníky

- **Barva látky** (`BARVA_LATKY_1`) — 49 hodnot, např. SE6-001001, SE6-010011, SE6-008002, SE6-008003 …


## Pravidla závislostí


### Screenová látka [typ] (`TYP_LATKY_1`)

- **Serge 1%** → omezí **Barva látky** (49 → 9); přepne **Barva látky** na `SE1-001001`
- **Soltis 86 Color, Alu** → omezí **Barva látky** (49 → 23); přepne **Barva látky** na `S86-2012`
- **Soltis 92 Color, Alu** → omezí **Barva látky** (49 → 38); přepne **Barva látky** na `S92-2012`
