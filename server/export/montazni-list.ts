import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { formDefinitionSchema, type FormDefinition } from "../../shared/form-schema";
import { aggregateForList, totalPieces } from "../../shared/print";
import { sql } from "../db";
import { ApiError } from "../http";

// Export montážního listu: plní šablonu docs/MO_vzor-1.xlsx (4v1 papír) —
// styly, merge, smluvní text i podpisové bloky zůstávají 1:1 ze vzoru.
//
// Geometrie šablony (viz extrakce vzoru):
//   H5/H6/H7  objednavatel: jméno / adresa / telefon      H9  místo montáže
//   H11       IČ/DIČ        F13 číslo montáže   G13 číslo objednávky
//   I13       termín vyměření          K13 termín dodání
//   ř. 17     hlavička tabulky (A stínění · B barva · C šířka · D výška ·
//             E kusů · F strana · G ovládání · H poznámky) · K18 celkem ks
//   ř. 19–36  řádky položek (kapacita 18; víc → vkládání řádků)
//   K24/27/30/33/38  ceny — nechávají se PRÁZDNÉ (ruční doplnění)
//   C40       vyměřeno dne + pracovník

const FIRST_ITEM_ROW = 19;
const TEMPLATE_CAPACITY = 18; // řádky 19–36, pak začínají podpisové bloky

function templatePath(): string {
  const candidates = [
    path.join(process.cwd(), "docs/MO_vzor-1.xlsx"),
    path.join(process.env.LAMBDA_TASK_ROOT ?? "", "docs/MO_vzor-1.xlsx"),
  ];
  try {
    // lokální ESM běh (tsx); v CJS bundle Netlify není import.meta.url použitelné
    candidates.push(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "../../docs/MO_vzor-1.xlsx"),
    );
  } catch {
    // ignorovat
  }
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  throw new ApiError(500, "Šablona montážního listu nebyla nalezena.");
}

function czDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

/** Jméno souboru bez diakritiky a mezer. */
export function exportFilename(orderNumber: string, orderId: string): string {
  const base = (orderNumber || orderId.slice(0, 8))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `montazni-list-${base || "zakazka"}.xlsx`;
}

export async function buildMontazniList(
  orderId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const db = sql();

  const [order] = await db`
    select o.id, o.installation_address, o.montage_number, o.order_number,
           to_char(o.measured_at, 'YYYY-MM-DD') as measured_at,
           to_char(o.delivery_date, 'YYYY-MM-DD') as delivery_date,
           c.name as client_name, c.contact_person, c.address, c.delivery_address,
           c.phone, c.email, c.ico, c.dic,
           u.name as created_by_name
    from orders o
    join clients c on c.id = o.client_id
    join users u on u.id = o.created_by
    where o.id = ${orderId}
  `;
  if (!order) throw new ApiError(404, "Zakázka nenalezena.");

  const rooms = await db`
    select id, name, note, position from rooms where order_id = ${orderId}
  `;
  const items = await db`
    select i.room_id, i.product_type_id, i.form_definition_id, i.params, i.note, i.position,
           pt.code as product_type_code
    from items i join product_types pt on pt.id = i.product_type_id
    where i.order_id = ${orderId}
  `;
  const defRows = await db`
    select fd.id, fd.definition from form_definitions fd
    where fd.id in (select distinct form_definition_id from items where order_id = ${orderId})
  `;

  const definitions: Record<string, { definition: FormDefinition }> = {};
  for (const d of defRows) {
    definitions[d.id as string] = { definition: formDefinitionSchema.parse(d.definition) };
  }

  const groups = aggregateForList(
    rooms.map((r) => ({ id: r.id, name: r.name, note: r.note, position: r.position })),
    items.map((i) => ({
      room_id: i.room_id,
      product_type_id: i.product_type_id,
      product_type_code: i.product_type_code,
      form_definition_id: i.form_definition_id,
      params: i.params,
      note: i.note,
      position: i.position,
    })),
    definitions,
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ApiError(500, "Šablona montážního listu je poškozená.");

  // --- vymazat vzorová data -------------------------------------------------
  const clearCells = ["H9", "F13", "G13", "I13", "K13", "K18", "K24", "K27", "K30", "K33", "K38"];
  for (const ref of clearCells) sheet.getCell(ref).value = null;
  for (let r = FIRST_ITEM_ROW; r <= FIRST_ITEM_ROW + 4; r++) {
    for (const col of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      sheet.getCell(`${col}${r}`).value = null;
    }
  }

  // --- hlavička -------------------------------------------------------------
  const addressLine = order.delivery_address
    ? `${order.address} / ${order.delivery_address}`
    : order.address;
  const nameLine = order.contact_person
    ? `${order.client_name} (${order.contact_person})`
    : order.client_name;

  sheet.getCell("H5").value = nameLine;
  sheet.getCell("H6").value = addressLine;
  sheet.getCell("H7").value = [order.phone, order.email].filter(Boolean).join(" · ");
  sheet.getCell("H9").value = order.installation_address;
  sheet.getCell("H11").value = [order.ico, order.dic].filter(Boolean).join(" / ");
  sheet.getCell("F13").value = order.montage_number || "";
  sheet.getCell("G13").value = order.order_number || "";
  sheet.getCell("I13").value = czDate(order.measured_at);
  sheet.getCell("K13").value = czDate(order.delivery_date);

  // --- položky --------------------------------------------------------------
  const rows = groups.flatMap((g) =>
    g.rows.map((row, idx) => ({
      ...row,
      poznamka: [
        idx === 0 ? `${g.roomName}${g.roomNote ? ` (${g.roomNote})` : ""}` : "",
        row.poznamka,
      ]
        .filter(Boolean)
        .join(" – "),
    })),
  );

  // víc položek než kapacita šablony → vložit řádky (posune ceny/podpisy konzistentně)
  if (rows.length > TEMPLATE_CAPACITY) {
    const extra = rows.length - TEMPLATE_CAPACITY;
    sheet.spliceRows(FIRST_ITEM_ROW + TEMPLATE_CAPACITY, 0, ...Array(extra).fill([]));
    for (let i = 0; i < extra; i++) {
      const target = sheet.getRow(FIRST_ITEM_ROW + TEMPLATE_CAPACITY + i);
      const source = sheet.getRow(FIRST_ITEM_ROW);
      target.height = source.height;
      for (const col of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]) {
        target.getCell(col).style = { ...source.getCell(col).style };
      }
    }
  }

  rows.forEach((row, i) => {
    const r = FIRST_ITEM_ROW + i;
    sheet.getCell(`A${r}`).value = row.stineni;
    sheet.getCell(`B${r}`).value = row.barva;
    sheet.getCell(`C${r}`).value = row.sirka ? Number(row.sirka) : "";
    sheet.getCell(`D${r}`).value = row.vyska ? Number(row.vyska) : "";
    sheet.getCell(`E${r}`).value = row.ks;
    sheet.getCell(`F${r}`).value = row.strana;
    sheet.getCell(`G${r}`).value = row.ovladani;
    const noteCell = sheet.getCell(`H${r}`);
    noteCell.value = row.poznamka;
    noteCell.alignment = { ...noteCell.alignment, wrapText: true };
  });

  sheet.getCell("K18").value = `${totalPieces(groups)} ks`;
  sheet.getCell("C40").value = [czDate(order.measured_at), order.created_by_name]
    .filter(Boolean)
    .join(" — ");

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, filename: exportFilename(order.order_number, order.id) };
}
