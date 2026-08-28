import type { FormDefinition, Params } from "./form-schema";

// === role ==================================================================

export type Role = "technik" | "kancelar";

export const ROLE_LABELS: Record<Role, string> = {
  technik: "technik",
  kancelar: "kancelář",
};

// === fáze zakázky ==========================================================

export type OrderPhase =
  | "k_zamereni"
  | "k_naceneni"
  | "k_montazi"
  | "k_fakturaci"
  | "hotovo"
  | "zruseno";

/** Pořadí na lince; `zruseno` stojí mimo. */
export const PHASE_FLOW: OrderPhase[] = [
  "k_zamereni",
  "k_naceneni",
  "k_montazi",
  "k_fakturaci",
  "hotovo",
];

export const ORDER_PHASES: OrderPhase[] = [...PHASE_FLOW, "zruseno"];

export const PHASE_LABELS: Record<OrderPhase, string> = {
  k_zamereni: "K zaměření",
  k_naceneni: "K nacenění",
  k_montazi: "K montáži",
  k_fakturaci: "K fakturaci",
  hotovo: "Hotovo",
  zruseno: "Zrušeno",
};

/** Pět tónů stavu — barva jen zesiluje, nese je glyf + slovo (čitelné černobíle). */
export type Tone = "todo" | "work" | "wait" | "done" | "dead" | "idle";

export const TONE_GLYPHS: Record<Tone, string> = {
  todo: "●",
  work: "◐",
  wait: "○",
  done: "✓",
  dead: "✕",
  idle: "◇",
};

/**
 * Tón fáze podle role: „na tahu ty" (todo/work) vs. „čeká se na druhé" (wait).
 * Technik vidí „K fakturaci" jako hotovou práci (✓ Hotovo) — fakturace je věc
 * kanceláře a jeho se už netýká.
 */
const TONE_BY_ROLE: Record<Role, Record<OrderPhase, Tone>> = {
  technik: {
    k_zamereni: "work",
    k_naceneni: "wait",
    k_montazi: "todo",
    k_fakturaci: "done",
    hotovo: "done",
    zruseno: "dead",
  },
  kancelar: {
    k_zamereni: "wait",
    k_naceneni: "todo",
    k_montazi: "wait",
    k_fakturaci: "todo",
    hotovo: "done",
    zruseno: "dead",
  },
};

export function phaseTone(phase: OrderPhase, role: Role): Tone {
  return TONE_BY_ROLE[role][phase];
}

export function phaseLabelFor(phase: OrderPhase, role: Role): string {
  if (role === "technik" && phase === "k_fakturaci") return "Hotovo";
  return PHASE_LABELS[phase];
}

/**
 * Povolené přechody — JEN VPŘED, o jeden krok.
 * `zruseno` je mimo linku: technik ruší, dokud se nezačalo objednávat,
 * kancelář kdykoli mimo hotovo (zákazník nepřijal cenu).
 */
export const ALLOWED_PHASE_TRANSITIONS: Record<Role, Partial<Record<OrderPhase, OrderPhase[]>>> = {
  technik: {
    // admin i technik zaměřují (Marek jezdí taky) — odeslání k nacenění
    k_zamereni: ["k_naceneni", "zruseno"],
    k_naceneni: ["zruseno"],
    k_montazi: ["k_fakturaci"],
  },
  kancelar: {
    k_zamereni: ["k_naceneni", "zruseno"],
    k_naceneni: ["k_montazi", "zruseno"],
    k_montazi: ["k_fakturaci", "zruseno"],
    k_fakturaci: ["hotovo", "zruseno"],
  },
};

export function canTransition(role: Role, from: OrderPhase, to: OrderPhase): boolean {
  return (ALLOWED_PHASE_TRANSITIONS[role][from] ?? []).includes(to);
}

/** Fáze, které technik považuje za archiv. */
export const ARCHIVE_PHASES: OrderPhase[] = ["k_fakturaci", "hotovo", "zruseno"];

export const ROOM_PRESETS = ["Kuchyně", "Ložnice", "Obývací pokoj", "Chodba", "Koupelna"] as const;

/** Sazba pro presety ceny práce technika (Kč/h). */
export const HOURLY_RATE = 850;

// === uživatelé =============================================================

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface UserRow {
  id: string;
  name: string;
  role: Role;
  phone: string;
  email: string;
  active: boolean;
  created_at: string;
  /** Přihlašovací kód — vrací se POUZE na routách kanceláře. */
  code?: string;
}

// === kontakty ==============================================================

export interface ContactRow {
  id: string;
  name: string;
  phone: string;
  place: string;
  /** „● Ozvat se" — zhasne založením zakázky, ručně jde přepnout zpět. */
  fresh: boolean;
  /** Kdo se má ozvat — ať Jakub nevolá na kontakty, které si bere Marek. */
  assigned_to: string | null;
  assignee_name?: string | null;
  cancelled: boolean;
  cancelled_reason: string;
  created_at: string;
  updated_at: string;
  /** Dopočítané pro seznam. */
  order_count?: number;
  open_order_count?: number;
  notes_count?: number;
}

export interface ContactNote {
  id: number;
  contact_id: string;
  author_id: string;
  author_name: string;
  text: string;
  created_at: string;
}

export interface ContactDetail {
  contact: ContactRow;
  notes: ContactNote[];
  orders: OrderListRow[];
}

// === zakázky ===============================================================

export interface OrderRow {
  id: string;
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  phase: OrderPhase;
  assignee_id: string | null;
  assignee_name: string | null;

  /** Údaje zákazníka (blokující krok technika u první položky). */
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  addr_montaz: string;
  addr_fakt: string;
  /** Fakturační adresa je stejná jako montážní (addr_fakt se pak ignoruje). */
  addr_fakt_same: boolean;
  ico: string;
  dic: string;

  /** Cena zakázky pro zákazníka — server ji technikovi NEPOSÍLÁ. */
  price_customer?: string;
  /** Cena práce technika — vidí obě role. */
  price_montage: string;

  term_dodani: string | null;
  term_montaz: string | null;
  measured_at: string | null;
  /** Nepovinný čas zaměření (HH:MM). */
  measured_time: string | null;

  invoice_no: string;
  order_no: string;
  note: string;
  cancelled_reason: string;

  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderListRow {
  id: string;
  contact_id: string;
  contact_name: string;
  /** Jméno zákazníka na zakázce; dokud ho technik nevyplní, zůstává prázdné. */
  customer_name: string;
  phase: OrderPhase;
  addr_montaz: string;
  assignee_id: string | null;
  assignee_name: string | null;
  item_count: number;
  price_customer?: string;
  term_dodani: string | null;
  term_montaz: string | null;
  signed_at: string | null;
  updated_at: string;
}

export interface RoomRow {
  id: string;
  order_id: string;
  name: string;
  position: number;
}

export type ItemKind = "config" | "oprava";

export interface ItemPhoto {
  id: string;
  item_id: string | null;
  kind: "zamereni" | "zavada" | "realizace";
  data: string;
  created_at: string;
}

export interface ItemRow {
  id: string;
  order_id: string;
  room_id: string;
  kind: ItemKind;
  product_type_id: string;
  product_type_name: string;
  subcategory_id: string | null;
  subcategory_name: string | null;
  form_definition_id: string | null;
  params: Params;
  note: string;
  /** Jen u oprav: popis závady (povinný). */
  defect_note: string;
  position: number;
  updated_at: string;
  photos: ItemPhoto[];
}

export interface OrderDetail {
  order: OrderRow;
  rooms: RoomRow[];
  items: ItemRow[];
  photos: ItemPhoto[];
  definitions: Record<string, { version: number; definition: FormDefinition }>;
  /** Co chybí k odeslání do další fáze — počítá server, UI to jen vypíše. */
  blocking: string[];
}

// === produkty ==============================================================

export interface SubcategoryRow {
  id: string;
  product_type_id: string;
  code: string;
  name: string;
  custom_name: string;
  note: string;
  active: boolean;
  sort: number;
  definition?: FormDefinition;
  definition_version?: number;
  field_count?: number;
}

export interface ProductTypeRow {
  id: string;
  code: string;
  name: string;
  custom_name: string;
  note_for_tech: string;
  active: boolean;
  sort: number;
  subcategories: SubcategoryRow[];
}

/** Zobrazený název: přepis vyhrává, originál se ukazuje jen v nastavení. */
export function displayName(t: { name: string; custom_name: string }): string {
  return t.custom_name.trim() || t.name;
}

// === notifikace ============================================================

export type NotifEvent =
  | "termin_dodani"
  | "novy_kontakt"
  | "zakazka_zrusena"
  | "nove_zamereni"
  | "namontovano"
  | "zruseno_technikem"
  | "stoji";

export interface NotifEventMeta {
  event: NotifEvent;
  /** Komu chodí. */
  to: Role;
  label: string;
  trigger: string;
  /** Šablona zprávy pro tabulku v nastavení. */
  template: string;
  emailDefault: boolean;
}

export const NOTIF_EVENTS: NotifEventMeta[] = [
  {
    event: "termin_dodani",
    to: "technik",
    label: "Termín dodání",
    trigger: "Kancelář dá Objednáno",
    template: "{zakázka} — dodání {datum}. Zadej termín montáže.",
    emailDefault: true,
  },
  {
    event: "novy_kontakt",
    to: "technik",
    label: "Přidělený kontakt",
    trigger: "Kontakt přidělen uživateli",
    template: "{jméno} — kontakt přidělený tobě. Ozvi se.",
    emailDefault: true,
  },
  {
    event: "zakazka_zrusena",
    to: "technik",
    label: "Zakázka zrušena",
    trigger: "Kancelář zruší po nacenění",
    template: "{zakázka} — zákazník nabídku nepřijal. Zakázka je zrušená.",
    emailDefault: true,
  },
  {
    event: "nove_zamereni",
    to: "kancelar",
    label: "Nové zaměření",
    trigger: "Technik odešle K nacenění",
    template: "{zakázka} — {položky} k nacenění.",
    emailDefault: true,
  },
  {
    event: "namontovano",
    to: "kancelar",
    label: "Namontováno",
    trigger: "Technik podepíše a dá hotovo",
    template: "{zakázka} — podpis uložen, zakázka je k fakturaci.",
    emailDefault: true,
  },
  {
    event: "zruseno_technikem",
    to: "kancelar",
    label: "Zrušeno technikem",
    trigger: "Technik zruší kontakt/zakázku",
    template: "{zakázka} — technik zrušil: {důvod}.",
    emailDefault: false,
  },
  {
    event: "stoji",
    to: "kancelar",
    label: "Zakázka stojí",
    trigger: "Zakázka 7 dní bez pohybu",
    template: "{zakázka} — {dny} bez pohybu.",
    emailDefault: false,
  },
];

export interface NotificationRow {
  id: number;
  event: NotifEvent;
  title: string;
  body: string;
  order_id: string | null;
  contact_id: string | null;
  read: boolean;
  created_at: string;
}

export interface NotifPref {
  event: NotifEvent;
  email: boolean;
}

// === přehledy ==============================================================

export type PhaseCounts = Record<OrderPhase, number>;

/** Dnešek technika — server posílá rovnou rozdělené sekce. */
export interface TodayData {
  namontovat: OrderListRow[];
  dokoncit: OrderListRow[];
  ozvat: ContactRow[];
  /** Kolik zakázek leží u kanceláře (šedý info blok). */
  v_kancelari: number;
}

export interface StatsTech {
  name: string;
  zamereno: number;
  namontovano: number;
  price_montage_sum?: string;
}

export interface StatsMonth {
  month: string;
  kpi: {
    nove_kontakty: number;
    zamereno: number;
    objednano: number;
    hotovo: number;
  };
  funnel: { label: string; value: number }[];
  techs: StatsTech[];
}

export interface Settings {
  admin_group_email: string;
}
