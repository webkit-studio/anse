import { describe, expect, it } from "vitest";
import { krestni, osloveni, pozdrav, vokativ } from "./vocative";

// Oslovení pátým pádem je jediné místo, kde aplikace skloňuje. Tabulka níž je
// zároveň dokumentace pravidel — když se pravidlo změní, musí být vidět kde.

describe("pozdrav podle denní doby", () => {
  it("hranice zadané Lukášem", () => {
    expect([0, 5, 7].map(pozdrav)).toEqual(["Dobré ráno", "Dobré ráno", "Dobré ráno"]);
    expect([8, 10, 11].map(pozdrav)).toEqual(["Dobré dopoledne", "Dobré dopoledne", "Dobré dopoledne"]);
    expect([12, 15, 17].map(pozdrav)).toEqual(["Dobré odpoledne", "Dobré odpoledne", "Dobré odpoledne"]);
    expect([18, 22, 23].map(pozdrav)).toEqual(["Dobrý večer", "Dobrý večer", "Dobrý večer"]);
  });
});

describe("5. pád — tým Anse", () => {
  it.each([
    ["Lukáš Svoboda", "Lukáši"],
    ["Marek Konderla", "Marku"],
    ["Jakub Svoboda", "Jakube"],
    ["Darina Konderlová", "Darino"],
    ["Petr Novák", "Petře"],
  ])("%s → %s", (cele, ocekavano) => {
    expect(vokativ(krestni(cele))).toBe(ocekavano);
  });
});

describe("5. pád — mužská jména podle zakončení", () => {
  it.each([
    // -ek: vypadává e
    ["Marek", "Marku"],
    ["Radek", "Radku"],
    ["Mirek", "Mirku"],
    ["Vašek", "Vašku"],
    ["Hynek", "Hynku"],
    // -něk: ě → ň
    ["Zdeněk", "Zdeňku"],
    ["Vaněk", "Vaňku"],
    // tvrdé -k, -g, -h, -ch → -u
    ["Dominik", "Dominiku"],
    ["Patrik", "Patriku"],
    ["Vojtěch", "Vojtěchu"],
    ["Oldřich", "Oldřichu"],
    ["Bedřich", "Bedřichu"],
    // -r po souhlásce měkne, po samohlásce ne
    ["Petr", "Petře"],
    ["Alexandr", "Alexandře"],
    ["Viktor", "Viktore"],
    ["Vladimír", "Vladimíre"],
    ["Otakar", "Otakare"],
    // měkké souhlásky → -i
    ["Lukáš", "Lukáši"],
    ["Tomáš", "Tomáši"],
    ["Matyáš", "Matyáši"],
    ["Ondřej", "Ondřeji"],
    ["Matěj", "Matěji"],
    ["Aleš", "Aleši"],
    ["Miloš", "Miloši"],
    ["Denis", "Denisi"],
    // -el → -i, kromě vypadávajícího e
    ["Daniel", "Danieli"],
    ["Gabriel", "Gabrieli"],
    ["Marcel", "Marceli"],
    ["Karel", "Karle"],
    ["Pavel", "Pavle"],
    // ostatní souhlásky → -e
    ["Jakub", "Jakube"],
    ["Jan", "Jane"],
    ["Josef", "Josefe"],
    ["David", "Davide"],
    ["Adam", "Adame"],
    ["Martin", "Martine"],
    ["Michal", "Michale"],
    ["Filip", "Filipe"],
    ["Vít", "Víte"],
    ["Štěpán", "Štěpáne"],
    ["Šimon", "Šimone"],
    ["Emil", "Emile"],
    // samohláskové konce se nemění
    ["Jiří", "Jiří"],
    ["Ivo", "Ivo"],
    ["Hugo", "Hugo"],
    ["Oto", "Oto"],
    // domácké tvary na -a jdou jako ženská
    ["Honza", "Honzo"],
    ["Jirka", "Jirko"],
    ["Pepa", "Pepo"],
  ])("%s → %s", (jmeno, ocekavano) => {
    expect(vokativ(jmeno)).toBe(ocekavano);
  });
});

describe("5. pád — ženská jména", () => {
  it.each([
    ["Jana", "Jano"],
    ["Eva", "Evo"],
    ["Hana", "Hano"],
    ["Kateřina", "Kateřino"],
    ["Tereza", "Terezo"],
    ["Klára", "Kláro"],
    ["Veronika", "Veroniko"],
    ["Adéla", "Adélo"],
    ["Simona", "Simono"],
    ["Zuzana", "Zuzano"],
    // -e se nemění
    ["Marie", "Marie"],
    ["Lucie", "Lucie"],
    ["Alice", "Alice"],
    // ženská jména na souhlásku se nemění — bez výjimky by z nich
    // vypadlo „Dagmare" podle mužského pravidla
    ["Dagmar", "Dagmar"],
    ["Ester", "Ester"],
    ["Karin", "Karin"],
    ["Nikol", "Nikol"],
    ["Ingrid", "Ingrid"],
    ["Miriam", "Miriam"],
  ])("%s → %s", (jmeno, ocekavano) => {
    expect(vokativ(jmeno)).toBe(ocekavano);
  });
});

describe("ošklivé vstupy nesmí nic rozbít", () => {
  it("prázdno a mezery", () => {
    expect(vokativ("")).toBe("");
    expect(vokativ("   ")).toBe("");
    expect(osloveni("", 9)).toBe("Dobré dopoledne");
    expect(osloveni("   ", 9)).toBe("Dobré dopoledne");
  });

  it("křestní jméno se bere z celého jména", () => {
    expect(krestni("Jakub Svoboda")).toBe("Jakub");
    expect(krestni("  Marek   Konderla ")).toBe("Marek");
    expect(krestni("Jednoslovné")).toBe("Jednoslovné");
  });

  it("celé oslovení", () => {
    expect(osloveni("Marek Konderla", 14)).toBe("Dobré odpoledne, Marku");
    expect(osloveni("Darina Konderlová", 7)).toBe("Dobré ráno, Darino");
  });
});
