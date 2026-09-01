import type { KonfigProduct, KonfigState } from "./types";

// Souhrn položky pro seznamy, montážní list a XML export.
// Podklady dodavatelů nemají printMap jako naše ruční definice — klíčová pole
// (rozměry, barva, strana, ovládání) se hledají podle popisku/kódu pole.
// Heuristika je vědomá: u 42 produktů se pole jmenují pokaždé trochu jinak.

const MATCHERS: { key: keyof KonfigPrintValues; re: RegExp }[] = [
  { key: "sirka", re: /šíř|sirka|width/i },
  { key: "vyska", re: /výš|vyska|height/i },
  { key: "barva", re: /barva|color/i },
  { key: "strana", re: /strana|ovládání.*strana|side/i },
  { key: "ovladani", re: /ovládání|ovladani|pohon|drive|motor/i },
];

export interface KonfigPrintValues {
  sirka: string;
  vyska: string;
  barva: string;
  strana: string;
  ovladani: string;
}

export function konfigPrintValues(product: KonfigProduct, state: KonfigState): KonfigPrintValues {
  const out: KonfigPrintValues = { sirka: "", vyska: "", barva: "", strana: "", ovladani: "" };
  const val = (code: string): string => {
    const v = state[code];
    return v === undefined || v === null ? "" : String(v).trim();
  };

  // Hlavní rozměry napřed přesně (Sirka/Šířka bez přívlastku) — produkty mívají
  // víc rozměrových polí (Šířka vodících profilů…) a fuzzy shoda by vzala první.
  for (const f of product.fields) {
    const exact = f.code === "Sirka" || /^šířka$/i.test(f.label) || f.code === "WIDTH_01";
    if (exact && val(f.code) !== "") {
      out.sirka = val(f.code);
      break;
    }
  }
  for (const f of product.fields) {
    const exact = f.code === "Vyska" || /^výška$/i.test(f.label) || f.code === "HEIGHT_01";
    if (exact && val(f.code) !== "") {
      out.vyska = val(f.code);
      break;
    }
  }

  for (const f of product.fields) {
    const value = val(f.code);
    if (value === "") continue;
    // U výběrů je hodnota kód dodavatele — do souhrnu patří český popisek.
    const display = f.options.find((o) => o.value === value)?.label ?? value;
    for (const m of MATCHERS) {
      if (out[m.key] !== "") continue;
      if (m.re.test(f.label) || m.re.test(f.code)) {
        out[m.key] = m.key === "sirka" || m.key === "vyska" ? value : display;
        break; // jedno pole plní jen první odpovídající slot
      }
    }
  }
  return out;
}

/** Krátký souhrn do řádku položky: „900 × 1400 mm · P · 7016". */
export function konfigSummary(product: KonfigProduct, state: KonfigState): string {
  const v = konfigPrintValues(product, state);
  return [v.sirka && v.vyska ? `${v.sirka} × ${v.vyska} mm` : "", v.strana, v.barva]
    .filter(Boolean)
    .join(" · ");
}

/** Popisky polí pro XML export (kód → label). */
export function konfigLabels(product: KonfigProduct): Map<string, string> {
  return new Map(product.fields.map((f) => [f.code, f.label]));
}
