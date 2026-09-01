import type { FormDefinition, Params } from "./form-schema";

// Mapování položek na řádky montážního listu (sloupce dle papírového vzoru:
// stínění · barva · šířka · výška · kusů · strana · ovládání · poznámky).
// Čisté funkce — používá je xlsx export, později i export pro výrobce.

export interface ListRow {
  /** Název produktu (u zaměření i podkategorie, u opravy „⟳ Oprava"). */
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
  rows: ListRow[];
}

export interface ListItemInput {
  room_id: string;
  kind: "config" | "oprava";
  product_type_id: string;
  product_type_name: string;
  subcategory_name: string | null;
  form_definition_id: string | null;
  params: Params;
  note: string;
  defect_note: string;
  position: number;
  /** Předpočítané sloupce pro položky z konfigurátoru (nemají printMap). */
  printValues?: { barva: string; sirka: string; vyska: string; strana: string; ovladani: string };
}

export interface ListRoomInput {
  id: string;
  name: string;
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
      // Opravy se nikdy neslučují — každá závada je jiná.
      const identity =
        item.kind === "oprava"
          ? `oprava|${item.position}`
          : [
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

      const def = item.form_definition_id
        ? definitions[item.form_definition_id]?.definition
        : undefined;
      const pv = item.printValues;
      const row: ListRow = {
        stineni:
          item.kind === "oprava"
            ? `${item.product_type_name} — oprava`
            : [item.product_type_name, item.subcategory_name].filter(Boolean).join(" · "),
        barva: pv ? pv.barva : def ? paramText(item.params, def.printMap.barva) : "",
        sirka: pv ? pv.sirka : def ? paramText(item.params, def.printMap.sirka) : "",
        vyska: pv ? pv.vyska : def ? paramText(item.params, def.printMap.vyska) : "",
        ks: 1,
        strana: pv ? pv.strana : def ? paramText(item.params, def.printMap.strana) : "",
        ovladani: pv ? pv.ovladani : def ? paramText(item.params, def.printMap.ovladani) : "",
        poznamka: [item.kind === "oprava" ? item.defect_note.trim() : "", item.note.trim()]
          .filter(Boolean)
          .join(" – "),
      };
      byIdentity.set(identity, row);
      rows.push(row);
    }

    groups.push({ roomName: room.name, rows });
  }

  return groups;
}

export function totalPieces(groups: RoomGroup[]): number {
  return groups.reduce((sum, g) => sum + g.rows.reduce((s, r) => s + r.ks, 0), 0);
}

/** Vstup kontroly kompletnosti pro PDF — podmnožina zakázky + příznak podpisu. */
export interface PdfReadinessInput {
  invoice_no: string;
  signed: boolean;
}

/**
 * Co brání vystavení montážního listu — prázdné pole = může se generovat.
 * Bez čísla faktury a bez podpisu se list negeneruje (zadání §9); ostatní
 * údaje se na papír tisknou tak, jak jsou. Stejnou logiku vyhodnocuje server
 * (tvrdé hlídání) i UI (disabled tlačítko s nápovědou).
 */
export function missingForPdf(order: PdfReadinessInput): string[] {
  const missing: string[] = [];
  if (!order.invoice_no.trim()) missing.push("číslo faktury");
  if (!order.signed) missing.push("podpis zákazníka");
  return missing;
}
