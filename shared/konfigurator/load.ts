import type {
  Dodavatel,
  JwCatalog,
  JwProduct,
  KonfigField,
  KonfigProduct,
  KonfigRule,
  SuysCatalog,
  SuysProduct,
} from "./types";

// Loader: surové podklady → jeden vnitřní tvar. Čistý modul bez IO — soubory
// čte volající (server je importuje jako JSON, skripty přes fs).

/** „1 300" / „1300" → 1300; nesmysl → null (v datech jsou hranice řetězce). */
export function parseNum(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function jwField(f: JwProduct["fields"][number]): KonfigField {
  const min = parseNum(f.min);
  const max = parseNum(f.max);
  // Editor výrobce kreslí rozměry jako TEXTOVÁ pole s číselnými limity vedle.
  // Naměřený limit (nebo jasný rozměrový popisek) ⇒ u nás číslo: numerická
  // klávesnice a hlavně validace min/max — u textu by limity mlčky propadly.
  const numeric =
    f.inputType === "text" && (min !== null || max !== null || /šíř|výš/i.test(f.label));
  return {
    code: f.code,
    label: f.label,
    section: f.section,
    input: numeric ? "number" : f.inputType,
    required: f.required,
    defaultValue: f.defaultValue ?? "",
    defaultVisible: f.visibleByDefault,
    defaultLocked: f.disabledByDefault,
    min,
    max,
    maxLength: parseNum(f.maxLength),
    options: f.options.map((o) => ({ value: o.value, label: o.label })),
    hasSampleBook: f.hasSampleBook,
    hasStockCard: f.hasStockCard,
  };
}

function targets(list: { field: string }[] | undefined): string[] {
  return (list ?? []).map((t) => t.field);
}

export function normalizeJwProduct(p: JwProduct): KonfigProduct {
  const codes = new Set(p.fields.map((f) => f.code));
  const latent = new Set<string>();

  const rules: KonfigRule[] = p.rules.map((r) => {
    const rule: KonfigRule = {
      when: { field: r.when.field, value: r.when.value },
      disables: targets(r.then.disables),
      enables: targets(r.then.enables),
      shows: targets(r.then.shows),
      hides: targets(r.then.hides),
      sets: (r.then.setsValue ?? []).map((s) => ({ field: s.field, to: s.to })),
      limits: (r.then.limits ?? []).map((l) => {
        const out: { field: string; min?: number; max?: number } = { field: l.field };
        const min = parseNum(l.min ?? null);
        const max = parseNum(l.max ?? null);
        if (min !== null) out.min = min;
        if (max !== null) out.max = max;
        return out;
      }),
      restricts: [],
      measured: r.measured,
    };
    for (const t of [
      ...rule.disables,
      ...rule.enables,
      ...rule.shows,
      ...rule.hides,
      ...rule.sets.map((s) => s.field),
      ...rule.limits.map((l) => l.field),
    ]) {
      if (!codes.has(t)) latent.add(t);
    }
    return rule;
  });

  return {
    dodavatel: "jackwest",
    kod: p.zkratka,
    nazev: p.name,
    skupina: p.skupina,
    sections: p.sections,
    fields: p.fields.map(jwField),
    rules,
    latentTargets: [...latent].sort(),
  };
}

/** SUYS displayType → náš vstup. Slider i ListBox jsou výběr z voleb;
 *  Color je výběr s barevnou tečkou; Integer/Decimal bez voleb je číslo. */
function suysInput(f: SuysProduct["fields"][number]): KonfigField["input"] {
  if (f.options.length > 0) return "select";
  if (f.dataType === "Integer" || f.dataType === "Decimal") return "number";
  return "text";
}

function suysField(f: SuysProduct["fields"][number]): KonfigField {
  return {
    code: f.code,
    label: f.label,
    section: f.page,
    input: suysInput(f),
    required: f.mandatory,
    defaultValue: f.defaultValue ?? "",
    defaultVisible: f.visible,
    defaultLocked: !f.editable,
    // SUYS nenese limity na poli — rozměry hlídá derivedLimits (viz limits.ts)
    min: null,
    max: null,
    maxLength: f.maxLength,
    options: f.options.map((o) => ({
      value: o.value,
      label: o.label,
      ...(o.color ? { color: o.color } : {}),
      ...(o.image ? { image: o.image } : {}),
      ...(o.group ? { group: o.group } : {}),
    })),
    hasSampleBook: false,
    hasStockCard: false,
  };
}

export function normalizeSuysProduct(p: SuysProduct): KonfigProduct {
  const codes = new Set([
    ...p.fields.map((f) => f.code),
    ...p.internalFields.map((f) => f.code),
  ]);
  const latent = new Set<string>();

  const rules: KonfigRule[] = p.rules.map((r) => {
    const rule: KonfigRule = {
      when: { field: r.when.field, value: r.when.value },
      disables: [],
      enables: [],
      shows: targets(r.then.shows),
      hides: targets(r.then.hides),
      sets: (r.then.setsValue ?? []).map((s) => ({ field: s.field, to: s.to ?? "" })),
      limits: [],
      restricts: (r.then.restricts ?? []).map((x) => ({
        field: x.field,
        removed: x.removedOptions,
        added: x.addedOptions,
      })),
      measured: "full",
    };
    for (const t of [
      ...rule.shows,
      ...rule.hides,
      ...rule.sets.map((s) => s.field),
      ...rule.restricts.map((x) => x.field),
    ]) {
      if (!codes.has(t)) latent.add(t);
    }
    return rule;
  });

  // krátký kód („C-SC_01 Lockscreen…" → „C-SC_01")
  const kod = p.code.split(" ")[0] ?? p.code;

  return {
    dodavatel: "suys",
    kod,
    nazev: p.name,
    skupina: "SC",
    sections: p.pages.map((pg) => pg.name),
    fields: p.fields.map(suysField),
    rules,
    derivedLimits: p.derivedLimits,
    latentTargets: [...latent].sort(),
  };
}

export function loadJackWest(raw: JwCatalog): KonfigProduct[] {
  return raw.products.map(normalizeJwProduct);
}

export function loadSuys(raw: SuysCatalog): KonfigProduct[] {
  return raw.products.map(normalizeSuysProduct);
}

/** Oba katalogy do jedné mapy `dodavatel:kod` → produkt. */
export function loadAll(jw: JwCatalog, suys: SuysCatalog): Map<string, KonfigProduct> {
  const map = new Map<string, KonfigProduct>();
  for (const p of [...loadJackWest(jw), ...loadSuys(suys)]) {
    map.set(konfigKey(p.dodavatel, p.kod), p);
  }
  return map;
}

export function konfigKey(dodavatel: Dodavatel, kod: string): string {
  return `${dodavatel}:${kod}`;
}
