# Konfigurátor — nálezy z podkladů (noc 1.–2. 9. 2026)

Co vyplynulo z ověřování scrapovaných podkladů (`podklady/`) a návodů
(`navody/`) při stavbě konfigurátoru. Vše níže je **změřeno skriptem nad
ostrými daty**, ne opsáno z průvodní dokumentace — kde se lišila, platí data.

## Počty (sedí s dokumentací)

- Jack West dávka 2: **42 produktů, 1 483 polí, 1 052 pravidel**
- SUYS: **3 produkty, 59 viditelných polí, 119 pravidel** + odvozené limity

## Kde se dokumentace mýlila nebo mlčela

1. **„0 sirotků" platí jen pro Jack West.** U SUYS míří 253 odkazů pravidel
   na pole mimo snapshot — je to **52 unikátních dynamických parametrů**
   (kliky, doplňkové barvy…), které konfigurátor vytváří za běhu a scraper je
   nezachytil. Evidujeme je jako `latentTargets` (C-SC_01: 48, C-SC_03: 28,
   C-SC_05: 0) a hlídá je snapshot test — tichá změna počtu = přeměřit.
2. **`step` a `maxLength` jsou v dávce 2 vždy `null`**, přestože dokumentace
   tvrdila opak. Nevalidujeme je.
3. **Rozměry kreslí editor výrobce jako textová pole** — min/max limity leží
   vedle pole, ne na typu vstupu. 128 „textových" polí s limity + 19 jasných
   rozměrů bez limitů překlápí loader na čísla; jinak by validace rozsahů
   mlčky propadla (ověřeno testem: šířka 9 999 mm by prošla).
4. **SUYS hodnota limitu „0" znamená „nepodařilo se odečíst"**, ne nulu.
   Takové kombinace jen varují („ověř u dodavatele"), neblokují uložení.
5. **`measured: "sample"`** — část pravidel Jack West vznikla z vzorku
   3 hodnot číselníku (plné proměření jen při nálezu). U vzorkovaných polí
   můžou chybět pravidla pro neproměřené hodnoty; formulář pak prostě
   nic neskryje/nezamkne (bezpečný směr).
6. **~95 polí Jack West má popisek shodný s kódem** (např. „RAL SP") —
   zobrazujeme je tak, jak je zná výrobce; technici je znají z papíru.

## Katalog vs. naměřené produkty

- `katalog-52-produktu.json` je identifikační seznam poptávkového formuláře;
  proti dávce 2 nesedí: **„SMART "** má v katalogu koncovou mezeru,
  **„H21 sv"** v katalogu není vůbec.
- **Dávka 1 (10 produktů) se ztratila** — PK, SEL-15, ESD, H21, H21L, HO21,
  HOK21, RKPA39, RFPA39, NDRF39 nejsou naměřené. SEL-15, ESD a Plissé klasik
  drží ruční JSON definice; Harmony a PA39 rolety zatím nemají formulář.

## Návody

- Na disku 52 složek; **6 chybí** (upload je nezvládl): okenni-site-seho,
  okenni-site-sel-13, okenni-site-sel-15, okenni-site-sel-lux,
  motory-a-ovladace, motory-a-ovladace-ke-garazovym-roletam.
  `fulltext.json` je má (639 sekcí vs. 592 na disku) — hledání je najde,
  otevření ukáže „zatím není nahraný". Po doplnění složek začnou fungovat
  bez zásahu do kódu.
- Párování podkategorie → návod: `src/navody-mapa.json`, 36 klíčů ověřených
  skriptem proti podkladům i indexu. **ESD vs. PD** (dvě interiérové
  horizontální žaluzie) rozlišeno podle textu příplatků výrobce: domykavá
  bez lišty = ESD, s krycí lištou = PD.
- Nenapárované slugy: Harmony ×3 a PA39 ×5 (produkty ze ztracené dávky 1),
  `do-prekladu-heluz` (nemá vlastní produkt v katalogu).
- Dokumenty „Příplatky" jsou z veřejného webu výrobce a **neobsahují částky**
  (jen seznam příplatkových položek) — v repu zůstávají.

## Očištění veřejného repa

Obchodní pole dodavatelů (marže, dealerské měny, cenové kódy) jsou odstraněná
z podkladů i **z celé git historie** (upload commity squashnuté do jednoho
čistého importu, force push). Pozn.: GitHub může staré commity držet dočasně
dostupné přes přímé SHA, dokud neproběhne jeho garbage collection — případně
jde požádat support o okamžité smazání.
