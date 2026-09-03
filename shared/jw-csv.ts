// Importní CSV pro webový portál Jack Westu.
//
// Kancelář dnes objednává ručním přepisem do konfigurátoru dodavatele. Portál
// ale umí objednávku načíst ze souboru: založí se poptávka, klikne „Import CSV"
// a položky se nasypou samy. Tenhle modul ten soubor skládá ze zaměření.
//
// Tvar souboru je dán exportem samotného portálu (podklady/data/jack-west/
// csv-import/esd-vzor.csv) a návodem od výrobce:
//   řádek 1  české popisky sloupců (pro člověka)
//   řádek 2  typ pole — Text / Datum / Výběr / Dlouhý text
//   řádek 3  NÁZVY SLOUPCŮ = pole v masce výrobku; podle nich importér páruje
//   řádek 4+ jedna položka na řádek
// První čtyři sloupce jsou pro všechny výrobky stejné: tři hlavičkové údaje
// poptávky (Vaše značka, Požadovaný datum, Komentář) a zkratka výrobku, podle
// které portál pozná, co zakládá. Zbytek jsou pole konkrétní masky seřazená
// podle názvu sloupce — tak to má i export portálu.
//
// Klíčové zjištění z podkladů: v maskách Jack Westu se hodnota volby rovná
// jejímu popisku („9948 -př.", „L-levá", „C-celostín"), takže se do souboru píše
// přesně to, co má konfigurátor v číselníku — a co u konfigurátorových produktů
// rovnou ukládáme. Výchozí hodnoty masky sedí na vzorový řádek od výrobce až na
// znak, proto se používají tam, kde údaj nemáme.
//
// Modul je čistý (bez IO): stejné soubory musí vzniknout na serveru i v testech.

import type { KonfigProduct } from "./konfigurator";

export type JwCsvTyp = "Text" | "Datum" | "Výběr" | "Dlouhý text";

/** Odkud se bere hodnota, kterou náš formulář sám o sobě nemá. */
export type JwCsvDopocet =
  | "pocet" // položka = jeden kus
  | "pozice" // označení pozice: místnost a pořadí
  | "poznamka" // poznámka položky
  | "plocha"; // metráž v m² ze šířky a výšky

export interface JwCsvSloupec {
  /** Název sloupce = pole v masce dodavatele (řádek 3 souboru). */
  kod: string;
  /** Český popisek z masky (řádek 1) — jen pro člověka. */
  popis: string;
  typ: JwCsvTyp;
  /** Co poslat, když hodnotu nemáme — výchozí hodnota masky. */
  vychozi: string;
  /** Klíč našeho pole, ze kterého se hodnota bere. Bez něj se pošle `vychozi`. */
  klic?: string;
  /**
   * Co z uloženého parametru vzít: „kod" je uložená hodnota, „popisek" je
   * popisek volby. U konfigurátoru je to totéž, u ručních definic ne —
   * barvu lamely držíme jako „9948" a maska chce „9948 -př.".
   */
  zdroj?: "kod" | "popisek";
  /** Náš kód → hodnota masky tam, kde se popisek nedá použít (P → P-pravá). */
  hodnoty?: Record<string, string>;
  dopocet?: JwCsvDopocet;
}

export interface JwCsvMapa {
  /** Zkratka výrobku do sloupce „Vyrobek" — podle ní portál zakládá výrobek. */
  zkratka: string;
  nazev: string;
  /**
   * true = sloupce pocházejí z exportu portálu, false = odvozené z naměřené
   * masky jiného výrobku téže řady. Kancelář to vidí u tlačítka.
   */
  overeno: boolean;
  /** Odkud sloupce jsou — do dokumentace i do hlášky v UI. */
  puvod: string;
  sloupce: JwCsvSloupec[];
  /** Kódy sloupců se šířkou a výškou pro dopočet metráže. */
  rozmer?: { sirka: string; vyska: string };
}

/** Hodnota jednoho pole položky: uložený kód a popisek volby. */
export interface JwCsvHodnota {
  kod: string;
  popisek: string;
}

export interface JwCsvPolozka {
  /** Klíč pole → hodnota. Klíče jsou naše (u konfigurátoru = pole masky). */
  pole: Record<string, JwCsvHodnota>;
  /** Označení pozice — místnost a pořadí v ní. */
  pozice: string;
  poznamka: string;
}

export interface JwCsvHlavicka {
  /** Vaše značka — naše číslo zakázky. */
  znacka: string;
  /** Požadovaný termín dodání, ISO datum (YYYY-MM-DD). */
  termin: string | null;
  komentar: string;
}

/**
 * Výrobky, u kterých má Jack West import CSV zapnutý. Ostatní se takhle
 * poptávat nedají (e-mail V. Syryčanské, 3. 9. 2026) — u nich se soubor
 * nenabízí, aby kancelář nestahovala něco, co portál odmítne.
 */
export const JW_CSV_VYROBKY = ["ESD", "PD", "SEL-13", "SEL-15"] as const;

export function maJwCsv(zkratka: string): boolean {
  return (JW_CSV_VYROBKY as readonly string[]).includes(zkratka);
}

// === skládání souboru ======================================================

const ODDELOVAC = ";";
const KONEC = "\r\n";
/** Excel i portál čekají českou UTF-8 s BOM — bez ní se rozsypou diakritiky. */
const BOM = "﻿";

/** Hlavičkové sloupce jsou u všech výrobků stejné. */
const HLAVICKA: { kod: string; popis: string; typ: JwCsvTyp }[] = [
  { kod: "Vase_znacka", popis: "Vaše značka", typ: "Text" },
  { kod: "Pozadovany_Datum", popis: "Požadovaný datum", typ: "Datum" },
  { kod: "Komentar", popis: "Komentář", typ: "Text" },
  { kod: "Vyrobek", popis: "Výrobek", typ: "Text" },
];

/** Datum pro portál — DD.MM.YYYY, jak ho čeká český kalendář v masce. */
export function jwDatum(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** Metráž v m² ze šířky a výšky v mm; desetinná čárka, soubor je „;" oddělený. */
function plocha(sirka: string, vyska: string): string {
  const s = Number(String(sirka).replace(",", "."));
  const v = Number(String(vyska).replace(",", "."));
  if (!Number.isFinite(s) || !Number.isFinite(v) || s <= 0 || v <= 0) return "";
  const m2 = Math.round(((s * v) / 1_000_000) * 100) / 100;
  return String(m2).replace(".", ",");
}

function bunka(hodnota: string): string {
  // Poznámka je volný text: víceřádkovou zprávu srazíme na jeden řádek, ať
  // záznam nepřeteče do dalšího a import se nerozjede.
  const text = hodnota.replace(/\r?\n/g, " · ").trim();
  return /[;"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Spojení dvou textů do jedné buňky — prázdné části se vynechají. */
function spoj(a: string, b: string): string {
  return [a.trim(), b.trim()].filter(Boolean).join(" · ");
}

function hodnotaSloupce(s: JwCsvSloupec, p: JwCsvPolozka, mapa: JwCsvMapa): string {
  const ulozena = s.klic ? p.pole[s.klic] : undefined;
  const kod = ulozena?.kod ?? "";

  // Co technik vyplnil, má přednost před dopočtem. U výrobků z konfigurátoru
  // se totiž Počet, Označení pozice, Poznámka i Metráž vyplňují ve formuláři
  // jako každé jiné pole masky — přepsat je vlastním výpočtem by zahodilo
  // přesně tu informaci, kterou technik zadal ručně.
  if (kod !== "") {
    const prevod = s.hodnoty?.[kod];
    const hodnota = prevod ?? (s.zdroj === "popisek" ? ulozena!.popisek || kod : kod);
    // Poznámku má konfigurátor v masce a my navíc vestavěnou u položky —
    // do souboru patří obě, dodavatel nemá kde přijít o půlku informace.
    return s.dopocet === "poznamka" ? spoj(hodnota, p.poznamka) : hodnota;
  }

  switch (s.dopocet) {
    case "pocet":
      // Množství u položek nevedeme: jedna položka zaměření je jeden kus.
      return "1";
    case "pozice":
      return p.pozice || s.vychozi;
    case "poznamka":
      return p.poznamka || s.vychozi;
    case "plocha": {
      const r = mapa.rozmer;
      const m2 = r ? plocha(p.pole[r.sirka]?.kod ?? "", p.pole[r.vyska]?.kod ?? "") : "";
      return m2 || s.vychozi;
    }
    default:
      return s.vychozi;
  }
}

/** Hotový obsah souboru: hlavička dodavatele + jedna položka na řádek. */
export function jwCsv(mapa: JwCsvMapa, hlavicka: JwCsvHlavicka, polozky: JwCsvPolozka[]): string {
  const sloupce = [...HLAVICKA, ...mapa.sloupce];
  const radky = [
    sloupce.map((s) => s.popis),
    sloupce.map((s) => s.typ),
    sloupce.map((s) => s.kod),
    ...polozky.map((p) => [
      hlavicka.znacka,
      jwDatum(hlavicka.termin),
      hlavicka.komentar,
      mapa.zkratka,
      ...mapa.sloupce.map((s) => hodnotaSloupce(s, p, mapa)),
    ]),
  ];
  return BOM + radky.map((r) => r.map(bunka).join(ODDELOVAC)).join(KONEC) + KONEC;
}

// === mapy výrobků ==========================================================

/**
 * Mapa z naměřené masky konfigurátoru. Sloupce jsou pole masky, hodnoty jsou
 * hodnoty jejích voleb — a přesně ty u konfigurátorových položek ukládáme,
 * takže tady žádný převod nevzniká a vzniknout nesmí.
 */
export function jwCsvMapaZKonfiguratoru(product: KonfigProduct): JwCsvMapa {
  const kody = new Set(product.fields.map((f) => f.code));
  const rozmer =
    kody.has("Sirka") && kody.has("Vyska") ? { sirka: "Sirka", vyska: "Vyska" } : undefined;

  const sloupce = product.fields
    // TEdit1234 je automatický název widgetu z editoru dodavatele — pole bez
    // popisku, které maska nezobrazuje. Do souboru nepatří. Filtrovat podle
    // „popisek == kód" nejde, tak se v datech jmenuje i pravá Brzda či Klika.
    .filter((f) => !/^TEdit\d+$/.test(f.code))
    .map<JwCsvSloupec>((f) => ({
      kod: f.code,
      popis: f.label,
      typ: f.input === "select" ? "Výběr" : f.input === "textarea" ? "Dlouhý text" : "Text",
      vychozi: f.defaultValue,
      klic: f.code,
      dopocet:
        f.code === "Pocet"
          ? "pocet"
          : f.code === "Pozice"
            ? "pozice"
            : f.code === "Poznamka"
              ? "poznamka"
              : f.code === "Metraz_ks" && rozmer
                ? "plocha"
                : undefined,
    }))
    .sort((a, b) => a.kod.localeCompare(b.kod, "en"));

  return {
    zkratka: product.kod,
    nazev: product.nazev,
    overeno: false,
    puvod: "naměřená maska konfigurátoru (podklady/data/jack-west)",
    sloupce,
    rozmer,
  };
}

/**
 * ESD — sloupce, typy i výchozí hodnoty jsou opsané ze souboru, který vyexportoval
 * sám portál (csv-import/esd-vzor.csv). Test soubor znovu skládá a porovnává
 * s originálem, takže se tahle mapa nemůže tiše rozejít se vzorem.
 */
const ESD: JwCsvMapa = {
  zkratka: "ESD",
  nazev: "Žaluzie horizontální ESD",
  overeno: true,
  puvod: "export portálu Jack West (esd-vzor.csv)",
  rozmer: { sirka: "sirka", vyska: "vyska" },
  sloupce: [
    // Barva lamely se ukládá jako holý kód („9948"), maska chce podobu
    // z číselníku i s příplatkovým sufixem („9948 -př.") — a to je náš popisek.
    {
      kod: "Barva_lamela",
      popis: "Barva (kód) lamely",
      typ: "Výběr",
      vychozi: "",
      klic: "barva_lamely",
      zdroj: "popisek",
    },
    {
      kod: "Barva_profilu_horni",
      popis: "Horní",
      typ: "Výběr",
      vychozi: "Bílá 9003",
      klic: "profil_horni",
    },
    { kod: "Barva_profilu_horni_ID", popis: "ID Horní", typ: "Výběr", vychozi: "" },
    { kod: "Barva_profilu_horni_RAL", popis: "RAL Horní", typ: "Text", vychozi: "0" },
    {
      kod: "Barva_profilu_spodni",
      popis: "Spodní",
      typ: "Výběr",
      vychozi: "Bílá 9003",
      klic: "profil_spodni",
    },
    { kod: "Barva_profilu_spodni_ID", popis: "ID Spodní", typ: "Výběr", vychozi: "" },
    { kod: "Barva_profilu_spodni_RAL", popis: "RAL Spodní", typ: "Text", vychozi: "0" },
    {
      kod: "Barva_retizku",
      popis: "Barva řetízku",
      typ: "Výběr",
      vychozi: "Standard",
      klic: "barva_retizku",
    },
    { kod: "Brzda", popis: "Brzda", typ: "Výběr", vychozi: "Ne" },
    {
      kod: "Delka_retizku",
      popis: "Délka řetízku",
      typ: "Výběr",
      vychozi: "Na výšku",
      klic: "delka_retizku",
    },
    {
      kod: "Delka_retizku_jina",
      popis: "Jiná délka řetízku",
      typ: "Text",
      vychozi: "0",
      klic: "jina_delka_retizku",
    },
    { kod: "Detska_pojistka", popis: "Dětská pojistka", typ: "Výběr", vychozi: "Ne" },
    {
      kod: "Distancni_podlozka",
      popis: "Dist. podložka párů na ks",
      typ: "Text",
      vychozi: "0",
      klic: "dist_podlozka",
    },
    { kod: "Metraz_ks", popis: "Metráž v m2", typ: "Text", vychozi: "1", dopocet: "plocha" },
    { kod: "Ocelove_lanko", popis: "Ocel. lanko", typ: "Výběr", vychozi: "Ne" },
    { kod: "Pocet", popis: "Počet", typ: "Text", vychozi: "1", dopocet: "pocet" },
    // Vzor má u prázdné pozice i poznámky nulu — to je jen výplň exportu.
    // Pozici plníme vždy a do poznámky se nula posílat nebude, přečetl by ji člověk.
    { kod: "Pozice", popis: "Označení pozice", typ: "Text", vychozi: "", dopocet: "pozice" },
    { kod: "Poznamka", popis: "Poznámka", typ: "Dlouhý text", vychozi: "", dopocet: "poznamka" },
    { kod: "Prevodovka", popis: "Převodovka", typ: "Výběr", vychozi: "Ne", klic: "prevodovka" },
    { kod: "Renolit_horni", popis: "Renolit horní", typ: "Text", vychozi: "0" },
    { kod: "Renolit_spodni", popis: "Renolit spodní", typ: "Text", vychozi: "0" },
    { kod: "Sirka_standard", popis: "Šířka", typ: "Text", vychozi: "0", klic: "sirka" },
    { kod: "Stineni", popis: "Stínění", typ: "Výběr", vychozi: "C-celostín" },
    // Strana ovládání je u nás jednopísmenný kód, maska chce celou volbu.
    {
      kod: "Strana_ovladani",
      popis: "Ovládání",
      typ: "Výběr",
      vychozi: "L-levá",
      klic: "ovladani_strana",
      hodnoty: { P: "P-pravá", L: "L-levá" },
    },
    { kod: "Uchyceni_silonu", popis: "Uchycení silonu", typ: "Výběr", vychozi: "Fixační kolík" },
    { kod: "Vyska_standard", popis: "Výška", typ: "Text", vychozi: "0", klic: "vyska" },
  ],
};

/**
 * SEL-15 — vzor od výrobce zatím nemáme. Sloupce, typy i výchozí hodnoty jsou
 * převzaté z naměřené masky SEL-13 (stejná řada okenních sítí, viz
 * podklady/data/jack-west/raw/mereni-42-produktu.json) a doplněné o RAL profilu,
 * které SEL-15 nabízí. Portál při importu neznámý sloupec přeskočí a hodnotu
 * mimo číselník nabídne opravit, takže případný rozdíl se dá dorovnat v dialogu —
 * ale první import je potřeba překontrolovat. Až přijde vzorový soubor pro
 * SEL-15, přepiš sloupce podle něj a přepni `overeno`.
 */
const SEL15: JwCsvMapa = {
  zkratka: "SEL-15",
  nazev: "Síť okenní SEL-15",
  overeno: false,
  puvod: "naměřená maska SEL-13 (vzor pro SEL-15 od výrobce zatím nemáme)",
  rozmer: { sirka: "sirka", vyska: "vyska" },
  sloupce: [
    {
      kod: "Barva_profil",
      popis: "Barva profilu",
      typ: "Výběr",
      vychozi: "Bílá 9003",
      klic: "barva_profilu",
    },
    { kod: "Hacky_typ", popis: "Háčky", typ: "Výběr", vychozi: "" },
    { kod: "Kartacek", popis: "Kartáček mm", typ: "Výběr", vychozi: "", klic: "kartacek" },
    {
      kod: "Kartacek_lepeni",
      popis: "Kartáček lepení",
      typ: "Výběr",
      vychozi: "",
      klic: "kartacek_lepeni",
    },
    {
      kod: "Kartacek_mm",
      popis: "Délka kart.v mm/ks",
      typ: "Text",
      vychozi: "",
      klic: "delka_kartacku",
    },
    { kod: "Metraz_ks", popis: "Metráž v m2", typ: "Text", vychozi: "", dopocet: "plocha" },
    {
      kod: "Orez_lemu_site",
      popis: "Ořez lemu sítě",
      typ: "Výběr",
      vychozi: "",
      klic: "orez_lemu",
    },
    {
      kod: "Orez_lemu_site_sirka",
      popis: "Ořez šířka",
      typ: "Text",
      vychozi: "",
      klic: "orez_sirka",
    },
    {
      kod: "Orez_lemu_site_vyska",
      popis: "Ořez výška",
      typ: "Text",
      vychozi: "",
      klic: "orez_vyska",
    },
    {
      kod: "Otocne_hacky",
      popis: "Otočné háčky v mm",
      typ: "Výběr",
      vychozi: "",
      klic: "otocne_hacky",
    },
    { kod: "Pocet", popis: "Počet", typ: "Text", vychozi: "1", dopocet: "pocet" },
    { kod: "Pozice", popis: "Označení pozice", typ: "Text", vychozi: "", dopocet: "pozice" },
    { kod: "Poznamka", popis: "Poznámka", typ: "Dlouhý text", vychozi: "", dopocet: "poznamka" },
    { kod: "Pricka_pro_zpevneni", popis: "Příčka zpevnění", typ: "Výběr", vychozi: "" },
    { kod: "Pricka_pro_zpevneni_vyska", popis: "Výška příčky v mm", typ: "Text", vychozi: "" },
    { kod: "RAL_profil", popis: "RAL", typ: "Text", vychozi: "", klic: "ral" },
    { kod: "Sirka", popis: "Šířka", typ: "Text", vychozi: "", klic: "sirka" },
    { kod: "Sitovina", popis: "Siťovina", typ: "Výběr", vychozi: "Standard", klic: "sitovina" },
    {
      kod: "Sitovina_barva",
      popis: "Barva síťoviny",
      typ: "Výběr",
      vychozi: "Černá",
      klic: "barva_sitoviny",
    },
    { kod: "Typ_uchyceni", popis: "Typ uchycení", typ: "Výběr", vychozi: "", klic: "typ_uchyceni" },
    { kod: "Vyska", popis: "Výška", typ: "Text", vychozi: "", klic: "vyska" },
  ],
};

/** Mapy pro produkty s ruční definicí formuláře (klíč = kód podkategorie). */
export const JW_CSV_MAPY: Record<string, JwCsvMapa> = { ESD, "SEL-15": SEL15 };
