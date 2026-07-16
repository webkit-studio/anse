import { describe, expect, it } from "vitest";
import { formDefinitionSchema, type FormDefinition, type Params } from "../form-schema";
import { initialParams, pruneHidden, visibleFieldKeys } from "./visibility";
import { hasBlocking, issuesForField, validateItem } from "./validate";
import sel15Raw from "../../db/seeds/definitions/sel15.v1.json";
import esdRaw from "../../db/seeds/definitions/esd.v1.json";

// Testy běží proti REÁLNÝM seedovaným definicím — parse zároveň ověří,
// že soubory odpovídají schématu.
const sel15: FormDefinition = formDefinitionSchema.parse(sel15Raw);
const esd: FormDefinition = formDefinitionSchema.parse(esdRaw);

/** Validní základ SEL-15 položky (nad rámec defaultů). */
function sel15Base(extra: Params = {}): Params {
  return {
    ...initialParams(sel15),
    sirka: 1200,
    vyska: 1450,
    barva_profilu: "Bílá 9003",
    typ_uchyceni: "STANDARD",
    sitovina: "Standard",
    barva_sitoviny: "Šedá",
    ...extra,
  };
}

function esdBase(extra: Params = {}): Params {
  return {
    ...initialParams(esd),
    sirka: 900,
    vyska: 1400,
    ovladani_strana: "P",
    barva_lamely: "58",
    barva_retizku: "Standard",
    delka_retizku: "Na výšku",
    profil_horni: "Bílá 9003",
    profil_spodni: "Bílá 9003",
    ...extra,
  };
}

describe("defaulty", () => {
  it("žádné defaulty — všechny selecty začínají prázdné (rozhodnutí 16. 7.)", () => {
    expect(initialParams(sel15)).toEqual({});
    expect(initialParams(esd)).toEqual({});
  });
});

describe("validní položky projdou", () => {
  it("SEL-15 základ bez chyb", () => {
    const { issues, params } = validateItem(sel15, sel15Base(), "");
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
    expect(params.sirka).toBe(1200);
  });

  it("ESD základ bez chyb", () => {
    const { issues } = validateItem(esd, esdBase(), "");
    expect(hasBlocking(issues)).toBe(false);
  });
});

describe("povinná pole (required jen když viditelné)", () => {
  it("SEL-15: prázdný formulář hlásí jen viditelná povinná pole", () => {
    const { issues } = validateItem(sel15, initialParams(sel15), "");
    const errorKeys = issues.filter((i) => i.level === "error").map((i) => i.fieldKey);
    expect(errorKeys.sort()).toEqual([
      "barva_profilu",
      "barva_sitoviny",
      "sirka",
      "sitovina",
      "typ_uchyceni",
      "vyska",
    ]);
  });

  it("skryté podmíněné pole nehlásí chybu (RAL bez zvolené barvy RAL)", () => {
    const { issues } = validateItem(sel15, sel15Base(), "");
    expect(issuesForField(issues, "ral")).toEqual([]);
  });
});

describe("podmíněná viditelnost — SEL-15", () => {
  it("RAL: skryté ⇢ viditelné + povinné při Barva profilu = RAL", () => {
    expect(visibleFieldKeys(sel15, sel15Base()).has("ral")).toBe(false);

    const params = sel15Base({ barva_profilu: "RAL" });
    expect(visibleFieldKeys(sel15, params).has("ral")).toBe(true);
    const { issues } = validateItem(sel15, params, "");
    expect(issuesForField(issues, "ral")).toEqual([
      { level: "error", fieldKey: "ral", message: "Povinné pole." },
    ]);

    const ok = validateItem(sel15, { ...params, ral: "7035" }, "");
    expect(issuesForField(ok.issues, "ral")).toEqual([]);
  });

  it("kartáček 8/12/18 ⇒ délka a lepení viditelné + povinné; žádný ⇒ skryté", () => {
    const withBrush = sel15Base({ kartacek: "12" });
    const visible = visibleFieldKeys(sel15, withBrush);
    expect(visible.has("delka_kartacku")).toBe(true);
    expect(visible.has("kartacek_lepeni")).toBe(true);
    const { issues } = validateItem(sel15, withBrush, "");
    expect(issuesForField(issues, "delka_kartacku")).toHaveLength(1);
    expect(issuesForField(issues, "kartacek_lepeni")).toHaveLength(1);

    const noBrush = sel15Base({ kartacek: "žádný" });
    const hidden = visibleFieldKeys(sel15, noBrush);
    expect(hidden.has("delka_kartacku")).toBe(false);
    expect(hidden.has("kartacek_lepeni")).toBe(false);
    expect(hasBlocking(validateItem(sel15, noBrush, "").issues)).toBe(false);
  });

  it("ořez šířka/výška viditelné při Ořez lemu = Ano (tbd ⇒ bez vynucení)", () => {
    const params = sel15Base({ orez_lemu: "Ano" });
    const visible = visibleFieldKeys(sel15, params);
    expect(visible.has("orez_sirka")).toBe(true);
    expect(visible.has("orez_vyska")).toBe(true);
  });
});

describe("podmíněná viditelnost — ESD", () => {
  it("jiná délka řetízku jen při Délka řetízku = Jiná", () => {
    expect(visibleFieldKeys(esd, esdBase()).has("jina_delka_retizku")).toBe(false);

    const params = esdBase({ delka_retizku: "Jiná" });
    expect(visibleFieldKeys(esd, params).has("jina_delka_retizku")).toBe(true);
    const { issues } = validateItem(esd, params, "");
    expect(issuesForField(issues, "jina_delka_retizku")).toEqual([
      { level: "error", fieldKey: "jina_delka_retizku", message: "Povinné pole." },
    ]);

    const ok = validateItem(esd, { ...params, jina_delka_retizku: "1100/1600" }, "");
    expect(hasBlocking(ok.issues)).toBe(false);
  });
});

describe("pruneHidden — hodnoty skrytých polí se mažou", () => {
  it("RAL kód zmizí po přepnutí barvy zpět", () => {
    const params = sel15Base({ barva_profilu: "Bílá 9003", ral: "7035" });
    expect(pruneHidden(sel15, params)).not.toHaveProperty("ral");
  });

  it("jiná délka řetízku zmizí po návratu na Na výšku", () => {
    const params = esdBase({ delka_retizku: "Na výšku", jina_delka_retizku: "1100" });
    expect(pruneHidden(esd, params)).not.toHaveProperty("jina_delka_retizku");
  });

  it("neznámé klíče (starší verze definice) se zahodí", () => {
    const params = sel15Base({ stare_pole: "hodnota" });
    expect(pruneHidden(sel15, params)).not.toHaveProperty("stare_pole");
  });

  it("prázdné hodnoty se zahodí, ale číslo 0 a volba „0“ zůstávají", () => {
    const pruned = pruneHidden(esd, esdBase({ prevodovka: "", dist_podlozka: 0 }));
    expect(pruned).not.toHaveProperty("prevodovka");
    expect(pruned.dist_podlozka).toBe(0);

    const sel = pruneHidden(sel15, sel15Base({ otocne_hacky: "0" }));
    expect(sel.otocne_hacky).toBe("0");
  });
});

describe("čísla", () => {
  it("string se normalizuje na number (desetinná čárka i tečka)", () => {
    const { params } = validateItem(sel15, sel15Base({ sirka: "1200", vyska: "145,5" }), "");
    expect(params.sirka).toBe(1200);
    expect(params.vyska).toBe(145.5);
  });

  it("nečíslo je blokující chyba", () => {
    const { issues } = validateItem(sel15, sel15Base({ sirka: "abc" }), "");
    expect(issuesForField(issues, "sirka")).toEqual([
      { level: "error", fieldKey: "sirka", message: "Zadejte číslo." },
    ]);
  });

  it("min limit: ESD dist. podložka nesmí být záporná, 0 je platná", () => {
    const bad = validateItem(esd, esdBase({ dist_podlozka: -1 }), "");
    expect(issuesForField(bad.issues, "dist_podlozka")).toEqual([
      { level: "error", fieldKey: "dist_podlozka", message: "Minimum je 0." },
    ]);
    const ok = validateItem(esd, esdBase({ dist_podlozka: 0 }), "");
    expect(issuesForField(ok.issues, "dist_podlozka")).toEqual([]);
  });

  it("warnMin/warnMax jsou nezablokující varování", () => {
    const def = formDefinitionSchema.parse({
      groups: [
        {
          key: "g",
          label: "G",
          fields: [
            { key: "sirka", label: "Šířka", type: "number", unit: "mm", required: true, warnMin: 300, warnMax: 2500 },
          ],
        },
      ],
      rules: [],
      printMap: { sirka: "sirka", vyska: null, barva: null, strana: null, ovladani: null },
    });
    const low = validateItem(def, { sirka: 100 }, "");
    expect(low.issues).toEqual([
      {
        level: "warning",
        fieldKey: "sirka",
        message: "Neobvykle nízká hodnota (pod 300 mm) — zkontrolujte.",
      },
    ]);
    expect(hasBlocking(low.issues)).toBe(false);

    const high = validateItem(def, { sirka: 9999 }, "");
    expect(high.issues[0]?.level).toBe("warning");
  });
});

describe("selecty", () => {
  it("hodnota mimo options je blokující chyba", () => {
    const { issues } = validateItem(esd, esdBase({ barva_lamely: "999" }), "");
    expect(issuesForField(issues, "barva_lamely")).toEqual([
      { level: "error", fieldKey: "barva_lamely", message: "Neplatná hodnota — vyberte ze seznamu." },
    ]);
  });

  it("příplatková barva lamely (9940) je platná", () => {
    const { issues } = validateItem(esd, esdBase({ barva_lamely: "9940" }), "");
    expect(issuesForField(issues, "barva_lamely")).toEqual([]);
  });
});

describe("pravidla — minArea", () => {
  it("malá síť pod 0,8 m² hlásí info (mimo RAL)", () => {
    const { issues } = validateItem(sel15, sel15Base({ sirka: 500, vyska: 500 }), "");
    expect(issues).toContainEqual({
      level: "info",
      message: "Plocha je pod minimálním účtovaným rozměrem 0,8 m².",
    });
    expect(hasBlocking(issues)).toBe(false);
  });

  it("v RAL platí limit 2 m² (1,5 m² hlásí, 2,2 m² ne)", () => {
    const small = validateItem(sel15, sel15Base({ barva_profilu: "RAL", ral: "7035", sirka: 1000, vyska: 1500 }), "");
    expect(small.issues).toContainEqual({
      level: "info",
      message: "V barvě RAL je minimální účtovaný rozměr 2 m².",
    });

    const big = validateItem(sel15, sel15Base({ barva_profilu: "RAL", ral: "7035", sirka: 2000, vyska: 1100 }), "");
    expect(big.issues.filter((i) => i.level === "info")).toEqual([]);
  });

  it("nad 0,8 m² žádné hlášení", () => {
    const { issues } = validateItem(sel15, sel15Base({ sirka: 1000, vyska: 900 }), "");
    expect(issues.filter((i) => i.level === "info")).toEqual([]);
  });
});

describe("pravidla — requireNote (blokující)", () => {
  it("ořez lemu Ano bez poznámky blokuje uložení", () => {
    const { issues } = validateItem(sel15, sel15Base({ orez_lemu: "Ano" }), "");
    expect(issuesForField(issues, "note")).toEqual([
      { level: "error", fieldKey: "note", message: "Uveďte do poznámky, která strana sítě se ořezává." },
    ]);
    expect(hasBlocking(issues)).toBe(true);
  });

  it("s poznámkou projde", () => {
    const { issues } = validateItem(sel15, sel15Base({ orez_lemu: "Ano" }), "ořez vpravo 10 mm");
    expect(issuesForField(issues, "note")).toEqual([]);
  });

  it("ořez Ne poznámku nevynucuje", () => {
    const { issues } = validateItem(sel15, sel15Base(), "");
    expect(issuesForField(issues, "note")).toEqual([]);
  });
});
