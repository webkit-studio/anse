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

// Nálezy tří korektorů — každý řádek níž byl chyba, která se dostala do UI.

describe("ženská jména na souhlásku se NESKLOŇUJÍ", () => {
  // Kořen všech nalezených chyb: ženské jméno propadlo mužským pravidlům.
  // Proto se skloňuje jen tam, kde je zakončení jednoznačně mužské, nebo je
  // jméno v seznamu MUZSKA — jinak radši první pád.
  it.each([
    ["Nicol", "Nicol"], // dřív „Nicole" — jiné jméno, ne jiný pád
    ["Esther", "Esther"],
    ["Judit", "Judit"],
    ["Judith", "Judith"],
    ["Ráchel", "Ráchel"],
    ["Isabel", "Isabel"],
    ["Rut", "Rut"],
    ["Astrid", "Astrid"],
    ["Carmen", "Carmen"],
    ["Mirjam", "Mirjam"],
    ["Sharon", "Sharon"],
    ["Marion", "Marion"],
    ["Vivien", "Vivien"],
    ["Lilian", "Lilian"],
    ["Kim", "Kim"],
    ["Yasmin", "Yasmin"],
    ["Jasmin", "Jasmin"], // pravopis jména se nepřepisuje na „Jasmín"
    ["Doris", "Doris"], // -s nese i ženská jména, proto se ptáme na seznam
    ["Iris", "Iris"],
    ["Sarah", "Sarah"],
  ])("%s → %s", (jmeno, ocekavano) => {
    expect(vokativ(jmeno)).toBe(ocekavano);
  });
});

describe("zakončení, která pravidla dřív komolila", () => {
  it.each([
    // -ěk mimo -něk: vypadává ě a kmen měkne
    ["Luděk", "Luďku"],
    ["Zdeněk", "Zdeňku"],
    ["Zbyněk", "Zbyňku"],
    // po ď/ť/ň se píše tvrdé i — „Miloňi" neexistuje
    ["Miloň", "Miloni"],
    ["Bohuň", "Bohuni"],
    // cizí -ek/-ec, kde se -e- nevypouští
    ["Derek", "Dereku"],
    ["Alec", "Alecu"],
    // cizí -h, které se nečte tvrdě
    ["Rajesh", "Rajeshi"],
    ["Joseph", "Josephe"],
  ])("%s → %s", (jmeno, ocekavano) => {
    expect(vokativ(jmeno)).toBe(ocekavano);
  });
});

describe("zápis jména se nemá rozbít", () => {
  it("verzálky zůstanou verzálkami, ne „PETře“", () => {
    expect(vokativ("PETR")).toBe("PETŘE");
    expect(vokativ("MAREK")).toBe("MARKU");
    expect(vokativ("JAN")).toBe("JANE");
    expect(vokativ("KAREL")).toBe("KARLE");
    expect(vokativ("JANA")).toBe("JANO");
  });

  it("složené jméno se skloňuje po částech", () => {
    expect(vokativ("Jan-Karel")).toBe("Jane-Karle");
    expect(vokativ("Anna-Marie")).toBe("Anno-Marie");
  });
});

describe("ošklivé vstupy nesmí nic rozbít", () => {
  it("prázdno a mezery", () => {
    expect(vokativ("")).toBe("");
    expect(vokativ("   ")).toBe("");
    expect(osloveni("", 9)).toBe("Dobré dopoledne");
    expect(osloveni("   ", 9)).toBe("Dobré dopoledne");
  });

  it("jedno písmeno je iniciála, ne jméno", () => {
    // dřív: „A" → „o", „J" → „Ji", „R" → „Re"
    expect(vokativ("A")).toBe("A");
    expect(vokativ("J")).toBe("J");
    expect(vokativ("R")).toBe("R");
  });

  it("klíče z Object.prototype nevrací funkci ani objekt", () => {
    expect(typeof vokativ("constructor")).toBe("string");
    expect(typeof vokativ("__proto__")).toBe("string");
    expect(typeof vokativ("toString")).toBe("string");
  });

  it("netextový vstup nespadne", () => {
    expect(vokativ(null as never)).toBe("");
    expect(vokativ(undefined as never)).toBe("");
    expect(vokativ(42 as never)).toBe("");
    expect(krestni(null as never)).toBe("");
  });

  it("křestní jméno se bere z celého jména", () => {
    expect(krestni("Jakub Svoboda")).toBe("Jakub");
    expect(krestni("  Marek   Konderla ")).toBe("Marek");
    expect(krestni("Jednoslovné")).toBe("Jednoslovné");
  });

  it("titul není jméno", () => {
    // dřív: „Dobré dopoledne, Ing."
    expect(krestni("Ing. Jakub")).toBe("Jakub");
    expect(krestni("Mgr. Jan Novák")).toBe("Jan");
    expect(krestni("MUDr. Petr Svoboda")).toBe("Petr");
    expect(osloveni("Ing. Jakub Svoboda", 9)).toBe("Dobré dopoledne, Jakube");
  });

  it("celé oslovení", () => {
    expect(osloveni("Marek Konderla", 14)).toBe("Dobré odpoledne, Marku");
    expect(osloveni("Darina Konderlová", 7)).toBe("Dobré ráno, Darino");
  });
});
