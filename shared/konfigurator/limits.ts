import { parseNum } from "./load";
import type { KonfigIssue } from "./evaluate";
import type { KonfigProduct, KonfigState } from "./types";

// Validátor rozměrů.
//  - Jack West: min/max sedí přímo na poli (případně posunuté pravidlem `limits`)
//    a hlídá je validateKonfig v evaluate.ts.
//  - SUYS: na poli limity nejsou — jsou vypočítané v derivedLimits a visí na
//    hodnotách jiných polí (šířka podle typu látky, výška navíc podle typu
//    clony a velikosti boxu). Tenhle modul je vyhodnotí pro aktuální stav.

/** Který vypočítaný limit hlídá které vstupní pole. Ostatní derivedLimits
 *  (momenty, hmotnosti) jsou informační — uživatel je nezadává. */
const SUYS_LIMIT_TARGETS: Record<string, { field: string; kind: "max" }> = {
  CURTAIN_MAX_WIDTH: { field: "WIDTH_01", kind: "max" },
  CURTAIN_MAX_HEIGHT: { field: "HEIGHT_01", kind: "max" },
};

export interface DerivedLimitResult {
  limitCode: string;
  label: string;
  targetField: string;
  /** Nejpřísnější známá hodnota; null = pro aktuální kombinaci limit neznáme. */
  value: number | null;
  /** Zdroje, ze kterých hodnota vzešla (pole → jeho hodnota → limit). */
  sources: { field: string; value: string; limit: number }[];
  /** Kombinace, kde měření vrátilo „0" = limit neodečten. */
  unknownSources: { field: string; value: string }[];
}

/**
 * Vyhodnotí SUYS derivedLimits pro daný stav. Limit visí na hodnotách více polí;
 * bere se NEJPŘÍSNĚJŠÍ z naměřených kandidátů. Hodnota „0" v datech znamená
 * „limit se nepodařilo odečíst" — nevalidujeme tvrdě, jen hlásíme neznámo.
 */
export function evaluateDerivedLimits(
  product: KonfigProduct,
  state: KonfigState,
): DerivedLimitResult[] {
  if (product.dodavatel !== "suys" || !product.derivedLimits) return [];

  const out: DerivedLimitResult[] = [];
  for (const [limitCode, def] of Object.entries(product.derivedLimits)) {
    const target = SUYS_LIMIT_TARGETS[limitCode];
    if (!target) continue;

    const sources: DerivedLimitResult["sources"] = [];
    const unknown: DerivedLimitResult["unknownSources"] = [];

    for (const [srcField, byValue] of Object.entries(def.dependsOn)) {
      const current = state[srcField];
      if (current === undefined || current === "") continue;
      const raw = byValue[current];
      if (raw === undefined) continue;
      const n = parseNum(raw);
      if (n === null || n <= 0) {
        unknown.push({ field: srcField, value: current });
      } else {
        sources.push({ field: srcField, value: current, limit: n });
      }
    }

    const value = sources.length ? Math.min(...sources.map((s) => s.limit)) : null;
    out.push({ limitCode, label: def.label, targetField: target.field, value, sources, unknownSources: unknown });
  }
  return out;
}

/** Rozměrové chyby/varování SUYS pro daný stav — přidávají se k validateKonfig. */
export function validateSuysDimensions(product: KonfigProduct, state: KonfigState): KonfigIssue[] {
  const issues: KonfigIssue[] = [];
  for (const lim of evaluateDerivedLimits(product, state)) {
    const raw = (state[lim.targetField] ?? "").trim();
    if (raw === "") continue;
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) continue;

    const label = product.fields.find((f) => f.code === lim.targetField)?.label ?? lim.targetField;
    if (lim.value !== null && n > lim.value) {
      const via = lim.sources
        .filter((s) => s.limit === lim.value)
        .map((s) => s.field)
        .join(", ");
      issues.push({
        fieldCode: lim.targetField,
        label,
        level: "error",
        message: `Nejvýše ${lim.value} mm pro zvolenou kombinaci (${lim.label.toLowerCase()}, dáno: ${via}).`,
      });
    } else if (lim.value === null && lim.unknownSources.length > 0) {
      issues.push({
        fieldCode: lim.targetField,
        label,
        level: "warning",
        message: "Pro zvolenou látku není limit rozměru v podkladech — ověř u dodavatele.",
      });
    }
  }
  return issues;
}
