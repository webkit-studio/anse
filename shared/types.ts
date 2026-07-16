import type { FormDefinition, Params } from "./form-schema";

export type Role = "technik" | "admin";

export type OrderStatus =
  | "k_vymereni"
  | "rozpracovana"
  | "k_objednani"
  | "objednano"
  | "namontovano";

export const ORDER_STATUSES: OrderStatus[] = [
  "k_vymereni",
  "rozpracovana",
  "k_objednani",
  "objednano",
  "namontovano",
];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  k_vymereni: "K vyměření",
  rozpracovana: "Rozpracovaná",
  k_objednani: "K objednání",
  objednano: "Objednáno",
  namontovano: "Namontováno",
};

/**
 * Povolené přechody stavů per role. Technik nikdy nenastaví „Objednáno";
 * admin může stavy i vracet (opravy omylů).
 */
export const ALLOWED_TRANSITIONS: Record<Role, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  technik: {
    k_vymereni: ["rozpracovana"],
    rozpracovana: ["k_vymereni", "k_objednani"],
    k_objednani: ["rozpracovana"],
    objednano: ["namontovano"],
  },
  admin: {
    k_vymereni: ["rozpracovana"],
    rozpracovana: ["k_vymereni", "k_objednani"],
    k_objednani: ["rozpracovana", "objednano"],
    objednano: ["k_objednani", "namontovano"],
    namontovano: ["objednano"],
  },
};

export const ROOM_PRESETS = ["Kuchyně", "Ložnice", "Obývací pokoj", "Chodba", "Koupelna"] as const;

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
}

export interface UserRow {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
  /** Přihlašovací kód — vrací se POUZE na admin routách. */
  code?: string;
}

export interface ClientRow {
  id: string;
  name: string;
  contact_person: string;
  address: string;
  delivery_address: string;
  phone: string;
  email: string;
  ico: string;
  dic: string;
  note: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  client_id: string;
  installation_address: string;
  montage_number: string;
  order_number: string;
  status: OrderStatus;
  measured_at: string | null;
  delivery_date: string | null;
  invoice_number: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface OrderListRow {
  id: string;
  client_name: string;
  installation_address: string;
  status: OrderStatus;
  montage_number: string;
  order_number: string;
  item_count: number;
  updated_at: string;
}

export interface RoomRow {
  id: string;
  order_id: string;
  name: string;
  note: string;
  position: number;
}

export interface ItemRow {
  id: string;
  order_id: string;
  room_id: string;
  product_type_id: string;
  form_definition_id: string;
  params: Params;
  note: string;
  position: number;
  updated_at: string;
  product_type_code: string;
  product_type_name: string;
}

export interface OrderDetail {
  order: OrderRow;
  client: ClientRow;
  rooms: RoomRow[];
  items: ItemRow[];
  /** Definice použité položkami (pinned verze) — pro vykreslení souhrnů a editaci. */
  definitions: Record<string, { version: number; definition: FormDefinition }>;
}

export interface ProductTypeRow {
  id: string;
  code: string;
  name: string;
  manufacturer: "jackwest" | "neva" | "susy";
  active: boolean;
  sort: number;
  /** Aktuální definice — jen u aktivních typů. */
  current_definition_id: string | null;
  definition?: FormDefinition;
  definition_version?: number;
}

export type DashboardCounts = Record<OrderStatus, number>;

export interface Settings {
  admin_group_email: string;
}
