// Termíny dodání po dodavatelích. Čistý modul — stejná pravidla běží na serveru
// (blokace, přepočet orders.term_dodani) i v UI (výpis, varování technika).
//
// Dodavatel se odvozuje z položek (podkategorie → výrobce). Položky bez
// výrobce (opravy) mají společný termín „Ostatní" — klíč je prázdný řetězec.

import { DODAVATELE, type DodavatelKlic } from "./dodavatele";

export const OSTATNI = "";

export interface DodaniRow {
  /** Klíč výrobce (jackwest, suys, neva) nebo "" = Ostatní. */
  dodavatel: string;
  /** Česky pro UI a notifikace. */
  nazev: string;
  /** YYYY-MM-DD, nebo null = ještě nezadáno. */
  term: string | null;
}

const PORADI: string[] = ["jackwest", "suys", "neva"];

export function dodavatelNazev(klic: string): string {
  if (!klic) return "Ostatní";
  return DODAVATELE[klic as DodavatelKlic]?.nazev ?? klic;
}

/** Dodavatelé zakázky z jejích položek — každý jednou, Ostatní na konci. */
export function dodavateleZPolozek(
  items: { subcategory_manufacturer?: string | null }[],
): string[] {
  const set = new Set(items.map((i) => i.subcategory_manufacturer ?? OSTATNI));
  const rank = (k: string) => (k === OSTATNI ? 1000 : PORADI.indexOf(k) >= 0 ? PORADI.indexOf(k) : 500);
  return [...set].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Řádky termínů: odvození dodavatelé + uložené termíny (cizí uložené se ignorují). */
export function dodaniRows(
  items: { subcategory_manufacturer?: string | null }[],
  stored: { dodavatel: string; term: string | null }[],
): DodaniRow[] {
  const map = new Map(stored.map((s) => [s.dodavatel, s.term]));
  return dodavateleZPolozek(items).map((d) => ({
    dodavatel: d,
    nazev: dodavatelNazev(d),
    term: map.get(d) ?? null,
  }));
}

/** Nejpozdější zadaný termín (ISO data jdou porovnat jako text). */
export function nejpozdejsi(rows: { term: string | null }[]): string | null {
  let max: string | null = null;
  for (const r of rows) if (r.term && (!max || r.term > max)) max = r.term;
  return max;
}

/**
 * Co chybí do „Objednáno". U jednoho dodavatele prostě „Termín dodání",
 * u víc dodavatelů se jmenuje, kterému termín chybí.
 */
export function chybejiciDodani(rows: DodaniRow[]): string[] {
  const chybi = rows.filter((r) => !r.term);
  if (chybi.length === 0) return [];
  if (rows.length === 1) return ["Termín dodání"];
  return chybi.map((r) => `Termín dodání (${r.nazev})`);
}

/** Dodavatelé, jejichž zboží dorazí až PO zadaném termínu montáže. */
export function dodaniPoMontazi(rows: DodaniRow[], termMontaz: string | null): DodaniRow[] {
  if (!termMontaz) return [];
  return rows.filter((r) => r.term && r.term > termMontaz);
}
