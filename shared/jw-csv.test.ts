import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadJackWest } from "./konfigurator";
import type { JwCatalog } from "./konfigurator";
import {
  JW_CSV_MAPY,
  jwCsv,
  jwCsvMapaZKonfiguratoru,
  jwDatum,
  maJwCsv,
  type JwCsvPolozka,
} from "./jw-csv";

// Modul je čistý, test ne: čte vzor od výrobce a naměřené podklady, protože
// jedině proti nim se dá ověřit, že soubor vypadá tak, jak ho portál čeká.
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const vzor = readFileSync(root("podklady/data/jack-west/csv-import/esd-vzor.csv"), "utf8");
const vzorRadky = vzor.replace(/^﻿/, "").split("\r\n");

/** Položka, ze které má vzniknout přesně vzorový řádek výrobce. */
const jakoVzor: JwCsvPolozka = {
  pole: {
    sirka: { kod: "1000", popisek: "1000" },
    vyska: { kod: "1000", popisek: "1000" },
    barva_lamely: { kod: "9948", popisek: "9948 -př." },
    profil_horni: { kod: "Bílá 9003", popisek: "Bílá 9003" },
    profil_spodni: { kod: "Bílá 9003", popisek: "Bílá 9003" },
    barva_retizku: { kod: "Standard", popisek: "Standard" },
    delka_retizku: { kod: "Na výšku", popisek: "Na výšku" },
    ovladani_strana: { kod: "L", popisek: "L — levá" },
  },
  pozice: "",
  poznamka: "",
};

const hlavicka = { znacka: "", termin: null, komentar: "" };

describe("jwCsv — tvar souboru", () => {
  it("hlavičkové řádky sedí na vzor od výrobce znak po znaku", () => {
    const radky = jwCsv(JW_CSV_MAPY.ESD!, hlavicka, []).replace(/^﻿/, "").split("\r\n");
    expect(radky[0]).toBe(vzorRadky[0]); // české popisky
    expect(radky[1]).toBe(vzorRadky[1]); // typy polí
    expect(radky[2]).toBe(vzorRadky[2]); // názvy sloupců — podle nich importér páruje
  });

  it("vzorová položka dá vzorový řádek; liší se jen výplňové nuly", () => {
    const nas = jwCsv(JW_CSV_MAPY.ESD!, hlavicka, [jakoVzor])
      .replace(/^﻿/, "")
      .split("\r\n")[3]!
      .split(";");
    const jejich = vzorRadky[3]!.split(";");
    const kody = vzorRadky[2]!.split(";");

    // Export portálu sype do prázdné pozice i poznámky nulu. Pozici plníme vždy
    // a nula v poznámce by se u výrobce četla jako text, proto tam posíláme
    // prázdno — jediné dva sloupce, kde se od vzoru vědomě lišíme.
    const vyplne = [kody.indexOf("Pozice"), kody.indexOf("Poznamka")];
    for (const i of vyplne) {
      expect(jejich[i]).toBe("0");
      expect(nas[i]).toBe("");
      nas[i] = "0";
    }
    expect(nas).toEqual(jejich);
  });

  it("soubor má BOM, CRLF a končí koncem řádku", () => {
    const csv = jwCsv(JW_CSV_MAPY.ESD!, hlavicka, [jakoVzor]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.includes("\n") && !/[^\r]\n/.test(csv)).toBe(true);
  });

  it("hlavičkové sloupce nese každý řádek", () => {
    const csv = jwCsv(
      JW_CSV_MAPY.ESD!,
      { znacka: "2026-014", termin: "2026-10-20", komentar: "Montáž po 15:00" },
      [jakoVzor, jakoVzor],
    );
    const radky = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(radky).toHaveLength(5);
    for (const r of radky.slice(3)) {
      expect(r.startsWith("2026-014;20.10.2026;Montáž po 15:00;ESD;")).toBe(true);
    }
  });
});

describe("jwCsv — hodnoty", () => {
  it("prázdné pole nahradí výchozí hodnota masky", () => {
    const prazdna: JwCsvPolozka = { pole: {}, pozice: "Ložnice 1", poznamka: "" };
    const kody = vzorRadky[2]!.split(";");
    const radek = jwCsv(JW_CSV_MAPY.ESD!, hlavicka, [prazdna])
      .replace(/^﻿/, "")
      .split("\r\n")[3]!
      .split(";");
    expect(radek[kody.indexOf("Stineni")]).toBe("C-celostín");
    expect(radek[kody.indexOf("Uchyceni_silonu")]).toBe("Fixační kolík");
    expect(radek[kody.indexOf("Brzda")]).toBe("Ne");
    expect(radek[kody.indexOf("Pozice")]).toBe("Ložnice 1");
    expect(radek[kody.indexOf("Pocet")]).toBe("1");
  });

  it("strana ovládání jde do masky celá, ne jako náš kód", () => {
    const kody = vzorRadky[2]!.split(";");
    const radek = (kod: string) =>
      jwCsv(JW_CSV_MAPY.ESD!, hlavicka, [
        {
          pole: { ovladani_strana: { kod, popisek: `${kod} — cokoli` } },
          pozice: "",
          poznamka: "",
        },
      ])
        .replace(/^﻿/, "")
        .split("\r\n")[3]!
        .split(";")[kody.indexOf("Strana_ovladani")];
    expect(radek("P")).toBe("P-pravá");
    expect(radek("L")).toBe("L-levá");
  });

  it("metráž se dopočítá z rozměru s desetinnou čárkou", () => {
    const kody = vzorRadky[2]!.split(";");
    const m2 = (s: string, v: string) =>
      jwCsv(JW_CSV_MAPY.ESD!, hlavicka, [
        {
          pole: { sirka: { kod: s, popisek: s }, vyska: { kod: v, popisek: v } },
          pozice: "",
          poznamka: "",
        },
      ])
        .replace(/^﻿/, "")
        .split("\r\n")[3]!
        .split(";")[kody.indexOf("Metraz_ks")];
    expect(m2("1000", "1000")).toBe("1");
    expect(m2("1200", "1200")).toBe("1,44");
  });

  it("poznámka se středníkem ani víc řádky nerozbije záznam", () => {
    const csv = jwCsv(JW_CSV_MAPY.ESD!, hlavicka, [
      { pole: {}, pozice: "Kuchyň 2", poznamka: 'Vlevo; „těsně" u zdi\nzměřit znovu' },
    ]);
    const radky = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(radky).toHaveLength(4);
    expect(radky[3]).toContain('"Vlevo; „těsně"" u zdi · změřit znovu"');
  });

  it("datum jde do portálu česky", () => {
    expect(jwDatum("2026-10-05")).toBe("05.10.2026");
    expect(jwDatum(null)).toBe("");
    expect(jwDatum("")).toBe("");
  });
});

describe("mapy výrobků", () => {
  it("soubor se nabízí jen tam, kde má výrobce import zapnutý", () => {
    expect(maJwCsv("ESD")).toBe(true);
    expect(maJwCsv("SEL-15")).toBe(true);
    expect(maJwCsv("PD")).toBe(true);
    expect(maJwCsv("SEL-13")).toBe(true);
    expect(maJwCsv("Z90")).toBe(false);
    expect(maJwCsv("PK")).toBe(false);
  });

  it("mapa z konfigurátoru bere sloupce i výchozí hodnoty z masky", () => {
    const katalog = JSON.parse(
      readFileSync(root("podklady/data/jack-west/produkty-davka-2.json"), "utf8"),
    ) as JwCatalog;
    const pd = loadJackWest(katalog).find((p) => p.kod === "PD")!;
    const mapa = jwCsvMapaZKonfiguratoru(pd);
    const kody = mapa.sloupce.map((s) => s.kod);

    expect(mapa.zkratka).toBe("PD");
    // Automatický název widgetu z editoru (pole bez popisku) do souboru nepatří.
    expect(kody).not.toContain("TEdit13555");
    expect(kody).toContain("Barva_lamela");
    // …ale pole, které se v datech jen shodou okolností jmenuje jako svůj
    // popisek, vypadnout nesmí.
    expect(kody).toContain("Brzda");
    expect([...kody].sort((a, b) => a.localeCompare(b, "en"))).toEqual(kody);

    const stineni = mapa.sloupce.find((s) => s.kod === "Stineni")!;
    expect(stineni.typ).toBe("Výběr");
    expect(stineni.vychozi).toBe("C-celostín");
    expect(mapa.sloupce.find((s) => s.kod === "Poznamka")!.typ).toBe("Dlouhý text");
    expect(mapa.rozmer).toEqual({ sirka: "Sirka", vyska: "Vyska" });
  });

  it("u konfigurátoru se hodnota nepřekládá — ukládáme rovnou hodnoty masky", () => {
    const katalog = JSON.parse(
      readFileSync(root("podklady/data/jack-west/produkty-davka-2.json"), "utf8"),
    ) as JwCatalog;
    const pd = loadJackWest(katalog).find((p) => p.kod === "PD")!;
    const mapa = jwCsvMapaZKonfiguratoru(pd);
    const csv = jwCsv(mapa, hlavicka, [
      {
        pole: {
          Sirka: { kod: "800", popisek: "800" },
          Strana_ovladani: { kod: "P-pravá", popisek: "P-pravá" },
          Barva_lamela: { kod: "9948 -př.", popisek: "9948 -př." },
        },
        pozice: "Obývák 1",
        poznamka: "",
      },
    ]);
    const radky = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    const kody = radky[2]!.split(";");
    const data = radky[3]!.split(";");
    expect(data[kody.indexOf("Strana_ovladani")]).toBe("P-pravá");
    expect(data[kody.indexOf("Barva_lamela")]).toBe("9948 -př.");
    expect(data[kody.indexOf("Sirka")]).toBe("800");
    expect(data[kody.indexOf("Pozice")]).toBe("Obývák 1");
  });

  it("co technik vyplnil v masce, dopočet nepřepíše", () => {
    const katalog = JSON.parse(
      readFileSync(root("podklady/data/jack-west/produkty-davka-2.json"), "utf8"),
    ) as JwCatalog;
    const pd = loadJackWest(katalog).find((p) => p.kod === "PD")!;
    const mapa = jwCsvMapaZKonfiguratoru(pd);
    // Konfigurátor vykresluje i Počet, Pozici, Poznámku a Metráž — jsou to
    // pole masky. Vlastní výpočet je jen náhrada, když je technik nevyplnil.
    const csv = jwCsv(mapa, hlavicka, [
      {
        pole: {
          Sirka: { kod: "1000", popisek: "1000" },
          Vyska: { kod: "1000", popisek: "1000" },
          Pocet: { kod: "3", popisek: "3" },
          Pozice: { kod: "okno vlevo od dveří", popisek: "okno vlevo od dveří" },
          Poznamka: { kod: "montáž až po malování", popisek: "montáž až po malování" },
          Metraz_ks: { kod: "2,5", popisek: "2,5" },
        },
        pozice: "Obývák 1",
        poznamka: "zaměřeno přes parapet",
      },
    ]);
    const radky = csv
      .replace(/^\ufeff/, "")
      .trimEnd()
      .split("\r\n");
    const kody = radky[2]!.split(";");
    const data = radky[3]!.split(";");
    expect(data[kody.indexOf("Pocet")]).toBe("3");
    expect(data[kody.indexOf("Pozice")]).toBe("okno vlevo od dveří");
    expect(data[kody.indexOf("Metraz_ks")]).toBe("2,5");
    // Poznámka je na dvou místech (maska + vestavěná u položky) — obě do souboru.
    expect(data[kody.indexOf("Poznamka")]).toBe("montáž až po malování · zaměřeno přes parapet");
  });

  it("nevyplněná pole masky dopočet doplní", () => {
    const katalog = JSON.parse(
      readFileSync(root("podklady/data/jack-west/produkty-davka-2.json"), "utf8"),
    ) as JwCatalog;
    const pd = loadJackWest(katalog).find((p) => p.kod === "PD")!;
    const csv = jwCsv(jwCsvMapaZKonfiguratoru(pd), hlavicka, [
      {
        pole: { Sirka: { kod: "1200", popisek: "1200" }, Vyska: { kod: "1200", popisek: "1200" } },
        pozice: "Ložnice 2",
        poznamka: "",
      },
    ]);
    const radky = csv
      .replace(/^\ufeff/, "")
      .trimEnd()
      .split("\r\n");
    const kody = radky[2]!.split(";");
    const data = radky[3]!.split(";");
    expect(data[kody.indexOf("Pocet")]).toBe("1");
    expect(data[kody.indexOf("Pozice")]).toBe("Ložnice 2");
    expect(data[kody.indexOf("Metraz_ks")]).toBe("1,44");
    expect(data[kody.indexOf("Poznamka")]).toBe("");
  });

  it("SEL-15 je vedená jako neověřená, dokud nepřijde vzor od výrobce", () => {
    expect(JW_CSV_MAPY.ESD!.overeno).toBe(true);
    expect(JW_CSV_MAPY["SEL-15"]!.overeno).toBe(false);
    expect(JW_CSV_MAPY["SEL-15"]!.puvod).toContain("SEL-13");
  });
});
