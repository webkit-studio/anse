// Typy podkladů dodavatelů (podklady/data/*). Odvozené z DAT, ne z dokumentace —
// kde se dokumentace lišila, platí data (rozdíly viz docs/konfigurator-nalezy.md).
//
// Dva dodavatelé = dva různé modely závislostí, drží se ODDĚLENĚ
// (discriminated union `dodavatel`), protože se chovají jinak:
//  - Jack West pole ZAMYKÁ (disables/enables) a limity nese přímo na poli
//  - SUYS pole SKRÝVÁ (shows/hides) a limity počítá zvlášť v derivedLimits

// === Jack West — surový tvar (produkty-davka-2.json) =======================

export interface JwCatalog {
  source: string;
  generated: string;
  products: JwProduct[];
}

export interface JwProduct {
  zkratka: string;
  name: string;
  id: string;
  /** EŽ RS HŽ VŽ P LR OS PS DS VR ND */
  skupina: string;
  source: string;
  stats: Record<string, unknown>;
  sections: string[];
  fields: JwField[];
  rules: JwRule[];
}

export interface JwField {
  code: string;
  label: string;
  section: string;
  inputType: "select" | "text" | "number" | "textarea";
  tag: string;
  required: boolean;
  disabledByDefault: boolean;
  visibleByDefault: boolean;
  /** Číselné hranice jako řetězce; v datech dávky 2 je step a maxLength vždy null. */
  min: string | null;
  max: string | null;
  step: string | null;
  maxLength: string | null;
  defaultValue: string;
  hasSampleBook: boolean;
  hasStockCard: boolean;
  lecg: boolean;
  options: { value: string; label: string }[];
}

export interface JwRuleTarget {
  field: string;
  label: string;
}

export interface JwRule {
  when: { field: string; label: string; value: string; valueLabel: string };
  then: {
    disables?: JwRuleTarget[];
    enables?: JwRuleTarget[];
    shows?: JwRuleTarget[];
    hides?: JwRuleTarget[];
    setsValue?: { field: string; label: string; from: string; to: string }[];
    /** V datech vždy jen min NEBO max, nikdy obojí. */
    limits?: { field: string; label: string; min?: string; max?: string }[];
  };
  /** full = projeté všechny hodnoty; sample = vzorek 3 (pravidla můžou chybět);
   *  escalated = vzorek něco našel a doměřil se celý číselník. */
  measured: "full" | "sample" | "escalated";
  alerts: string[];
}

/** katalog-52-produktu.json — identifikace všech produktů poptávkového formuláře. */
export interface JwCatalogItem {
  ID: string;
  nsPrdKod: string;
  nsPrdNazev: string;
  nsPrdZkratka: string;
  nsPrdSkupVyr: string;
  nsPrdVrbcKod: string;
  iPrdVrbcID: string;
  poradi: number;
}

// === SUYS — surový tvar (produkty.json) ====================================

export interface SuysCatalog {
  source: string;
  generated: string;
  products: SuysProduct[];
}

export interface SuysProduct {
  code: string;
  name: string;
  source: string;
  stats: Record<string, unknown>;
  /** Taby konfigurátoru; fields = kódy polí v pořadí. */
  pages: { name: string; fields: string[] }[];
  fields: SuysField[];
  /** Interní parametry (bez UI); pravidla na ně můžou odkazovat. */
  internalFields: { code: string; label: string; dataType: string; defaultValue: string | null }[];
  rules: SuysRule[];
  derivedLimits: SuysDerivedLimits;
}

export interface SuysField {
  code: string;
  label: string;
  page: string;
  pageIndex: number;
  group: string | null;
  order: number;
  dataType: "Text" | "Code" | "Integer" | "Decimal" | "Boolean";
  displayType: "string" | "Slider" | "ListBox" | "Color";
  mandatory: boolean;
  editable: boolean;
  showOnWeb: boolean;
  visible: boolean;
  maxLength: number | null;
  defaultValue: string | null;
  defaultValueLabel: string | null;
  options: { value: string; label: string; group: string | null; color: string | null; image: string | null }[];
}

export interface SuysRule {
  when: { field: string; label: string; value: string; valueLabel: string };
  then: {
    /** visibleField říká, jestli je cíl viditelné pole, nebo interní parametr. */
    shows?: { field: string; label: string; visibleField: boolean }[];
    hides?: { field: string; label: string; visibleField: boolean }[];
    restricts?: {
      field: string;
      label: string;
      visibleField: boolean;
      removedOptions: string[];
      addedOptions: string[];
      count: [number, number];
    }[];
    setsValue?: { field: string; label: string; from: string | null; to: string | null }[];
  };
}

/** Limit vypočítaný konfigurátorem: hodnota podle hodnoty jiného pole.
 *  Naměřeno empiricky — hodnota "0" znamená „limit se nepodařilo odečíst",
 *  ne „nula milimetrů". */
export type SuysDerivedLimits = Record<
  string,
  { label: string; dependsOn: Record<string, Record<string, string>> }
>;

// === Normalizovaný vnitřní tvar ============================================

export type Dodavatel = "jackwest" | "suys";

export interface KonfigOption {
  value: string;
  label: string;
  color?: string;
  image?: string;
  group?: string;
}

export interface KonfigField {
  code: string;
  label: string;
  /** JW sekce formuláře / SUYS název tabu. */
  section: string;
  input: "select" | "text" | "number" | "textarea";
  required: boolean;
  defaultValue: string;
  defaultVisible: boolean;
  /** JW: disabledByDefault; SUYS: !editable. */
  defaultLocked: boolean;
  min: number | null;
  max: number | null;
  maxLength: number | null;
  options: KonfigOption[];
  hasSampleBook: boolean;
  hasStockCard: boolean;
}

export interface KonfigRule {
  when: { field: string; value: string };
  disables: string[];
  enables: string[];
  shows: string[];
  hides: string[];
  sets: { field: string; to: string }[];
  limits: { field: string; min?: number; max?: number }[];
  restricts: { field: string; removed: string[]; added: string[] }[];
  measured: "full" | "sample" | "escalated";
}

export interface KonfigProduct {
  dodavatel: Dodavatel;
  /** JW zkratka („Z90") / SUYS kód („C-SC_01"). */
  kod: string;
  nazev: string;
  skupina: string;
  sections: string[];
  fields: KonfigField[];
  rules: KonfigRule[];
  /** Jen SUYS — limity závislé na hodnotách jiných polí. */
  derivedLimits?: SuysDerivedLimits;
  /**
   * Cíle pravidel bez definice pole. U SUYS jde o parametry, které konfigurátor
   * vytváří dynamicky (baseline snapshot je nezachytil) — efekty na ně evidujeme,
   * ale nejde je vykreslit. U Jack Westu musí být prázdné.
   */
  latentTargets: string[];
}

/** Stav konfigurace: kód pole → hodnota (prázdný řetězec = nevyplněno). */
export type KonfigState = Record<string, string>;

/** Výsledek vyhodnocení pro jedno pole. */
export interface FieldEval {
  visible: boolean;
  locked: boolean;
  required: boolean;
  options: KonfigOption[];
  min: number | null;
  max: number | null;
}

export interface KonfigEval {
  fields: Record<string, FieldEval>;
  /** Hodnoty, které by konfigurátor sám přepsal (aplikuje UI, server nevynucuje). */
  autoSet: { field: string; to: string }[];
  /** Efekty mířící na latentní pole — pro diagnostiku. */
  latentEffects: { rule: string; effect: string; field: string }[];
}
