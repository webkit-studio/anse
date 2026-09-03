// Čitelný přehled parametrů položky.
//
// Kancelář zatím objednává ručně: otevře konfigurátor dodavatele a přepíše do
// něj, co technik naměřil. Proto se tady z uložených `params` (klíče jsou kódy
// polí) skládá seznam „popisek → hodnota" ve stejném pořadí a členění, v jakém
// je má formulář dodavatele — aby se dalo přepisovat shora dolů bez hledání.
//
// Modul je čistý (bez IO), počítá ho server a klient ho jen vykresluje: labely
// a kódy voleb tak nemůže rozhodit stará verze definice v prohlížeči.

import type { FormDefinition, Params } from "./form-schema";
import type { KonfigProduct } from "./konfigurator";

export interface ParamPolozka {
  label: string;
  /** Hodnota, jak ji uvidí člověk (u výběru popisek volby). */
  value: string;
  /** Kód dodavatele — to, co se opisuje do konfigurátoru. */
  code: string;
}

export interface ParamSkupina {
  nazev: string;
  polozky: ParamPolozka[];
}

function text(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

/** Produkty s definicí v DB (JSON v db/seeds/definitions). */
export function paramyZDefinice(def: FormDefinition, params: Params): ParamSkupina[] {
  const out: ParamSkupina[] = [];
  for (const g of def.groups) {
    const polozky: ParamPolozka[] = [];
    for (const f of g.fields) {
      const raw = text(params[f.key]);
      if (raw === "") continue;
      const opt = f.options?.find((o) => o.value === raw);
      polozky.push({
        label: f.label,
        value: opt ? opt.label : f.unit ? `${raw} ${f.unit}` : raw,
        code: raw,
      });
    }
    if (polozky.length) out.push({ nazev: g.label, polozky });
  }
  return out;
}

/** Produkty naměřené z konfigurátorů dodavatelů (bez definice v DB). */
export function paramyZKonfiguratoru(product: KonfigProduct, params: Params): ParamSkupina[] {
  const poradiSekci = product.sections.length ? product.sections : [""];
  const dle = new Map<string, ParamPolozka[]>();

  for (const f of product.fields) {
    const raw = text(params[f.code]);
    if (raw === "") continue;
    const opt = f.options.find((o) => o.value === raw);
    const seznam = dle.get(f.section) ?? [];
    seznam.push({ label: f.label, value: opt ? opt.label : raw, code: raw });
    dle.set(f.section, seznam);
  }

  const out: ParamSkupina[] = [];
  for (const sekce of poradiSekci) {
    const polozky = dle.get(sekce);
    if (polozky?.length) out.push({ nazev: sekce || "Údaje", polozky });
  }
  // Sekce, kterou schéma nezná (dynamický parametr dodavatele) — ať nezmizí.
  for (const [sekce, polozky] of dle) {
    if (!poradiSekci.includes(sekce) && polozky.length) {
      out.push({ nazev: sekce || "Ostatní", polozky });
    }
  }
  return out;
}
