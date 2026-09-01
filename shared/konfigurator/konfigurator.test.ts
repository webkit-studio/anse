import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateKonfig, validateKonfig } from "./evaluate";
import { evaluateDerivedLimits, validateSuysDimensions } from "./limits";
import { loadJackWest, loadSuys } from "./load";
import type { JwCatalog, SuysCatalog } from "./types";

// Testy běží nad OSTRÝMI podklady — když spadnou, rozbila to transformace
// (nebo se změnila data, což má být vidět taky).

const jwRaw = JSON.parse(
  readFileSync(new URL("../../podklady/data/jack-west/produkty-davka-2.json", import.meta.url), "utf8"),
) as JwCatalog;
const suysRaw = JSON.parse(
  readFileSync(new URL("../../podklady/data/suys/produkty.json", import.meta.url), "utf8"),
) as SuysCatalog;

const jw = loadJackWest(jwRaw);
const suys = loadSuys(suysRaw);

describe("loader — kontrakt s daty", () => {
  it("Jack West: 42 produktů, 1483 polí, 1052 pravidel", () => {
    expect(jw).toHaveLength(42);
    expect(jw.reduce((n, p) => n + p.fields.length, 0)).toBe(1483);
    expect(jw.reduce((n, p) => n + p.rules.length, 0)).toBe(1052);
  });

  it("SUYS: 3 produkty, 59 viditelných polí, 119 pravidel", () => {
    expect(suys).toHaveLength(3);
    expect(suys.reduce((n, p) => n + p.fields.length, 0)).toBe(59);
    expect(suys.reduce((n, p) => n + p.rules.length, 0)).toBe(119);
  });

  it("povinný sirotčí test: Jack West nemá ŽÁDNÉ pravidlo mířící mimo fields", () => {
    for (const p of jw) expect({ kod: p.kod, latent: p.latentTargets }).toEqual({ kod: p.kod, latent: [] });
  });

  it("SUYS: latentní cíle jsou známé dynamické parametry — 52 kódů, žádné nové", () => {
    // Konfigurátor SUYS vytváří část parametrů dynamicky (kliky, další barvy…);
    // baseline snapshot je nezachytil, takže na ně pravidla míří „do prázdna".
    // Počty se nesmí měnit potichu — změna = přeměřit nebo vědomě upravit tady.
    const latent = suys.map((p) => ({ kod: p.kod, n: p.latentTargets.length }));
    expect(latent).toEqual([
      { kod: "C-SC_01", n: 48 },
      { kod: "C-SC_03", n: 28 },
      { kod: "C-SC_05", n: 0 },
    ]);
    const all = new Set(suys.flatMap((p) => p.latentTargets));
    expect(all.size).toBe(52);
  });

  it("JW limity na polích se parsují na čísla (181 polí s min/max)", () => {
    const withLimits = jw.flatMap((p) => p.fields).filter((f) => f.min !== null || f.max !== null);
    expect(withLimits.length).toBe(181);
    for (const f of withLimits) {
      if (f.min !== null && f.max !== null) expect(f.min).toBeLessThanOrEqual(f.max);
    }
  });

  it("JW rozměry kreslené jako text jsou u nás čísla — limit nesmí mlčky propadnout", () => {
    // editor výrobce má u rozměrů textové pole a limity vedle; validace min/max
    // u nás běží jen nad input=number, takže se pole musí překlopit v loaderu
    const withLimits = jw.flatMap((p) => p.fields).filter((f) => f.min !== null || f.max !== null);
    for (const f of withLimits) expect({ code: f.code, input: f.input }).toEqual({ code: f.code, input: "number" });

    const sde = jw.find((p) => p.kod === "SDEKM")!;
    const { issues } = validateKonfig(sde, { Sirka: "9999" });
    expect(issues.some((i) => i.fieldCode === "Sirka" && i.message.startsWith("Nejvýše"))).toBe(true);
  });
});

describe("vyhodnocovač — naměřené scénáře Jack West", () => {
  const sde = jw.find((p) => p.kod === "SDEKM")!;

  it("Síťovina=Protipylová zamkne průlez pro mazlíčky a smaže jeho hodnotu", () => {
    const before = evaluateKonfig(sde, {});
    expect(before.fields.Prulez_mazlicci!.locked).toBe(false);

    const after = evaluateKonfig(sde, { Sitovina: "Protipylová" });
    expect(after.fields.Prulez_mazlicci!.locked).toBe(true);
    expect(after.autoSet).toContainEqual({ field: "Prulez_mazlicci", to: "" });
  });

  it("zamčené pole se nevaliduje, i když je povinné", () => {
    const { issues } = validateKonfig(sde, { Sitovina: "Protipylová" });
    expect(issues.some((i) => i.fieldCode === "Prulez_mazlicci")).toBe(false);
  });

  it("rozměr mimo min/max pole je chyba", () => {
    const withMax = jw
      .flatMap((p) => p.fields.map((f) => ({ p, f })))
      .find((x) => x.f.input === "number" && x.f.max !== null && x.f.defaultVisible && !x.f.defaultLocked);
    expect(withMax).toBeDefined();
    const { p, f } = withMax!;
    const { issues } = validateKonfig(p, { [f.code]: String((f.max ?? 0) + 1) });
    expect(issues.some((i) => i.fieldCode === f.code && i.message.startsWith("Nejvýše"))).toBe(true);
  });

  it("pravidlo limits zpřísní hranici pole", () => {
    const pair = jw
      .flatMap((p) => p.rules.map((r) => ({ p, r })))
      .find((x) => x.r.limits.length > 0);
    expect(pair).toBeDefined();
    const { p, r } = pair!;
    const lim = r.limits[0]!;
    const ev = evaluateKonfig(p, { [r.when.field]: r.when.value });
    const fe = ev.fields[lim.field]!;
    if (lim.min !== undefined) expect(fe.min).toBe(lim.min);
    if (lim.max !== undefined) expect(fe.max).toBe(lim.max);
  });
});

describe("vyhodnocovač — naměřené scénáře SUYS", () => {
  const lock = suys.find((p) => p.kod === "C-SC_01")!;

  it("restricts změní nabídku voleb podle naměřeného pravidla", () => {
    const pair = lock.rules.find((r) => r.restricts.some((x) => x.removed.length > 0))!;
    const restrict = pair.restricts.find((x) => x.removed.length > 0)!;
    const ev = evaluateKonfig(lock, { [pair.when.field]: pair.when.value });
    const opts = ev.fields[restrict.field]?.options ?? [];
    for (const removed of restrict.removed) {
      expect(opts.map((o) => o.value)).not.toContain(removed);
    }
  });

  it("šířka látky: SOL00A dovolí 1700 mm, víc je chyba", () => {
    const state = { TYP_LATKY_1: "SOL00A", WIDTH_01: "1800" };
    const limits = evaluateDerivedLimits(lock, state);
    const width = limits.find((l) => l.limitCode === "CURTAIN_MAX_WIDTH")!;
    expect(width.value).toBe(1700);
    const issues = validateSuysDimensions(lock, state);
    expect(issues.some((i) => i.fieldCode === "WIDTH_01" && i.level === "error")).toBe(true);
    expect(validateSuysDimensions(lock, { TYP_LATKY_1: "SOL00A", WIDTH_01: "1650" })).toEqual([]);
  });

  it("látka s neodečteným limitem (nula v datech) jen varuje, neblokuje", () => {
    const issues = validateSuysDimensions(lock, { TYP_LATKY_1: "SRG01A", WIDTH_01: "2500" });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.level).toBe("warning");
  });

  it("výška se skládá z více zdrojů — bere se nejpřísnější", () => {
    const height = lock.derivedLimits!.CURTAIN_MAX_HEIGHT!;
    const srcFields = Object.keys(height.dependsOn);
    expect(srcFields.length).toBeGreaterThan(1);
    // stav se dvěma zdroji, které mají různé naměřené limity
    const [fa, fb] = srcFields;
    const va = Object.entries(height.dependsOn[fa!]!).find(([, v]) => Number(v) > 0);
    const vb = Object.entries(height.dependsOn[fb!]!).find(([, v]) => Number(v) > 0);
    if (va && vb) {
      const state = { [fa!]: va[0], [fb!]: vb[0] };
      const res = evaluateDerivedLimits(lock, state).find((l) => l.limitCode === "CURTAIN_MAX_HEIGHT")!;
      expect(res.value).toBe(Math.min(Number(va[1]), Number(vb[1])));
    }
  });
});
