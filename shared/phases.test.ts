import { describe, expect, it } from "vitest";
import {
  ALLOWED_PHASE_TRANSITIONS,
  ARCHIVE_PHASES,
  ORDER_PHASES,
  PHASE_FLOW,
  canTransition,
  phaseLabelFor,
  phaseTone,
} from "./types";
import { czDate, czDateShort, days, items, money } from "./format";

describe("stavový stroj zakázky", () => {
  it("posun jde jen vpřed po lince (mimo zrušení)", () => {
    for (const role of ["technik", "kancelar"] as const) {
      for (const [from, targets] of Object.entries(ALLOWED_PHASE_TRANSITIONS[role])) {
        for (const to of targets!) {
          if (to === "zruseno") continue;
          expect(PHASE_FLOW.indexOf(to)).toBeGreaterThan(PHASE_FLOW.indexOf(from as never));
        }
      }
    }
  });

  it("nikdo nemůže vrátit stav zpět", () => {
    expect(canTransition("kancelar", "k_montazi", "k_naceneni")).toBe(false);
    expect(canTransition("technik", "k_naceneni", "k_zamereni")).toBe(false);
    expect(canTransition("kancelar", "hotovo", "k_fakturaci")).toBe(false);
  });

  it("technik odesílá zaměření a hlásí montáž, nikdy neobjednává ani nefakturuje", () => {
    expect(canTransition("technik", "k_zamereni", "k_naceneni")).toBe(true);
    expect(canTransition("technik", "k_montazi", "k_fakturaci")).toBe(true);
    expect(canTransition("technik", "k_naceneni", "k_montazi")).toBe(false);
    expect(canTransition("technik", "k_fakturaci", "hotovo")).toBe(false);
  });

  it("technik ruší jen do nacenění, kancelář kdykoli mimo hotovo", () => {
    expect(canTransition("technik", "k_zamereni", "zruseno")).toBe(true);
    expect(canTransition("technik", "k_naceneni", "zruseno")).toBe(true);
    expect(canTransition("technik", "k_montazi", "zruseno")).toBe(false);
    for (const from of ["k_zamereni", "k_naceneni", "k_montazi", "k_fakturaci"] as const) {
      expect(canTransition("kancelar", from, "zruseno")).toBe(true);
    }
    expect(canTransition("kancelar", "hotovo", "zruseno")).toBe(false);
  });

  it("hotovo a zrušeno jsou koncové", () => {
    for (const role of ["technik", "kancelar"] as const) {
      expect(ALLOWED_PHASE_TRANSITIONS[role].hotovo ?? []).toEqual([]);
      expect(ALLOWED_PHASE_TRANSITIONS[role].zruseno ?? []).toEqual([]);
    }
  });

  it("technikovi je fakturace hotová práce, kanceláři běžící krok", () => {
    expect(phaseTone("k_fakturaci", "technik")).toBe("done");
    expect(phaseLabelFor("k_fakturaci", "technik")).toBe("Hotovo");
    expect(phaseTone("k_fakturaci", "kancelar")).toBe("work");
    expect(phaseLabelFor("k_fakturaci", "kancelar")).toBe("K fakturaci");
  });

  it("archiv technika = co už nemá v ruce", () => {
    expect(ARCHIVE_PHASES).toEqual(["k_fakturaci", "hotovo", "zruseno"]);
    expect(ORDER_PHASES).toHaveLength(6);
  });
});

describe("české formátování", () => {
  it("datum bez nul a s mezerami", () => {
    expect(czDate("2026-09-04")).toBe("4. 9. 2026");
    expect(czDate(null)).toBe("—");
    expect(czDateShort("2026-09-04", new Date("2026-05-01"))).toBe("4. 9.");
    expect(czDateShort("2025-09-04", new Date("2026-05-01"))).toBe("4. 9. 2025");
  });

  it("skloňování počtů", () => {
    expect(items(1)).toBe("1 položka");
    expect(items(3)).toBe("3 položky");
    expect(items(7)).toBe("7 položek");
    expect(days(1)).toBe("1 den");
    expect(days(2)).toBe("2 dny");
    expect(days(9)).toBe("9 dní");
  });

  it("částky s korunou, prázdná hodnota pomlčkou", () => {
    expect(money("18400")).toBe("18 400 Kč");
    expect(money("")).toBe("—");
    expect(money("dohodou")).toBe("dohodou");
  });
});
