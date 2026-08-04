import type { FormDefinition, Params } from "./form-schema";

// Mapování položek na řádky montážního listu (sloupce dle papírového vzoru:
// stínění · barva · šířka · výška · kusů · strana · ovládání · poznámky).
// Čisté funkce — používá je xlsx export, později i export pro výrobce.

export interface ListRow {
  /** Kód typu produktu (SEL-15, ESD…). */
  stineni: string;
  barva: string;
  sirka: string;
  vyska: string;
  ks: number;
  strana: string;
  ovladani: string;
  /** Poznámka položky (bez místnosti — tu doplňuje až layout). */
  poznamka: string;
}

export interface RoomGroup {
  roomName: string;
  roomNote: string;
  rows: ListRow[];
}

export interface ListItemInput {
  room_id: string;
  product_type_id: string;
  product_type_code: string;
  form_definition_id: string;
  params: Params;
  note: string;
  position: number;
}

export interface ListRoomInput {
  id: string;
  name: string;
  note: string;
  position: number;
}

/** Deterministický otisk hodnoty (seřazené klíče) pro porovnání identity položek. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Surová hodnota parametru — options[].value = kód výrobce, přesně co patří na papír. */
function paramText(params: Params, fieldKey: string | null): string {
  if (!fieldKey) return "";
  const value = params[fieldKey];
  if (value === undefined || value === null || value === "") return "";
  return String(value);
}

/**
 * Seskupí položky podle místností (v pořadí místností a položek) a IDENTICKÉ
 * položky (typ + verze definice + params + poznámka) v rámci místnosti sloučí
 * do jednoho řádku s ks=n — stejná okna se v aplikaci duplikují, na papíře
 * jsou jedním řádkem.
 */
export function aggregateForList(
  rooms: ListRoomInput[],
  items: ListItemInput[],
  definitions: Record<string, { definition: FormDefinition }>,
): RoomGroup[] {
  const groups: RoomGroup[] = [];

  for (const room of [...rooms].sort((a, b) => a.position - b.position)) {
    const roomItems = items
      .filter((i) => i.room_id === room.id)
      .sort((a, b) => a.position - b.position);
    if (roomItems.length === 0) continue;

    const rows: ListRow[] = [];
    const byIdentity = new Map<string, ListRow>();

    for (const item of roomItems) {
      const identity = [
        item.product_type_id,
        item.form_definition_id,
        stableStringify(item.params),
        item.note.trim(),
      ].join("|");

      const existing = byIdentity.get(identity);
      if (existing) {
        existing.ks += 1;
        continue;
      }

      const def = definitions[item.form_definition_id]?.definition;
      const row: ListRow = {
        stineni: item.product_type_code,
        barva: def ? paramText(item.params, def.printMap.barva) : "",
        sirka: def ? paramText(item.params, def.printMap.sirka) : "",
        vyska: def ? paramText(item.params, def.printMap.vyska) : "",
        ks: 1,
        strana: def ? paramText(item.params, def.printMap.strana) : "",
        ovladani: def ? paramText(item.params, def.printMap.ovladani) : "",
        poznamka: item.note.trim(),
      };
      byIdentity.set(identity, row);
      rows.push(row);
    }

    groups.push({ roomName: room.name, roomNote: room.note, rows });
  }

  return groups;
}

export function totalPieces(groups: RoomGroup[]): number {
  return groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.ks, 0), 0);
}

/** Vstup kontroly kompletnosti pro PDF — podmnožina zakázky + příznak podpisu. */
export interface PdfReadinessInput {
  montage_number: string;
  order_number: string;
  invoice_number: string;
  delivery_date: string | null;
  price_ex_vat: string;
  price_vat: string;
  price_montage: string;
  price_total: string;
  price_deposit: string;
  price_balance: string;
  montage_by: string;
  signed: boolean;
}

/**
 * Co brání PDF exportu montážního listu — prázdné pole = může se generovat.
 * Údaje pro export jde ukládat po částech, ale finální list musí být kompletní
 * (rozhodnutí Lukáš 4. 8.). Stejnou logiku vyhodnocuje server (tvrdé hlídání)
 * i UI (disabled tlačítko s nápovědou); popisky odpovídají polím v aplikaci.
 */
export function missingForPdf(order: PdfReadinessInput): string[] {
  const missing: string[] = [];
  if (!order.montage_number) missing.push("číslo montáže");
  if (!order.order_number) missing.push("číslo zakázky");
  if (!order.invoice_number) missing.push("číslo faktury");
  if (!order.delivery_date) missing.push("termín dodání");
  if (!order.price_ex_vat) missing.push("cena bez DPH");
  if (!order.price_vat) missing.push("DPH");
  if (!order.price_montage) missing.push("cena za montáž");
  if (!order.price_total) missing.push("cena celkem");
  if (!order.price_deposit) missing.push("záloha");
  if (!order.price_balance) missing.push("doplatek");
  if (!order.montage_by) missing.push("montáž provedl");
  if (!order.signed) missing.push("podpis zákazníka");
  return missing;
}
