import { formDefinitionSchema, type FormDefinition } from "../../shared/form-schema";
import { sql } from "../db";
import { ApiError } from "../http";

// Export zaměření pro dodavatele. Do XML jdou KÓDY VÝROBCE (options[].value),
// ne české popisky — soubor čte editor dodavatele, ne člověk. Opravy se
// neexportují (nemají konfiguraci).

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tag(name: string, value: string, indent = "    "): string {
  return `${indent}<${name}>${esc(value)}</${name}>`;
}

/** Popisek pole z definice — do atributu, ať je soubor čitelný i pro člověka. */
function fieldLabels(def: FormDefinition): Map<string, string> {
  const labels = new Map<string, string>();
  for (const group of def.groups) {
    for (const field of group.fields) labels.set(field.key, field.label);
  }
  return labels;
}

export async function buildDodavatelXml(
  orderId: string,
): Promise<{ xml: string; filename: string }> {
  const db = sql();

  const [order] = await db`
    select o.id, o.order_no, o.addr_montaz, o.customer_name,
           to_char(o.measured_at, 'YYYY-MM-DD') as measured_at,
           c.name as contact_name
    from orders o join contacts c on c.id = o.contact_id
    where o.id = ${orderId}
  `.catch((err) => {
    if ((err as { code?: string }).code === "22P02") return [];
    throw err;
  });
  if (!order) throw new ApiError(404, "Zakázka nenalezena.");

  const items = await db`
    select i.id, i.kind, i.params, i.note, i.position, i.form_definition_id,
           r.name as room_name,
           pt.code as product_code, sc.code as subcategory_code, sc.manufacturer
    from items i
    join rooms r on r.id = i.room_id
    join product_types pt on pt.id = i.product_type_id
    left join subcategories sc on sc.id = i.subcategory_id
    where i.order_id = ${orderId} and i.kind = 'config'
    order by r.position, i.position
  `;
  if (items.length === 0) {
    throw new ApiError(400, "Zakázka nemá žádné zaměřené položky k exportu.");
  }

  const defRows = await db`
    select id, definition from form_definitions
    where id in (
      select distinct form_definition_id from items
      where order_id = ${orderId} and form_definition_id is not null
    )
  `;
  const labelsByDef = new Map<string, Map<string, string>>();
  for (const d of defRows) {
    labelsByDef.set(d.id as string, fieldLabels(formDefinitionSchema.parse(d.definition)));
  }

  const body = items
    .map((i) => {
      const labels = labelsByDef.get(i.form_definition_id as string) ?? new Map<string, string>();
      const params = Object.entries((i.params ?? {}) as Record<string, string | number>)
        .map(
          ([key, value]) =>
            `      <param kod="${esc(key)}" popis="${esc(labels.get(key) ?? key)}">${esc(String(value))}</param>`,
        )
        .join("\n");
      return [
        `  <polozka poradi="${i.position}">`,
        tag("mistnost", String(i.room_name ?? ""), "    "),
        tag("produkt", String(i.product_code ?? ""), "    "),
        tag("podkategorie", String(i.subcategory_code ?? ""), "    "),
        tag("vyrobce", String(i.manufacturer ?? ""), "    "),
        `    <parametry>`,
        params,
        `    </parametry>`,
        tag("poznamka", String(i.note ?? ""), "    "),
        `  </polozka>`,
      ]
        .filter((l) => l !== "")
        .join("\n");
    })
    .join("\n");

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<zakazka cislo="${esc(String(order.order_no || order.id))}" zamereno="${esc(String(order.measured_at ?? ""))}">`,
    tag("zakaznik", String(order.customer_name || order.contact_name || ""), "  "),
    tag("adresa_montaze", String(order.addr_montaz ?? ""), "  "),
    body,
    `</zakazka>`,
  ].join("\n");

  const base = String(order.order_no || order.id)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { xml, filename: `zamereni-${base || "zakazka"}.xml` };
}
