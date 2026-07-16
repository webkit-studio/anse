import type { Field, FormDefinition, Params } from "../form-schema";
import { evalConds, isEmpty } from "./conditions";

export function allFields(def: FormDefinition): Field[] {
  return def.groups.flatMap((g) => g.fields);
}

export function fieldByKey(def: FormDefinition, key: string): Field | undefined {
  return allFields(def).find((f) => f.key === key);
}

export function isFieldVisible(field: Field, params: Params): boolean {
  return evalConds(field.visibleIf, params);
}

export function visibleFieldKeys(def: FormDefinition, params: Params): Set<string> {
  return new Set(
    allFields(def)
      .filter((f) => isFieldVisible(f, params))
      .map((f) => f.key),
  );
}

/**
 * Vyčistí params před uložením: zahodí hodnoty skrytých polí (např. RAL kód
 * po přepnutí barvy zpět), neznámé klíče (pozůstatky starší verze definice
 * při duplikaci) a prázdné hodnoty. Volá se na klientu i na serveru.
 */
export function pruneHidden(def: FormDefinition, params: Params): Params {
  const visible = visibleFieldKeys(def, params);
  const out: Params = {};
  for (const [key, value] of Object.entries(params)) {
    if (visible.has(key) && !isEmpty(value)) out[key] = value;
  }
  return out;
}

/** Výchozí hodnoty formuláře — defaulty všech polí (kromě tbd). */
export function initialParams(def: FormDefinition): Params {
  const out: Params = {};
  for (const f of allFields(def)) {
    if (f.default !== undefined && !f.tbd) out[f.key] = f.default;
  }
  return out;
}
