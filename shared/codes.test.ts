import { describe, expect, it } from "vitest";
import {
  CODE_REGEX,
  KOD_NEJDE_POUZIT,
  chybaPrihlasovacihoKodu,
  chybaTvaruVlastnihoKodu,
  isTrivialCode,
  jeSlabyVlastniKod,
  jeVygenerovanyKod,
  maTvarKodu,
  normalizujKod,
  samoOdeslani,
} from "./codes";

describe("přihlašovací kódy", () => {
  it("formát: přesně 6 číslic", () => {
    expect(CODE_REGEX.test("047913")).toBe(true);
    expect(CODE_REGEX.test("12345")).toBe(false);
    expect(CODE_REGEX.test("1234567")).toBe(false);
    expect(CODE_REGEX.test("12a456")).toBe(false);
  });

  it("triviální kódy se odmítají", () => {
    expect(isTrivialCode("000000")).toBe(true);
    expect(isTrivialCode("111111")).toBe(true);
    expect(isTrivialCode("999999")).toBe(true);
    expect(isTrivialCode("123456")).toBe(true);
    expect(isTrivialCode("654321")).toBe(true);
  });

  it("běžné kódy projdou", () => {
    expect(isTrivialCode("047913")).toBe(false);
    expect(isTrivialCode("121212")).toBe(false);
    expect(isTrivialCode("100000")).toBe(false);
  });
});

describe("vlastní kód (S05)", () => {
  it("ukládá se bez okrajových mezer a malými písmeny", () => {
    expect(normalizujKod("  Moje-Brana-77 ")).toBe("moje-brana-77");
    expect(normalizujKod("482913")).toBe("482913");
  });

  it("tvar: 6 číslic, nebo 8–64 viditelných znaků bez diakritiky", () => {
    expect(maTvarKodu("482913")).toBe(true);
    expect(maTvarKodu("moje-brana-77")).toBe(true);
    expect(maTvarKodu("48291736")).toBe(true);
    expect(maTvarKodu("1234567")).toBe(false); // 7 znaků: ani jedno
    expect(maTvarKodu("abc123")).toBe(false); // 6 znaků, ale ne číslice
    expect(maTvarKodu("čelákovice")).toBe(false);
    expect(maTvarKodu("moje brana")).toBe(false);
    expect(maTvarKodu("a".repeat(65))).toBe(false);
  });

  it("kancelář vidí jen vygenerovaný kód", () => {
    expect(jeVygenerovanyKod("482913")).toBe(true);
    expect(jeVygenerovanyKod("48291736")).toBe(false);
    expect(jeVygenerovanyKod("moje-brana-77")).toBe(false);
  });

  it("chyby tvaru nového kódu jsou konkrétní (tvar není tajemství)", () => {
    expect(chybaTvaruVlastnihoKodu("abc12")).toBe("Kód musí mít aspoň 8 znaků.");
    expect(chybaTvaruVlastnihoKodu("a".repeat(65))).toBe("Kód může mít nejvýš 64 znaků.");
    expect(chybaTvaruVlastnihoKodu("moje brana")).toBe("Kód nesmí obsahovat mezery.");
    expect(chybaTvaruVlastnihoKodu("čelákovice")).toBe("Použij jen písmena bez diakritiky, číslice a znaky.");
    expect(chybaTvaruVlastnihoKodu("moje-brana-77")).toBeNull();
  });

  it("slabé kódy: opakování, řady, klávesnice, častá hesla, znak navíc", () => {
    const slabe = [
      "00000000",
      "aaaaaaaa",
      "11112222",
      "12121212",
      "abcabcab",
      "12341234",
      "12345678",
      "87654321",
      "01234567",
      "78901234",
      "13579135",
      "abcdefgh",
      "hgfedcba",
      "qwertzui",
      "qwertyui",
      "asdfghjk",
      "password",
      "heslo123",
      "anse1234",
      "1q2w3e4r",
      "12345678a",
      "a1234567",
      "aaaaaaa1",
      "qwertzuiop!",
    ];
    for (const kod of slabe) expect(jeSlabyVlastniKod(kod), kod).toBe(true);
  });

  it("rozumné kódy projdou — i datum narození (zadání ho neřeší)", () => {
    const dobre = ["moje-brana-77", "kuba2026", "48291736", "04121985", "celakovice", "kuzpyb-3vamwi-byzqyc"];
    for (const kod of dobre) expect(jeSlabyVlastniKod(kod), kod).toBe(false);
  });

  it("jedna hláška pro slabý i obsazený kód", () => {
    expect(KOD_NEJDE_POUZIT).toBe("Tento kód nejde použít, zvol jiný.");
  });
});

describe("přihlašovací pole", () => {
  it("hláška u pole podle toho, co chybí", () => {
    expect(chybaPrihlasovacihoKodu("482913")).toBeNull();
    expect(chybaPrihlasovacihoKodu("Moje-Brana-77")).toBeNull();
    expect(chybaPrihlasovacihoKodu("")).toBe("Kód má 6 číslic.");
    expect(chybaPrihlasovacihoKodu("123")).toBe("Kód má 6 číslic.");
    expect(chybaPrihlasovacihoKodu("1234567")).toBe("Vlastní kód má aspoň 8 znaků.");
    expect(chybaPrihlasovacihoKodu("brana")).toBe("Vlastní kód má aspoň 8 znaků.");
    // česká klávesnice: číslice bez Shiftu píšou háčky a čárky
    expect(chybaPrihlasovacihoKodu("ěščřžý")).toBe("Kód je bez diakritiky — zkontroluj klávesnici.");
  });

  it("samo odeslání: doplněný kód hned, ručně psaných 6 číslic po pauze, delší kód ne", () => {
    // správce hesel / vložení: celá hodnota najednou
    expect(samoOdeslani("", "482913")).toBe("hned");
    expect(samoOdeslani("", "Moje-Brana-77")).toBe("hned");
    expect(samoOdeslani("", "48291736")).toBe("hned");
    // ruční psaní: 6. číslice → počkat, jestli nepřijde 7.
    expect(samoOdeslani("48291", "482913")).toBe("po-pauze");
    expect(samoOdeslani("482913", "4829173")).toBeNull();
    expect(samoOdeslani("4829173", "48291736")).toBeNull();
    expect(samoOdeslani("moje-brana-7", "moje-brana-77")).toBeNull();
    // mazání zpátky na 6 číslic neodesílá
    expect(samoOdeslani("4829137", "482913")).toBeNull();
    // vložená hodnota bez tvaru kódu se neodešle
    expect(samoOdeslani("", "1234567")).toBeNull();
  });
});
