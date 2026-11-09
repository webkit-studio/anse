import { describe, expect, it } from "vitest";
import {
  chybejiciDodani,
  dodaniPoMontazi,
  dodaniRows,
  dodavateleZPolozek,
  nejpozdejsi,
} from "./dodani";

describe("termíny dodání po dodavatelích", () => {
  it("dodavatelé z položek: každý jednou, Ostatní (opravy) na konci", () => {
    expect(
      dodavateleZPolozek([
        { subcategory_manufacturer: null },
        { subcategory_manufacturer: "suys" },
        { subcategory_manufacturer: "jackwest" },
        { subcategory_manufacturer: "jackwest" },
      ]),
    ).toEqual(["jackwest", "suys", ""]);
  });

  it("Ostatní se objeví jen tehdy, když jsou položky bez dodavatele", () => {
    expect(dodavateleZPolozek([{ subcategory_manufacturer: "neva" }])).toEqual(["neva"]);
  });

  it("řádky nesou české názvy a uložené termíny; cizí uložené se ignorují", () => {
    const rows = dodaniRows(
      [{ subcategory_manufacturer: "jackwest" }, { subcategory_manufacturer: null }],
      [
        { dodavatel: "jackwest", term: "2026-11-20" },
        { dodavatel: "suys", term: "2026-12-01" }, // položka SUYS byla smazána
      ],
    );
    expect(rows).toEqual([
      { dodavatel: "jackwest", nazev: "Jack West", term: "2026-11-20" },
      { dodavatel: "", nazev: "Ostatní", term: null },
    ]);
  });

  it("orders.term_dodani = nejpozdější z termínů", () => {
    expect(
      nejpozdejsi([{ term: "2026-11-20" }, { term: "2026-12-03" }, { term: null }, { term: "2026-11-30" }]),
    ).toBe("2026-12-03");
    expect(nejpozdejsi([{ term: null }])).toBeNull();
    expect(nejpozdejsi([])).toBeNull();
  });

  it("co chybí jmenuje dodavatele, jen když jich je víc", () => {
    const dva = dodaniRows(
      [{ subcategory_manufacturer: "jackwest" }, { subcategory_manufacturer: "suys" }],
      [{ dodavatel: "suys", term: "2026-11-20" }],
    );
    expect(chybejiciDodani(dva)).toEqual(["Termín dodání (Jack West)"]);
    expect(chybejiciDodani(dodaniRows([{ subcategory_manufacturer: "suys" }], []))).toEqual([
      "Termín dodání",
    ]);
  });

  it("varování: dodání po termínu montáže", () => {
    const rows = dodaniRows(
      [{ subcategory_manufacturer: "jackwest" }, { subcategory_manufacturer: "suys" }],
      [
        { dodavatel: "jackwest", term: "2026-11-20" },
        { dodavatel: "suys", term: "2026-11-27" },
      ],
    );
    expect(dodaniPoMontazi(rows, "2026-11-25").map((r) => r.nazev)).toEqual(["SUYS"]);
    expect(dodaniPoMontazi(rows, "2026-11-27")).toEqual([]); // ve stejný den nevadí
    expect(dodaniPoMontazi(rows, null)).toEqual([]);
  });
});
