import { describe, expect, it } from "vitest";
import { jwCsvNabidky } from "./export/jw-csv";

// Co kancelář uvidí v panelu „Podklady pro dodavatele". Rozhoduje server, aby
// klient nemohl nabídnout soubor, který by portál odmítl — a aby se výrobek bez
// importu nezamlčel.

const polozka = (over: Partial<Parameters<typeof jwCsvNabidky>[0][number]> = {}) => ({
  kind: "config",
  subcategory_id: "sub-esd",
  subcategory_name: "Jack West · ESD — horizontální 25 mm",
  subcategory_code: "ESD",
  subcategory_manufacturer: "jackwest",
  subcategory_konfig_key: null,
  ...over,
});

describe("jwCsvNabidky", () => {
  it("výrobek s importem nabídne ke stažení a spočítá kusy", () => {
    const [n, ...zbytek] = jwCsvNabidky([polozka(), polozka(), polozka()]);
    expect(zbytek).toHaveLength(0);
    expect(n).toMatchObject({ zkratka: "ESD", csv: true, overeno: true, pocet: 3 });
  });

  it("výrobek bez importu se vypíše, ale bez souboru", () => {
    const [n] = jwCsvNabidky([
      polozka({
        subcategory_id: "sub-pk",
        subcategory_code: "PLISSE-KLASIK",
        subcategory_name: "Jack West · Plissé klasik",
      }),
    ]);
    expect(n).toMatchObject({ csv: false, pocet: 1 });
  });

  it("výrobek z konfigurátoru se pozná podle zkratky, ne podle kódu podkategorie", () => {
    const [n] = jwCsvNabidky([
      polozka({
        subcategory_id: "sub-pd",
        subcategory_code: "PD",
        subcategory_konfig_key: "jackwest:PD",
        subcategory_name: "Jack West · Žaluzie horizontální PD",
      }),
    ]);
    expect(n).toMatchObject({ zkratka: "PD", csv: true });
  });

  it("cizí dodavatel ani oprava do podkladů pro Jack West nepatří", () => {
    expect(
      jwCsvNabidky([
        polozka({ subcategory_manufacturer: "suys", subcategory_id: "sub-suys" }),
        polozka({ subcategory_manufacturer: "neva", subcategory_id: "sub-neva" }),
        polozka({ kind: "oprava", subcategory_id: "sub-oprava" }),
        polozka({ subcategory_id: null }),
      ]),
    ).toEqual([]);
  });

  it("vlastní název od kanceláře má přednost před názvem z katalogu", () => {
    const [n] = jwCsvNabidky([polozka({ subcategory_custom_name: "ESD 25 — naše žaluzie" })]);
    expect(n!.nazev).toBe("ESD 25 — naše žaluzie");
  });

  it("SEL-15 je nabídnutá, ale vedená jako neověřená", () => {
    const [n] = jwCsvNabidky([
      polozka({ subcategory_id: "sub-sel", subcategory_code: "SEL-15", subcategory_name: null }),
    ]);
    expect(n).toMatchObject({ zkratka: "SEL-15", csv: true, overeno: false });
  });
});
