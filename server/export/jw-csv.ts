import { formDefinitionSchema, type FormDefinition } from "../../shared/form-schema";
import {
  JW_CSV_MAPY,
  jwCsv,
  jwCsvMapaZKonfiguratoru,
  maJwCsv,
  type JwCsvHodnota,
  type JwCsvMapa,
  type JwCsvPolozka,
} from "../../shared/jw-csv";
import type { KonfigProduct } from "../../shared/konfigurator";
import { getKonfigProduct } from "../konfigurator";
import { sql } from "../db";
import { ApiError } from "../http";

// Soubor k importu objednávky do portálu Jack Westu. Jeden soubor = jeden
// výrobek (portál zakládá výrobek podle zkratky a každý má jinou masku),
// takže se stahuje po podkategoriích, ne po zakázce.
//
// Hodnoty se počítají proti TÉ verzi definice, na které je položka připnutá —
// stejně jako přehled parametrů. Kdyby se mezitím definice převerzovala,
// nesmí se do objednávky dostat volba, kterou technik neviděl.

/** Hodnota parametru z připnuté definice: uložený kód a popisek volby. */
function zDefinice(def: FormDefinition, params: Record<string, unknown>) {
  const pole: Record<string, JwCsvHodnota> = {};
  for (const g of def.groups) {
    for (const f of g.fields) {
      const kod = String(params[f.key] ?? "").trim();
      if (kod === "") continue;
      pole[f.key] = { kod, popisek: f.options?.find((o) => o.value === kod)?.label ?? kod };
    }
  }
  return pole;
}

function zKonfiguratoru(product: KonfigProduct, params: Record<string, unknown>) {
  const pole: Record<string, JwCsvHodnota> = {};
  for (const f of product.fields) {
    const kod = String(params[f.code] ?? "").trim();
    if (kod === "") continue;
    pole[f.code] = { kod, popisek: f.options.find((o) => o.value === kod)?.label ?? kod };
  }
  return pole;
}

function nazevSouboru(zkratka: string, znacka: string): string {
  const cast = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `jackwest-${cast(zkratka)}-${cast(znacka) || "zakazka"}.csv`;
}

export async function buildJwCsv(
  orderId: string,
  subcategoryId: string,
): Promise<{ csv: string; filename: string; mapa: JwCsvMapa }> {
  const db = sql();

  const [order] = await db`
    select o.id, o.order_no, o.customer_name, o.addr_montaz,
           to_char(o.term_dodani, 'YYYY-MM-DD') as term_dodani,
           c.name as contact_name
    from orders o join contacts c on c.id = o.contact_id
    where o.id = ${orderId}
  `.catch((err) => {
    if ((err as { code?: string }).code === "22P02") return [];
    throw err;
  });
  if (!order) throw new ApiError(404, "Zakázka nenalezena.");

  const [sub] = await db`
    select id, code, name, manufacturer, konfig_key from subcategories where id = ${subcategoryId}
  `.catch((err) => {
    if ((err as { code?: string }).code === "22P02") return [];
    throw err;
  });
  if (!sub) throw new ApiError(404, "Podkategorie nenalezena.");
  if (sub.manufacturer !== "jackwest") {
    throw new ApiError(400, "Import CSV má jen Jack West.");
  }

  // Klíč do mapy je zkratka výrobku: u konfigurátorových podkategorií je to
  // kód za dvojtečkou („jackwest:PD"), u ručních definic přímo kód podkategorie.
  const konfigKey = (sub.konfig_key as string | null) ?? null;
  const product = konfigKey ? getKonfigProduct(konfigKey) : undefined;
  const zkratka = product?.kod ?? (sub.code as string);
  if (!maJwCsv(zkratka)) {
    throw new ApiError(
      400,
      `Jack West umí import CSV jen u ESD, PD, SEL-13 a SEL-15 — ${sub.name} takhle objednat nejde.`,
    );
  }
  const mapa = product ? jwCsvMapaZKonfiguratoru(product) : JW_CSV_MAPY[zkratka];
  if (!mapa) throw new ApiError(400, `Pro ${sub.name} zatím nemáme sloupce importního souboru.`);

  const items = await db`
    select i.id, i.params, i.note, i.position, i.form_definition_id, i.konfig_key,
           r.name as room_name
    from items i
    join rooms r on r.id = i.room_id
    where i.order_id = ${orderId} and i.subcategory_id = ${subcategoryId} and i.kind = 'config'
    order by r.position, i.position
  `;
  if (items.length === 0) {
    throw new ApiError(400, `Zakázka nemá žádnou položku ${sub.name}.`);
  }

  const defRows = await db`
    select id, definition from form_definitions
    where id in (
      select distinct form_definition_id from items
      where order_id = ${orderId} and subcategory_id = ${subcategoryId}
        and form_definition_id is not null
    )
  `;
  const definice = new Map<string, FormDefinition>(
    defRows.map((d) => [d.id as string, formDefinitionSchema.parse(d.definition)]),
  );

  const polozky: JwCsvPolozka[] = items.map((i) => {
    const params = (i.params ?? {}) as Record<string, unknown>;
    const konfig = i.konfig_key ? getKonfigProduct(i.konfig_key as string) : undefined;
    const def = i.form_definition_id ? definice.get(i.form_definition_id as string) : undefined;
    return {
      pole: konfig ? zKonfiguratoru(konfig, params) : def ? zDefinice(def, params) : {},
      // „Označení pozice" je to, podle čeho se pak na stavbě pozná, který kus
      // kam patří — místnost a pořadí v ní je přesně ta informace.
      pozice: `${String(i.room_name ?? "").trim()} ${i.position}`.trim(),
      poznamka: String(i.note ?? ""),
    };
  });

  // „Vaše značka" je reference, kterou dodavatel cituje zpátky. Číslo zakázky
  // je nejlepší, bez něj aspoň jméno zákazníka — ať se objednávka dá spárovat.
  const znacka =
    String(order.order_no ?? "").trim() ||
    String(order.customer_name ?? "").trim() ||
    String(order.contact_name ?? "").trim();

  // Komentář na hlavičku poptávky necháváme prázdný: naše poznámka k zakázce je
  // interní a dodavateli do ní nic není. Kancelář si komentář dopíše v portálu.
  const csv = jwCsv(
    mapa,
    { znacka, termin: (order.term_dodani as string) ?? null, komentar: "" },
    polozky,
  );
  return { csv, filename: nazevSouboru(zkratka, znacka), mapa };
}

/** Jeden výrobek Jack Westu v zakázce a jak se dá objednat. */
export interface JwCsvNabidka {
  subcategory_id: string;
  nazev: string;
  zkratka: string;
  /** false = tenhle výrobek portál ze souboru nenačte, přepisuje se ručně. */
  csv: boolean;
  /** false = sloupce jsou odvozené, ne z exportu portálu — první import prověřit. */
  overeno: boolean;
  pocet: number;
}

/**
 * Výrobky Jack Westu v zakázce i s tím, jestli je portál umí načíst ze souboru.
 * Rozhoduje server: zná zkratky s povoleným importem i mapy sloupců, klient jen
 * vykreslí tlačítka a nemůže nabídnout soubor, který by portál odmítl. Výrobky
 * bez importu se vypisují taky — kancelář musí vědět, co v portálu ještě
 * přepsat ručně, a ne to zjistit až podle chybějící položky v objednávce.
 */
export interface JwCsvPolozkaRadek {
  subcategory_id: string | null;
  subcategory_name: string | null;
  /** Vlastní název od kanceláře — má přednost, stejně jako všude jinde v detailu. */
  subcategory_custom_name?: string | null;
  subcategory_code: string | null;
  subcategory_manufacturer: string | null;
  subcategory_konfig_key: string | null;
  kind: string;
}

export function jwCsvNabidky(items: JwCsvPolozkaRadek[]): JwCsvNabidka[] {
  const dle = new Map<string, JwCsvNabidka>();
  for (const i of items) {
    if (i.kind !== "config" || !i.subcategory_id) continue;
    if (i.subcategory_manufacturer !== "jackwest") continue;

    const uz = dle.get(i.subcategory_id);
    if (uz) {
      uz.pocet += 1;
      continue;
    }
    const product = i.subcategory_konfig_key
      ? getKonfigProduct(i.subcategory_konfig_key)
      : undefined;
    const zkratka = product?.kod ?? i.subcategory_code ?? "";
    const mapa = maJwCsv(zkratka)
      ? product
        ? jwCsvMapaZKonfiguratoru(product)
        : JW_CSV_MAPY[zkratka]
      : undefined;

    dle.set(i.subcategory_id, {
      subcategory_id: i.subcategory_id,
      nazev: i.subcategory_custom_name || i.subcategory_name || product?.nazev || zkratka,
      zkratka,
      csv: !!mapa,
      overeno: mapa?.overeno ?? false,
      pocet: 1,
    });
  }
  return [...dle.values()];
}
