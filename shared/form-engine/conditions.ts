import type { Cond, Conds, ParamValue, Params } from "../form-schema";

/**
 * Prázdná hodnota je POUZE undefined / null / "".
 * Číslo 0 i řetězec "0" (např. Otočné háčky = 0) jsou platné hodnoty —
 * žádné falsy zkratky.
 */
export function isEmpty(value: ParamValue | undefined | null): boolean {
  return value === undefined || value === null || value === "";
}

export function evalCond(cond: Cond, params: Params): boolean {
  const raw = params[cond.field];
  const value = isEmpty(raw) ? "" : String(raw);
  switch (cond.op) {
    case "eq":
      return value === cond.value;
    case "neq":
      return value !== cond.value;
    case "in":
      return (cond.values ?? []).includes(value);
  }
}

/** Jedna podmínka nebo pole podmínek = AND. Bez podmínky ⇒ true. */
export function evalConds(conds: Conds | undefined, params: Params): boolean {
  if (conds === undefined) return true;
  const list = Array.isArray(conds) ? conds : [conds];
  return list.every((c) => evalCond(c, params));
}
