import { describe, expect, it } from "vitest";
import { formDefinitionSchema, type FormDefinition } from "./form-schema";
import { aggregateForList, totalPieces, type ListItemInput } from "./print";
import esdRaw from "../db/seeds/definitions/esd.v1.json";

const esd: FormDefinition = formDefinitionSchema.parse(esdRaw);
const DEF_ID = "def-esd";
const definitions = { [DEF_ID]: { definition: esd } };

const baseParams = {
  sirka: 900,
  vyska: 1400,
  ovladani_strana: "P",
  barva_lamely: "58",
  barva_retizku: "Standard",
  delka_retizku: "Na výšku",
  profil_horni: "Bílá 9003",
  profil_spodni: "Bílá 9003",
};

function item(overrides: Partial<ListItemInput> = {}): ListItemInput {
  return {
    room_id: "r1",
    product_type_id: "pt-esd",
    kind: "config" as const,
    product_type_name: "Interiérová žaluzie",
    subcategory_name: "Jack West · ESD",
    defect_note: "",
    form_definition_id: DEF_ID,
    params: baseParams,
    note: "",
    position: 1,
    ...overrides,
  };
}

const rooms = [
  { id: "r1", name: "Kuchyně", position: 1 },
  { id: "r2", name: "Ložnice", position: 2 },
];

describe("aggregateForList", () => {
  it("identické položky v místnosti se sloučí do jednoho řádku s ks=n", () => {
    const groups = aggregateForList(
      rooms,
      [item({ position: 1 }), item({ position: 2 }), item({ position: 3 })],
      definitions,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows).toHaveLength(1);
    expect(groups[0]!.rows[0]!.ks).toBe(3);
    expect(totalPieces(groups)).toBe(3);
  });

  it("odlišné params nebo poznámka = samostatné řádky", () => {
    const groups = aggregateForList(
      rooms,
      [
        item({ position: 1 }),
        item({ position: 2, params: { ...baseParams, sirka: 1000 } }),
        item({ position: 3, note: "posunout doleva" }),
      ],
      definitions,
    );
    expect(groups[0]!.rows).toHaveLength(3);
    expect(totalPieces(groups)).toBe(3);
  });

  it("stejná okna v různých místnostech se neslučují", () => {
    const groups = aggregateForList(
      rooms,
      [item({ room_id: "r1" }), item({ room_id: "r2" })],
      definitions,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]!.roomName).toBe("Kuchyně");
    expect(groups[1]!.roomName).toBe("Ložnice");
  });

  it("sloupce se mapují přes printMap definice (surové hodnoty = kódy výrobce)", () => {
    const groups = aggregateForList(rooms, [item()], definitions);
    const row = groups[0]!.rows[0]!;
    expect(row.stineni).toBe("Interiérová žaluzie · Jack West · ESD");
    expect(row.sirka).toBe("900");
    expect(row.vyska).toBe("1400");
    expect(row.barva).toBe("58");
    expect(row.strana).toBe("P"); // hodnota, ne label „P — pravá"
    expect(row.ovladani).toBe("Na výšku");
  });

  it("prázdné místnosti se vynechávají, pořadí dle position", () => {
    const groups = aggregateForList(
      [
        { id: "r2", name: "Ložnice", position: 2 },
        { id: "r1", name: "Kuchyně", position: 1 },
        { id: "r3", name: "Prázdná", position: 3 },
      ],
      [item({ room_id: "r2" }), item({ room_id: "r1" })],
      definitions,
    );
    expect(groups.map((g) => g.roomName)).toEqual(["Kuchyně", "Ložnice"]);
  });

  it("opravy se nikdy neslučují — každá závada je jiná", () => {
    const oprava = (position: number): ListItemInput => ({
      ...item({ position }),
      kind: "oprava",
      form_definition_id: null,
      params: {},
      defect_note: "netěsní",
    });
    const groups = aggregateForList(rooms, [oprava(1), oprava(2)], definitions);
    expect(groups[0]!.rows).toHaveLength(2);
    expect(groups[0]!.rows[0]!.stineni).toContain("oprava");
    expect(groups[0]!.rows[0]!.poznamka).toBe("netěsní");
  });
});
