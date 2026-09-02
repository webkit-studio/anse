import type { Field, FormDefinition, ParamValue, Params } from "../form-schema";
import { evalConds, isEmpty } from "./conditions";
import { allFields, isFieldVisible, pruneHidden } from "./visibility";

export type IssueLevel = "info" | "warning" | "error";

export interface Issue {
  level: IssueLevel;
  message: string;
  /** Klíč pole, ke kterému se hlášení váže; "note" = vestavěná poznámka; undefined = obecné. */
  fieldKey?: string;
}

export interface ValidationResult {
  /** Normalizované params: skryté/prázdné hodnoty pryč, čísla jako number. */
  params: Params;
  issues: Issue[];
}

export function hasBlocking(issues: Issue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function issuesForField(issues: Issue[], fieldKey: string): Issue[] {
  return issues.filter((i) => i.fieldKey === fieldKey);
}

/** Číslo z number nebo stringu (desetinná čárka i tečka). null = není číslo. */
export function toNumber(value: ParamValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined || value === "") return null;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function unitSuffix(f: Field): string {
  return f.unit ? ` ${f.unit}` : "";
}

/**
 * Kompletní validace položky proti definici. Běží identicky na klientu
 * (živě při psaní) a na serveru (před každým zápisem).
 */
export function validateItem(def: FormDefinition, rawParams: Params, note: string): ValidationResult {
  const params = pruneHidden(def, rawParams);
  const issues: Issue[] = [];

  for (const f of allFields(def)) {
    if (!isFieldVisible(f, params)) continue;
    if (f.tbd) continue; // podklady k poli ještě nejsou — nevaliduje se

    const value = params[f.key];
    const requiredByCond = f.requiredIf !== undefined && evalConds(f.requiredIf, params);
    const required = f.required === true || requiredByCond;

    if (isEmpty(value)) {
      if (required) issues.push({ level: "error", fieldKey: f.key, message: "Povinné pole." });
      continue;
    }

    if (f.type === "number") {
      const n = toNumber(value);
      if (n === null) {
        issues.push({ level: "error", fieldKey: f.key, message: "Zadej číslo." });
        continue;
      }
      params[f.key] = n; // normalizace: do DB jde number

      if (f.min != null && n < f.min) {
        issues.push({ level: "error", fieldKey: f.key, message: `Minimum je ${f.min}${unitSuffix(f)}.` });
      } else if (f.warnMin != null && n < f.warnMin) {
        issues.push({
          level: "warning",
          fieldKey: f.key,
          message: `Neobvykle nízká hodnota (pod ${f.warnMin}${unitSuffix(f)}) — zkontroluj.`,
        });
      }
      if (f.max != null && n > f.max) {
        issues.push({ level: "error", fieldKey: f.key, message: `Maximum je ${f.max}${unitSuffix(f)}.` });
      } else if (f.warnMax != null && n > f.warnMax) {
        issues.push({
          level: "warning",
          fieldKey: f.key,
          message: `Neobvykle vysoká hodnota (nad ${f.warnMax}${unitSuffix(f)}) — zkontroluj.`,
        });
      }
    }

    if (f.type === "select") {
      const valid = f.options?.some((o) => o.value === String(value)) ?? false;
      if (!valid) {
        issues.push({ level: "error", fieldKey: f.key, message: "Neplatná hodnota — vyber ze seznamu." });
      }
    }
  }

  // Definiční pravidla (registry) — instance jsou data, interpretace kód.
  for (const rule of def.rules) {
    if (!evalConds(rule.if, params)) continue;

    switch (rule.type) {
      case "minArea": {
        const w = toNumber(params[rule.widthField]);
        const h = toNumber(params[rule.heightField]);
        if (w !== null && h !== null) {
          const areaM2 = (w * h) / 1_000_000;
          if (areaM2 < rule.m2) issues.push({ level: rule.level, message: rule.message });
        }
        break;
      }
      case "requireNote": {
        if (note.trim() === "") {
          issues.push({ level: rule.level, fieldKey: "note", message: rule.message });
        }
        break;
      }
    }
  }

  return { params, issues };
}
