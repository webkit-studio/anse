# Montážní návody Jack West — podklady pro aplikaci Anse

Automaticky vytěženo z veřejného webu **jackwest.cz** (produktová stránka → *Ke stažení*).
Zdrojová PDF jsou vektorová, obrázky jsou renderované z vektoru na 220 DPI —
kdykoliv se dají přegenerovat v jiném rozlišení nebo jako SVG (`rozsekej.py`).

**59 produktů · 326 dokumentů · 639 sekcí**

```
navody/
  index.json          katalog produktů → dokumenty (start tady)
  fulltext.json       plochý seznam všech sekcí s textem pro vyhledávání
  prohlizec.html      offline prohlížeč — otevřít v prohlížeči, filtrovat, klikat
  rozsekej.py         skript, kterým to vzniklo
  <slug-produktu>/
    <dokument>.json   manifest dokumentu: pořadí a obsah sekcí
    <dokument>__s01.png
```

`<slug-produktu>` je shodný s URL: `jackwest.cz/produkt/<slug>`.

## index.json

```json
{
  "zdroj": "https://www.jackwest.cz",
  "produktu": 59, "dokumentu": 326, "sekci": 639,
  "produkty": [
    {
      "slug": "okenni-site-sel-15",
      "nazev": "Okenní sítě SEL-15",
      "kategorie": "Okenní sítě",
      "url": "https://www.jackwest.cz/produkt/okenni-site-sel-15",
      "dokumenty": [
        { "soubor": "mn.pdf", "nazev": "Vyměřovací a montážní návod (pdf)",
          "manifest": "mn.json", "sekci": 2,
          "zdroj_pdf": "/data/products/okenni-site-sel-15/downloads/mn.pdf" }
      ]
    }
  ]
}
```

Klíč `prevzato_z` u dokumentu znamená, že totéž PDF visí u víc produktů —
soubory jsou zkopírované, hodnota říká, u kterého produktu je originál.

## Manifest dokumentu

```json
{
  "slug": "plisse-zimni-zahrada",
  "dokument": "mn.pdf",
  "nazev": "Montážní návod a způsoby montáže (pdf)",
  "sekci": 7,
  "sekce": [
    {
      "id": "mn__s04",
      "strana": 1,
      "pokracovani": false,
      "h1": "Montážní návod",
      "h2": null,
      "krok": "2. Instalace kostky pro uchycení botiček",
      "varianta": "A",
      "nadpis": "2. Instalace kostky pro uchycení botiček",
      "popisky": ["Kostka uchycena přímo do koncového profilu", "(4× pro každé pole)"],
      "poznamky": ["POZOR na výšku látky 20 / 26 mm"],
      "kotace": ["4x", "10 / 13"],
      "obrazek": "mn__s04.png",
      "px": [1553, 826]
    }
  ]
}
```

| pole | význam |
|---|---|
| `id` | jednoznačné v rámci dokumentu, odpovídá názvu obrázku |
| `strana` | číslo stránky zdrojového PDF |
| `pokracovani` | `true` = navazuje na předchozí sekci se stejným nadpisem (rozdělený dlouhý text) |
| `h1` | hlavní nadpis sekce dokumentu (*Způsoby montáže*, *Montážní držáky*) |
| `h2` | podnadpis (*vyměření na rám*, *bezinvazivní držák*) |
| `krok` | číslovaný montážní krok, pokud dokument kroky má |
| `varianta` | písmeno varianty **A**–**H**, pokud jsou varianty vedle sebe |
| `nadpis` | to z výše uvedených, co patří na titulek — `krok` → `h2` → `h1` |
| `popisky` | text uvnitř výkresu (názvy dílů, pokyny). Slouží k **fulltextu, ne k zobrazení** — v obrázku jsou vypálené, bez nich výkres ztrácí smysl |
| `poznamky` | drobný vysvětlující text (podmínky, upozornění) |
| `kotace` | čistě číselné popisky (rozměry, počty) — oddělené, aby nezaplevelily fulltext |
| `px` | rozměr obrázku v pixelech |

## fulltext.json

Plochý seznam všech sekcí — připravený k nasypání do vyhledávacího indexu:

```json
[{ "produkt": "okenni-site-sel-15", "dokument": "mn.pdf", "sekce": "mn__s01",
   "nadpis": "upevnění pružinovými háčky",
   "cesta": "okenni-site-sel-15/mn__s01.png",
   "text": "upevnění pružinovými háčky Měřící bod Pružinový háček ..." }]
```

## Na co si dát pozor

1. **Nejsou to krokové návody.** Většina dokumentů jsou vyměřovací a montážní **výkresy**,
   ne číslované instrukce. Číslované kroky (`krok`) má jen menšina — plissé do zimní zahrady,
   střešní okna, plissované sítě.
2. **Segmentace je heuristická.** Řídí se typografií Jack Westu: 10 pt Montserrat SemiBold
   tmavá = H1, 10 pt Regular šedá = H2, 8 pt „1. …" = krok, 20–27 pt oranžová A/B/C = varianta.
   Textové dokumenty (reklamace, příplatky, ceníky) se poznají podle nízkého podílu kreseb
   a dělí se jen na hranicích textových bloků, aby se neřezalo uprostřed odstavce.
   U složitých layoutů může zůstat víc výkresů v jedné sekci — ověřeno vizuálně na vzorku,
   ne kus po kuse.
3. **Rolety a Z90 nemají souhrnný montážní návod** — mají 20–25 tematických PDF
   (vodicí listy, krycí plechy, bočnice, průchodky). V balíku jsou všechna.
4. **Obrázky jsou paletové PNG** (256 barev). Pro technické výkresy vizuálně shodné
   s originálem při 43 % velikosti. Plná kvalita se získá přegenerováním z PDF.
5. **Duplicity**: z 326 dokumentů je 278 obsahově unikátních — stejné PDF (reklamace,
   příplatky) visí u víc produktů. Zpracované jsou jednou, zkopírované ke každému produktu.

## Přegenerování

`rozsekej.py` bere PDF a vytváří tuhle strukturu. Parametry nahoře v souboru:
`DPI`, `PAD`, barvy a prahy pro detekci kotev. Zdrojová PDF nejsou v repu —
stahují se z URL v `index.json` (klíč `zdroj_pdf`, relativně k `https://www.jackwest.cz`).
