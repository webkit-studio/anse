import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formDefinitionSchema, type FormDefinition } from "../../shared/form-schema";
import { konfigPrintValues } from "../../shared/konfigurator";
import { aggregateForList, missingForPdf, totalPieces } from "../../shared/print";
import { getKonfigProduct } from "../konfigurator";
import { sql } from "../db";
import { ApiError } from "../http";
import { FONT_BOLD_B64, FONT_REGULAR_B64 } from "./font.b64";

// Finální montážní list jako PDF s vlepeným digitálním podpisem zákazníka.
// Generuje se až po montáži: server pouští export jen s vyplněným číslem
// montáže, objednávky a faktury a s podpisem (viz missingForPdf).
// Rozvržení zrcadlí papírový vzor 4v1 (docs/MO_vzor-1.xlsx); ceny zůstávají
// prázdné pro ruční doplnění.

const PAGE_W = 595.28; // A4 na výšku
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - 2 * MARGIN;

const INK = rgb(0.09, 0.12, 0.16);
const GRAY = rgb(0.45, 0.48, 0.52);
const LINE = rgb(0.72, 0.75, 0.78);
const HEAD_BG = rgb(0.93, 0.95, 0.96);

// Texty z papírového vzoru (sharedStrings šablony) — drží se 1:1.
const TITLE = "SMLOUVA O DÍLO / MONTÁŽNÍ LIST / REKLAMAČNÍ PROTOKOL / OBJEDNÁVKOVÝ FORMULÁŘ";
const SUPPLIER_LINES = [
  "FWDS Europe, a.s.",
  "Podbabská 1112/13, 160 00 Praha 6 – Bubeneč",
  "IČO: 60197421, DIČ: CZ60197421",
  "B.ú. 2701646081/2010",
  "Příjem objednávek: Darina Konderlová",
  "tel.: 776 195 720, e-mail: konderlova@fwds.cz",
  "Technik: Marek Konderla",
  "mobil: 775 995 720, konderla@fwds.cz",
  "www.anse.cz · Instagram: anse_stinici_technika",
];
const CONTRACT_TEXT =
  "Objednavatel se zavazuje vytvořit zhotoviteli řádné podmínky pro vykonání díla dohodnutého v této smlouvě. " +
  "Objednatel zaplatí v den uzavření této smlouvy zhotoviteli zálohu ve výši 70 % z celkové dohodnuté ceny. " +
  "V případě odstoupení od smlouvy ze strany objednatele se bude poskytnutá záloha považovat za sjednané odstupné. " +
  "Doplatek dohodnuté ceny za zhotovené dílo se objednatel zavazuje uhradit v den ukončení montáže. " +
  "V případě prodlení objednatele s doplacením peněžního závazku zhotoviteli, nebo jeho části, souhlasí objednatel " +
  "s penále 0,1 % z dlužné částky za každý den prodlení. Předmět této smlouvy o dílo je majetkem zhotovitele až do " +
  "jeho úplného zaplacení. Zahájení prací na díle bude provedeno dle dohody. V případě nepříznivých klimatických " +
  "podmínek lze kdykoliv změnit termín montáže, dle dohody obou stran. Zhotovitel se zavazuje vykonat řádnou dodávku " +
  "a montáž podle dohodnuté smlouvy. Zhotovitel na dokončené dílo poskytuje záruku: 24 měsíců na montáž, 24 měsíců " +
  "na materiál. Záruční lhůta se nevztahuje na poškození díla způsobené nesprávnou manipulací. Termín zhotovení " +
  "počíná běžet ode dne složení zálohy. Se smluvní cenou objednatel souhlasí, což potvrzuje svým podpisem. " +
  "Jakékoliv úpravy předmětu smlouvy po podpisu jsou přípustné pouze po dohodě obou stran.";

// Sloupce tabulky položek (šířky v pt, součet = CONTENT_W).
const COLS = [
  { key: "stineni", label: "stínění", w: 52 },
  { key: "barva", label: "barva", w: 62 },
  { key: "sirka", label: "šířka", w: 38 },
  { key: "vyska", label: "výška", w: 38 },
  { key: "ks", label: "kusů", w: 30 },
  { key: "strana", label: "strana", w: 40 },
  { key: "ovladani", label: "ovládání", w: 60 },
  { key: "poznamka", label: "poznámky", w: CONTENT_W - 320 },
] as const;

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
  return `montazni-list-${base || "zakazka"}.pdf`;
}

interface PdfOrder {
  id: string;
  addr_montaz: string;
  addr_fakt: string;
  order_no: string;
  invoice_no: string;
  price_customer: string;
  price_montage: string;
  measured_at: string | null;
  term_dodani: string | null;
  term_montaz: string | null;
  signature_png: string | null;
  signer_name: string;
  signed_date: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  ico: string;
  dic: string;
  contact_name: string;
  assignee_name: string | null;
  created_by_name: string;
}

// --- text helpers -----------------------------------------------------------

/** Rozlomí přes-dlouhé slovo po znacích, ať nikdy nepřeteče buňku. */
function breakWord(word: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const parts: string[] = [];
  let chunk = "";
  for (const ch of word) {
    if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
      parts.push(chunk);
      chunk = ch;
    } else {
      chunk += ch;
    }
  }
  if (chunk) parts.push(chunk);
  return parts;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const pieces =
      font.widthOfTextAtSize(word, size) > maxWidth ? breakWord(word, font, size, maxWidth) : [word];
    for (const piece of pieces) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = piece;
      } else {
        line = candidate;
      }
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// --- kreslení ---------------------------------------------------------------

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
}

function newPage(ctx: Ctx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

/** Zajistí místo na stránce; když nezbývá, začne novou. */
function ensure(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  size: number,
  opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {},
): void {
  ctx.page.drawText(text, {
    x,
    y: ctx.y - size,
    size,
    font: opts.bold ? ctx.bold : ctx.regular,
    color: opts.color ?? INK,
  });
}

/** Popisek + hodnota na jednom řádku; hodnota se zalamuje. Posune kurzor. */
function labeledLine(ctx: Ctx, label: string, value: string, x: number, width: number): void {
  const size = 8.5;
  const leading = 11.5;
  drawText(ctx, label, x, size, { color: GRAY });
  const labelW = ctx.regular.widthOfTextAtSize(label, size) + 5;
  const lines = wrap(value, ctx.bold, size, width - labelW);
  for (const [i, line] of lines.entries()) {
    if (i > 0) ctx.y -= leading;
    ctx.page.drawText(line, {
      x: x + labelW,
      y: ctx.y - size,
      size,
      font: ctx.bold,
      color: INK,
    });
  }
  ctx.y -= leading;
}

function dottedLine(ctx: Ctx, x1: number, x2: number, y: number): void {
  ctx.page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness: 0.7,
    color: GRAY,
    dashArray: [2, 2],
  });
}

// --- tabulka položek --------------------------------------------------------

interface TableRow {
  stineni: string;
  barva: string;
  sirka: string;
  vyska: string;
  ks: string;
  strana: string;
  ovladani: string;
  poznamka: string;
}

function drawTableHeader(ctx: Ctx): void {
  const size = 8;
  const h = 16;
  ensure(ctx, h);
  ctx.page.drawRectangle({
    x: MARGIN,
    y: ctx.y - h,
    width: CONTENT_W,
    height: h,
    color: HEAD_BG,
    borderColor: LINE,
    borderWidth: 0.7,
  });
  let x = MARGIN;
  for (const col of COLS) {
    ctx.page.drawText(col.label, {
      x: x + 3,
      y: ctx.y - h + 4.5,
      size,
      font: ctx.bold,
      color: INK,
    });
    x += col.w;
  }
  ctx.y -= h;
}

function drawTableRow(ctx: Ctx, row: TableRow): void {
  const size = 8;
  const leading = 9.5;
  const padY = 3;
  // Řádek se musí vejít na jednu stránku (pod hlavičku tabulky) — extrémně
  // dlouhá poznámka se zkrátí s výpustkou, jinak by text tiše přetekl okraj.
  const maxLines = Math.floor((PAGE_H - 2 * MARGIN - 16 - 2 * padY) / leading);

  const cells = COLS.map((col) => wrap(row[col.key], ctx.regular, size, col.w - 6));
  for (const cell of cells) {
    if (cell.length > maxLines) {
      cell.length = maxLines;
      cell[maxLines - 1] = `${cell[maxLines - 1]}…`;
    }
  }
  const lineCount = Math.max(...cells.map((c) => c.length));
  const h = lineCount * leading + 2 * padY;

  if (ctx.y - h < MARGIN) {
    newPage(ctx);
    drawTableHeader(ctx);
  }

  const top = ctx.y;
  let x = MARGIN;
  for (const [ci, col] of COLS.entries()) {
    for (const [li, line] of cells[ci]!.entries()) {
      ctx.page.drawText(line, {
        x: x + 3,
        y: top - padY - (li + 1) * leading + 2,
        size,
        font: ctx.regular,
        color: INK,
      });
    }
    // svislé linky buňky
    ctx.page.drawLine({
      start: { x, y: top },
      end: { x, y: top - h },
      thickness: 0.5,
      color: LINE,
    });
    x += col.w;
  }
  ctx.page.drawLine({ start: { x, y: top }, end: { x, y: top - h }, thickness: 0.5, color: LINE });
  ctx.page.drawLine({
    start: { x: MARGIN, y: top - h },
    end: { x: MARGIN + CONTENT_W, y: top - h },
    thickness: 0.5,
    color: LINE,
  });
  ctx.y -= h;
}

// --- hlavní builder ---------------------------------------------------------

export async function buildMontazniListPdf(
  orderId: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const db = sql();

  const [order] = (await db`
    select o.id, o.addr_montaz,
           case when o.addr_fakt_same then o.addr_montaz else o.addr_fakt end as addr_fakt,
           o.order_no, o.invoice_no,
           o.price_customer, o.price_montage,
           o.customer_name, o.customer_phone, o.customer_email, o.ico, o.dic,
           to_char(o.measured_at, 'YYYY-MM-DD') as measured_at,
           to_char(o.term_dodani, 'YYYY-MM-DD') as term_dodani,
           to_char(o.term_montaz, 'YYYY-MM-DD') as term_montaz,
           s.data as signature_png, s.signer_name,
           to_char(s.signed_at at time zone 'Europe/Prague', 'YYYY-MM-DD') as signed_date,
           c.name as contact_name,
           a.name as assignee_name,
           u.name as created_by_name
    from orders o
    join contacts c on c.id = o.contact_id
    join users u on u.id = o.created_by
    left join users a on a.id = o.assignee_id
    left join signatures s on s.order_id = o.id
    where o.id = ${orderId}
  `) as unknown as [PdfOrder | undefined];
  if (!order) throw new ApiError(404, "Zakázka nenalezena.");

  const missing = missingForPdf({
    invoice_no: order.invoice_no,
    signed: Boolean(order.signature_png),
  });
  if (missing.length > 0) {
    throw new ApiError(400, `Montážní list zatím nejde vystavit — chybí: ${missing.join(", ")}.`);
  }

  const rooms = await db`
    select id, name, position from rooms where order_id = ${orderId}
  `;
  const items = await db`
    select i.room_id, i.kind, i.product_type_id, i.subcategory_id, i.form_definition_id,
           i.konfig_key, i.params, i.note, i.defect_note, i.position,
           coalesce(nullif(pt.custom_name, ''), pt.name) as product_type_name,
           coalesce(nullif(sc.custom_name, ''), sc.name) as subcategory_name
    from items i
    join product_types pt on pt.id = i.product_type_id
    left join subcategories sc on sc.id = i.subcategory_id
    where i.order_id = ${orderId}
  `;
  const defRows = await db`
    select fd.id, fd.definition from form_definitions fd
    where fd.id in (
      select distinct form_definition_id from items
      where order_id = ${orderId} and form_definition_id is not null
    )
  `;
  const definitions: Record<string, { definition: FormDefinition }> = {};
  for (const d of defRows) {
    definitions[d.id as string] = { definition: formDefinitionSchema.parse(d.definition) };
  }

  const groups = aggregateForList(
    rooms.map((r) => ({ id: r.id, name: r.name, position: r.position })),
    items.map((i) => {
      const product = i.konfig_key ? getKonfigProduct(i.konfig_key as string) : undefined;
      return {
        room_id: i.room_id,
        kind: i.kind,
        product_type_id: i.product_type_id,
        product_type_name: i.product_type_name,
        subcategory_name: i.subcategory_name,
        form_definition_id: i.form_definition_id,
        params: i.params,
        note: i.note,
        defect_note: i.defect_note,
        position: i.position,
        ...(product ? { printValues: konfigPrintValues(product, i.params ?? {}) } : {}),
      };
    }),
    definitions,
  );

  // Místnost jde do poznámky prvního řádku skupiny (jak je zvykem na papíře).
  const tableRows: TableRow[] = groups.flatMap((g) =>
    g.rows.map((row, idx) => ({
      stineni: row.stineni,
      barva: row.barva,
      sirka: row.sirka,
      vyska: row.vyska,
      ks: String(row.ks),
      strana: row.strana,
      ovladani: row.ovladani,
      poznamka: [idx === 0 ? g.roomName : "", row.poznamka]
        .filter(Boolean)
        .join(" – "),
    })),
  );

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(Buffer.from(FONT_REGULAR_B64, "base64"), { subset: true });
  const bold = await doc.embedFont(Buffer.from(FONT_BOLD_B64, "base64"), { subset: true });

  const ctx: Ctx = { doc, page: undefined as unknown as PDFPage, y: 0, regular, bold };
  newPage(ctx);

  // --- titulek --------------------------------------------------------------
  const titleSize = 9.5;
  const titleW = bold.widthOfTextAtSize(TITLE, titleSize);
  drawText(ctx, TITLE, MARGIN + (CONTENT_W - titleW) / 2, titleSize, { bold: true });
  ctx.y -= titleSize + 12;

  // --- dodavatel × objednavatel --------------------------------------------
  const colLeftX = MARGIN;
  const colRightX = MARGIN + 250;
  const colRightW = CONTENT_W - 250;
  const headerTop = ctx.y;

  drawText(ctx, "Dodavatel:", colLeftX, 8.5, { color: GRAY });
  ctx.y -= 12;
  for (const [i, line] of SUPPLIER_LINES.entries()) {
    drawText(ctx, line, colLeftX, 8.5, { bold: i === 0 });
    ctx.y -= 11.5;
  }
  const leftBottom = ctx.y;

  ctx.y = headerTop;
  drawText(ctx, "Objednavatel:", colRightX, 8.5, { color: GRAY });
  ctx.y -= 12;
  const nameLine = order.customer_name || order.contact_name;
  labeledLine(ctx, "Firma/Jméno:", nameLine, colRightX, colRightW);
  labeledLine(ctx, "Fakturační adresa:", order.addr_fakt || order.addr_montaz, colRightX, colRightW);
  labeledLine(
    ctx,
    "Tel./e-mail:",
    [order.customer_phone, order.customer_email].filter(Boolean).join(" · "),
    colRightX,
    colRightW,
  );
  if (order.ico || order.dic) {
    labeledLine(ctx, "IČ/DIČ:", [order.ico, order.dic].filter(Boolean).join(" / "), colRightX, colRightW);
  }
  labeledLine(ctx, "Místo montáže:", order.addr_montaz, colRightX, colRightW);

  ctx.y = Math.min(ctx.y, leftBottom) - 6;

  // --- čísla a termíny ------------------------------------------------------
  ensure(ctx, 30);
  const quarters = CONTENT_W / 4;
  const numbers: Array<[string, string]> = [
    ["číslo zakázky", order.order_no],
    ["termín zaměření", czDate(order.measured_at)],
    ["termín dodání", czDate(order.term_dodani)],
    ["termín montáže", czDate(order.term_montaz)],
  ];
  const numTop = ctx.y;
  for (const [i, [label, value]] of numbers.entries()) {
    const x = MARGIN + i * quarters;
    ctx.page.drawText(label, { x, y: numTop - 8, size: 7.5, font: regular, color: GRAY });
    ctx.page.drawText(value || "—", { x, y: numTop - 20, size: 9.5, font: bold, color: INK });
  }
  ctx.y = numTop - 30;

  // --- tabulka položek ------------------------------------------------------
  drawTableHeader(ctx);
  for (const row of tableRows) drawTableRow(ctx, row);

  ensure(ctx, 16);
  const totalText = `celkem ks: ${totalPieces(groups)}`;
  const totalW = bold.widthOfTextAtSize(totalText, 9);
  ctx.y -= 4;
  drawText(ctx, totalText, MARGIN + CONTENT_W - totalW, 9, { bold: true });
  ctx.y -= 18;

  // --- ceny + FA ------------------------------------------------------------
  // Hodnoty z aplikace (gating zaručuje vyplnění); prázdné pole → tečkovaná
  // linka k ručnímu doplnění (obrana pro historická data).
  ensure(ctx, 42);
  const priceLabels: Array<[string, string]> = [
    ["cena zakázky", order.price_customer],
    ["z toho montáž", order.price_montage],
  ];
  const priceTop = ctx.y;
  const priceColW = CONTENT_W / 3;
  for (const [i, [label, value]] of priceLabels.entries()) {
    const x = MARGIN + (i % 3) * priceColW;
    const rowY = priceTop - Math.floor(i / 3) * 24;
    ctx.page.drawText(`${label}:`, { x, y: rowY - 9, size: 8.5, font: regular, color: GRAY });
    const labelW = regular.widthOfTextAtSize(`${label}:`, 8.5);
    if (value) {
      ctx.page.drawText(value, { x: x + labelW + 6, y: rowY - 9, size: 9, font: bold, color: INK });
    } else {
      dottedLine(ctx, x + labelW + 6, x + priceColW - 14, rowY - 9);
    }
  }
  ctx.y = priceTop - 24;
  ctx.page.drawText(`FA č.: ${order.invoice_no}`, {
    x: MARGIN,
    y: ctx.y - 9,
    size: 9,
    font: bold,
    color: INK,
  });
  ctx.y -= 22;

  // --- vyměřeno + podpisy ---------------------------------------------------
  const SIG_BLOCK_H = 78;
  ensure(ctx, SIG_BLOCK_H + 26);

  drawText(ctx, "zaměřeno dne/pracovník:", MARGIN, 8.5, { color: GRAY });
  const measuredText = [czDate(order.measured_at), order.assignee_name ?? order.created_by_name]
    .filter(Boolean)
    .join(" — ");
  ctx.page.drawText(measuredText, {
    x: MARGIN + regular.widthOfTextAtSize("zaměřeno dne/pracovník:", 8.5) + 6,
    y: ctx.y - 8.5,
    size: 8.5,
    font: bold,
    color: INK,
  });
  ctx.y -= 20;

  const sigTop = ctx.y;
  const sigX = MARGIN + 300;
  drawText(ctx, "podpis objednavatele:", sigX, 8.5, { color: GRAY });

  // Podpis: PNG z canvas (tmavé tahy na průhledném pozadí), vlevo dole od popisku.
  // embedPng hází na poškozená data (i plain string) — srozumitelná chyba
  // místo generické 500 pro historicky/jinak poškozený uložený podpis.
  const pngB64 = order.signature_png!.replace(/^data:image\/png;base64,/, "");
  const png = await doc.embedPng(Buffer.from(pngB64, "base64")).catch(() => {
    throw new ApiError(400, "Uložený podpis je poškozený — nechte zakázku podepsat znovu.");
  });
  const maxW = CONTENT_W - 300;
  const maxH = 52;
  const scale = Math.min(maxW / png.width, maxH / png.height, 1);
  ctx.page.drawImage(png, {
    x: sigX,
    y: sigTop - 14 - png.height * scale,
    width: png.width * scale,
    height: png.height * scale,
  });
  ctx.page.drawText(`podepsáno ${czDate(order.signed_date)}`, {
    x: sigX,
    y: sigTop - 14 - maxH - 10,
    size: 7,
    font: regular,
    color: GRAY,
  });

  ctx.y = sigTop;
  drawText(ctx, "montáž provedl:", MARGIN, 8.5, { color: GRAY });
  if (order.assignee_name) {
    ctx.page.drawText(order.assignee_name, {
      x: MARGIN + regular.widthOfTextAtSize("montáž provedl:", 8.5) + 6,
      y: ctx.y - 8.5,
      size: 8.5,
      font: bold,
      color: INK,
    });
  } else {
    dottedLine(ctx, MARGIN + 70, MARGIN + 270, ctx.y - 9);
  }
  ctx.y -= 26;
  drawText(ctx, "převzal dne/podpis:", MARGIN, 8.5, { color: GRAY });
  dottedLine(ctx, MARGIN + 84, MARGIN + 270, ctx.y - 9);
  ctx.y = sigTop - SIG_BLOCK_H;

  // --- smluvní text ---------------------------------------------------------
  const contractSize = 6.4;
  const contractLeading = 8.2;
  const contractLines = wrap(CONTRACT_TEXT, regular, contractSize, CONTENT_W);
  ensure(ctx, contractLines.length * contractLeading + 10);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: MARGIN + CONTENT_W, y: ctx.y },
    thickness: 0.5,
    color: LINE,
  });
  ctx.y -= 8;
  for (const line of contractLines) {
    drawText(ctx, line, MARGIN, contractSize, { color: GRAY });
    ctx.y -= contractLeading;
  }

  const bytes = await doc.save();
  return {
    buffer: Buffer.from(bytes),
    filename: exportFilename(order.order_no || order.invoice_no, order.id),
  };
}
