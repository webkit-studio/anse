import { orderCreateBody, orderUpdateBody, phaseBody } from "../../shared/api-contracts";
import { czDate, items as czItems } from "../../shared/format";
import { paramyZDefinice, paramyZKonfiguratoru } from "../../shared/item-view";
import { konfigSummary } from "../../shared/konfigurator";
import {
  ARCHIVE_PHASES,
  ORDER_PHASES,
  PHASE_LABELS,
  canTransition,
  type OrderPhase,
  type Role,
} from "../../shared/types";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { getKonfigProduct } from "../konfigurator";
import { appOrigin, notify } from "../notify";
import { makeRoute, parseBody, type Ctx, type Route } from "../router";

// Cena zakázky pro zákazníka se technikovi NEPOSÍLÁ (ne že by se jen skryla
// v UI) — technik je nezávislý dodavatel a účtuje si vlastní cenu práce.
const OFFICE_ONLY_FIELDS = [
  "price_customer",
  "term_dodani",
  "invoice_no",
  "order_no",
  "assignee_id",
] as const;

function orderCols(db: ReturnType<typeof sql>, role: Role) {
  return db.unsafe(`
    o.id, o.contact_id, o.phase, o.assignee_id,
    o.customer_name, o.customer_phone, o.customer_email,
    o.addr_montaz, o.addr_fakt, o.addr_fakt_same, o.ico, o.dic,
    ${role === "kancelar" ? "o.price_customer," : ""}
    o.price_montage,
    to_char(o.term_dodani, 'YYYY-MM-DD') as term_dodani,
    to_char(o.term_montaz, 'YYYY-MM-DD') as term_montaz,
    to_char(o.measured_at, 'YYYY-MM-DD') as measured_at,
    to_char(o.measured_time, 'HH24:MI') as measured_time,
    o.invoice_no, o.order_no, o.note, o.cancelled_reason,
    o.created_at, o.updated_at
  `);
}

/** Nevalidní uuid v URL = nenalezeno; ostatní chyby DB propadnou do 500. */
function invalidUuidAsMissing(err: unknown): never[] {
  if ((err as { code?: string }).code === "22P02") return [];
  throw err;
}

/** Popisek zakázky do notifikací a e-mailů. */
function orderLabel(row: { customer_name?: string; contact_name?: string; addr_montaz?: string }) {
  const who = (row.customer_name || "").trim() || (row.contact_name || "").trim() || "Zakázka";
  const where = (row.addr_montaz || "").trim();
  return where ? `${who} · ${where}` : who;
}

/**
 * Co chybí k posunu do další fáze. Počítá server, UI to jen vypíše —
 * ať se pravidlo nerozejde mezi mobilem, kanceláří a API.
 */
export function blockingFor(
  phase: OrderPhase,
  o: {
    assignee_id: string | null;
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    addr_montaz: string;
    price_montage: string;
    price_customer?: string;
    term_dodani: string | null;
    term_montaz: string | null;
    invoice_no: string;
  },
  itemCount: number,
  hasSignature: boolean,
): string[] {
  const missing: string[] = [];
  if (phase === "k_zamereni") {
    // Bez technika zakázku nikdo v terénu neuvidí — kancelář musí přidělit.
    if (!o.assignee_id) missing.push("Přidělit technika");
    if (!o.customer_name.trim() || !o.customer_phone.trim() || !o.customer_email.trim() || !o.addr_montaz.trim()) {
      missing.push("Údaje zákazníka");
    }
    if (itemCount === 0) missing.push("Aspoň jedna položka");
    if (!o.price_montage.trim()) missing.push("Cena práce");
  }
  if (phase === "k_naceneni") {
    if (o.price_customer !== undefined && !o.price_customer.trim()) missing.push("Cena zakázky");
    if (!o.term_dodani) missing.push("Termín dodání");
  }
  if (phase === "k_montazi") {
    if (!o.term_montaz) missing.push("Termín montáže");
    if (!hasSignature) missing.push("Podpis zákazníka");
  }
  if (phase === "k_fakturaci" && !o.invoice_no.trim()) missing.push("Číslo faktury");
  return missing;
}

/** Technik vidí jen svoje zakázky — cizí ani neexistují. */
async function loadOrderFor(ctx: Ctx, id: string) {
  const db = sql();
  const [order] = await db`
    select ${orderCols(db, ctx.user.role)}, c.name as contact_name, c.phone as contact_phone,
           u.name as assignee_name,
           (select s.signed_at from signatures s where s.order_id = o.id) as signed_at
    from orders o
    join contacts c on c.id = o.contact_id
    left join users u on u.id = o.assignee_id
    where o.id = ${id}
  `.catch(invalidUuidAsMissing);
  if (!order) throw new ApiError(404, "Zakázka nenalezena.");
  if (ctx.user.role === "technik" && order.assignee_id !== ctx.user.id) {
    throw new ApiError(404, "Zakázka nenalezena.");
  }
  return order;
}

export const orderRoutes: Route[] = [
  // Přehled kanceláře: fronty podle fází + počty.
  makeRoute(
    "GET",
    "/api/overview",
    async () => {
      const db = sql();
      const counts = await db`select phase, count(*)::int as n from orders group by phase`;
      const phaseCounts = Object.fromEntries(ORDER_PHASES.map((p) => [p, 0])) as Record<
        OrderPhase,
        number
      >;
      for (const r of counts) phaseCounts[r.phase as OrderPhase] = r.n;

      const queues = await db`
        select o.id, o.contact_id, o.phase, o.addr_montaz, o.assignee_id, o.price_customer,
               u.name as assignee_name, c.name as contact_name, o.customer_name,
               to_char(o.term_dodani, 'YYYY-MM-DD') as term_dodani,
               to_char(o.term_montaz, 'YYYY-MM-DD') as term_montaz,
               o.updated_at,
               extract(day from now() - o.updated_at)::int as idle_days,
               (select count(*)::int from items i where i.order_id = o.id) as item_count,
               (select s.signed_at from signatures s where s.order_id = o.id) as signed_at
        from orders o
        join contacts c on c.id = o.contact_id
        left join users u on u.id = o.assignee_id
        where o.phase in ('k_zamereni', 'k_naceneni', 'k_montazi', 'k_fakturaci')
        order by o.updated_at asc
        limit 200
      `;
      const [fresh] = await db`select count(*)::int as n from contacts where fresh and not cancelled`;

      return json({ phase_counts: phaseCounts, queue: queues, fresh_contacts: fresh?.n ?? 0 });
    },
    { officeOnly: true },
  ),

  // Dnešek technika: co namontovat, co dokončit, komu se ozvat.
  makeRoute("GET", "/api/today", async (_req, ctx) => {
    const db = sql();
    const mine = ctx.user.role === "technik";
    const orders = await db`
      select o.id, o.contact_id, o.phase, o.addr_montaz, o.assignee_id, u.name as assignee_name,
             c.name as contact_name, o.customer_name,
             to_char(o.term_dodani, 'YYYY-MM-DD') as term_dodani,
             to_char(o.term_montaz, 'YYYY-MM-DD') as term_montaz,
             o.updated_at,
             (select count(*)::int from items i where i.order_id = o.id) as item_count,
             (select s.signed_at from signatures s where s.order_id = o.id) as signed_at
      from orders o
      join contacts c on c.id = o.contact_id
      left join users u on u.id = o.assignee_id
      where o.phase in ('k_zamereni', 'k_montazi')
        and (${!mine} or o.assignee_id = ${ctx.user.id})
      order by coalesce(o.term_montaz, o.measured_at, current_date), o.created_at
    `;
    const contacts = await db`
      select c.id, c.name, c.phone, c.place, c.fresh, c.assigned_to, c.cancelled,
             c.cancelled_reason, c.created_at, c.updated_at, au.name as assignee_name
      from contacts c left join users au on au.id = c.assigned_to
      where c.fresh and not c.cancelled and (${!mine} or c.assigned_to = ${ctx.user.id})
      order by c.created_at desc limit 20
    `;
    const [waiting] = await db`
      select count(*)::int as n from orders
      where phase in ('k_naceneni', 'k_fakturaci')
        and (${!mine} or assignee_id = ${ctx.user.id})
    `;

    return json({
      namontovat: orders.filter((o) => o.phase === "k_montazi"),
      dokoncit: orders.filter((o) => o.phase === "k_zamereni"),
      ozvat: contacts,
      v_kancelari: waiting?.n ?? 0,
    });
  }),

  makeRoute("GET", "/api/orders", async (req, ctx) => {
    const db = sql();
    const url = new URL(req.url);
    const q = (url.searchParams.get("search") ?? "").trim();
    const filter = url.searchParams.get("filter") ?? "vse";
    const mine = ctx.user.role === "technik";

    if (
      filter !== "vse" &&
      filter !== "archiv" &&
      !ORDER_PHASES.includes(filter as OrderPhase)
    ) {
      throw new ApiError(400, "Neznámý filtr.");
    }
    const phases =
      filter === "vse"
        ? null
        : filter === "archiv"
          ? ARCHIVE_PHASES
          : [filter as OrderPhase];

    const rows = await db`
      select o.id, o.contact_id, o.phase, o.addr_montaz, o.assignee_id, u.name as assignee_name,
             c.name as contact_name, o.customer_name,
             ${ctx.user.role === "kancelar" ? db`o.price_customer,` : db``}
             to_char(o.term_dodani, 'YYYY-MM-DD') as term_dodani,
             to_char(o.term_montaz, 'YYYY-MM-DD') as term_montaz,
             o.updated_at,
             (select count(*)::int from items i where i.order_id = o.id) as item_count,
             (select s.signed_at from signatures s where s.order_id = o.id) as signed_at
      from orders o
      join contacts c on c.id = o.contact_id
      left join users u on u.id = o.assignee_id
      where (${!mine} or o.assignee_id = ${ctx.user.id})
        and (${phases}::text[] is null or o.phase = any(${phases}))
        and (
          ${q} = '' or
          unaccent_cz(c.name) like '%' || unaccent_cz(${q}) || '%' or
          unaccent_cz(o.customer_name) like '%' || unaccent_cz(${q}) || '%' or
          unaccent_cz(o.addr_montaz) like '%' || unaccent_cz(${q}) || '%'
        )
      order by o.updated_at desc
      limit 200
    `;
    return json({ orders: rows });
  }),

  // Zakázka vzniká vždy z kontaktu — zadáním termínu zaměření.
  makeRoute("POST", "/api/orders", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, orderCreateBody);

    // Technik si zakázku bere na sebe. Kancelář musí přidělit vědomě —
    // default je prázdno (klidně sama sobě, ale žádné tiché autopřidělení).
    const assignee = ctx.user.role === "technik" ? ctx.user.id : (body.assignee_id ?? null);

    const id = await db.begin(async (tx) => {
      const [contact] = await tx`
        select id, name, phone, place from contacts where id = ${body.contact_id} and not cancelled
      `;
      if (!contact) throw new ApiError(404, "Kontakt nenalezen.");

      // Fakturační údaje se předvyplní z poslední zakázky kontaktu
      // (SVJ a stavební firmy mají pořád stejné IČO/DIČ i fakturační adresu).
      const [prev] = await tx`
        select customer_name, customer_phone, customer_email, addr_fakt, ico, dic
        from orders where contact_id = ${contact.id}
        order by created_at desc limit 1
      `;

      const [o] = await tx`
        insert into orders (contact_id, assignee_id, phase, measured_at, measured_time, created_by,
                            customer_name, customer_phone, customer_email, addr_fakt, ico, dic)
        values (${contact.id}, ${assignee}, 'k_zamereni', ${body.measured_at ?? null},
                ${body.measured_time ?? null}, ${ctx.user.id},
                ${prev?.customer_name ?? contact.name ?? ""}, ${prev?.customer_phone ?? contact.phone ?? ""},
                ${prev?.customer_email ?? ""}, ${prev?.addr_fakt ?? ""},
                ${prev?.ico ?? ""}, ${prev?.dic ?? ""})
        returning id
      `;
      // Založením zakázky kontakt přestává být „ozvat se".
      await tx`update contacts set fresh = false where id = ${contact.id}`;
      return o!.id as string;
    });

    return json({ id }, { status: 201 });
  }),

  makeRoute("GET", "/api/orders/:id", async (_req, ctx, params) => {
    const db = sql();
    const order = await loadOrderFor(ctx, params.id!);

    const rooms = await db`
      select id, order_id, name, position from rooms where order_id = ${order.id} order by position
    `;
    const items = await db`
      select i.id, i.order_id, i.room_id, i.kind, i.product_type_id, i.subcategory_id,
             i.form_definition_id, i.konfig_key, i.params, i.note, i.defect_note, i.position, i.updated_at,
             pt.name as product_type_name, pt.custom_name as product_type_custom_name,
             s.name as subcategory_name, s.custom_name as subcategory_custom_name
      from items i
      join product_types pt on pt.id = i.product_type_id
      left join subcategories s on s.id = i.subcategory_id
      where i.order_id = ${order.id}
      order by i.position
    `;
    const photos = await db`
      select id, item_id, kind, data, created_at from item_photos
      where order_id = ${order.id} order by created_at
    `;
    const defs = await db`
      select fd.id, fd.version, fd.definition from form_definitions fd
      where fd.id in (
        select distinct form_definition_id from items
        where order_id = ${order.id} and form_definition_id is not null
      )
    `;

    const blocking = blockingFor(
      order.phase as OrderPhase,
      order as never,
      items.length,
      !!order.signed_at,
    );

    return json({
      order,
      rooms,
      items: items.map((i) => {
        const product = i.konfig_key ? getKonfigProduct(i.konfig_key as string) : undefined;
        // Přehled parametrů skládá server: kancelář ho přepisuje do konfigurátoru
        // dodavatele a musí odpovídat TÉ verzi definice, na které je položka
        // připnutá — ne tomu, co má zrovna v prohlížeči.
        const def = i.form_definition_id
          ? defs.find((d) => d.id === i.form_definition_id)?.definition
          : undefined;
        const params_view = product
          ? paramyZKonfiguratoru(product, i.params ?? {})
          : def
            ? paramyZDefinice(def as never, i.params ?? {})
            : [];
        return {
          ...i,
          product_type_name: i.product_type_custom_name || i.product_type_name,
          subcategory_name: i.subcategory_custom_name || i.subcategory_name,
          konfig_summary: product ? konfigSummary(product, i.params ?? {}) : undefined,
          params_view,
          photos: photos.filter((p) => p.item_id === i.id),
        };
      }),
      photos: photos.filter((p) => !p.item_id),
      definitions: Object.fromEntries(
        defs.map((d) => [d.id, { version: d.version, definition: d.definition }]),
      ),
      blocking,
    });
  }),

  makeRoute("PATCH", "/api/orders/:id", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, orderUpdateBody);
    await loadOrderFor(ctx, params.id!);

    if (ctx.user.role !== "kancelar" && OFFICE_ONLY_FIELDS.some((k) => body[k] !== undefined)) {
      throw new ApiError(403, "Tyto údaje může měnit jen kancelář.");
    }

    const patch: Record<string, string | boolean | null> = {};
    for (const key of [
      "customer_name",
      "customer_phone",
      "customer_email",
      "addr_montaz",
      "addr_fakt",
      "ico",
      "dic",
      "note",
      "price_montage",
      "measured_at",
      "measured_time",
      "term_montaz",
      ...OFFICE_ONLY_FIELDS,
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key] as string | null;
    }
    if (body.addr_fakt_same !== undefined) patch.addr_fakt_same = body.addr_fakt_same;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

    const [updated] = await db`
      update orders o set ${db(patch)}
      where o.id = ${params.id!} and o.updated_at = ${body.expected_updated_at}
      returning ${orderCols(db, ctx.user.role)}
    `;
    if (!updated) {
      const [exists] = await db`select 1 from orders where id = ${params.id!}`;
      if (!exists) throw new ApiError(404, "Zakázka nenalezena.");
      throw new ApiError(409, "Zakázku mezitím upravil někdo jiný. Načti ji prosím znovu.");
    }
    return json({ order: updated });
  }),

  makeRoute(
    "DELETE",
    "/api/orders/:id",
    async (_req, _ctx, params) => {
      const db = sql();
      const [deleted] = await db`
        delete from orders where id = ${params.id!} returning id
      `.catch(invalidUuidAsMissing);
      if (!deleted) throw new ApiError(404, "Zakázka nenalezena.");
      return json({ ok: true });
    },
    { officeOnly: true },
  ),

  // Obnova zrušené zakázky — vrací ji do fáze, ze které se rušilo (audit
  // v order_events). Jediná povolená cesta „zpět"; dělá ji jen kancelář.
  makeRoute(
    "POST",
    "/api/orders/:id/restore",
    async (req, ctx, params) => {
      const db = sql();
      const [ev] = await db`
        select from_phase from order_events
        where order_id = ${params.id!} and to_phase = 'zruseno'
        order by created_at desc limit 1
      `.catch(invalidUuidAsMissing);
      const target = (ev?.from_phase as OrderPhase | undefined) ?? "k_zamereni";

      const [restored] = await db`
        update orders o set phase = ${target}, cancelled_reason = ''
        where o.id = ${params.id!} and o.phase = 'zruseno'
        returning ${orderCols(db, ctx.user.role)}
      `;
      if (!restored) throw new ApiError(404, "Zakázka nenalezena nebo není zrušená.");

      await db`
        insert into order_events (order_id, user_id, from_phase, to_phase)
        values (${params.id!}, ${ctx.user.id}, 'zruseno', ${target})
      `;
      void req;
      return json({ order: restored });
    },
    { officeOnly: true },
  ),

  // Posun fáze — jen vpřed, compare-and-swap, blokace hlídá server.
  makeRoute("POST", "/api/orders/:id/phase", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, phaseBody);
    const to = body.to as OrderPhase;
    const expected = body.expected as OrderPhase;

    const order = await loadOrderFor(ctx, params.id!);

    if (!canTransition(ctx.user.role, expected, to)) {
      throw new ApiError(
        403,
        `Přechod „${PHASE_LABELS[expected]} → ${PHASE_LABELS[to]}" nemůžete provést.`,
      );
    }
    if (to === "zruseno" && !body.reason.trim()) {
      throw new ApiError(400, "Napiš důvod zrušení.");
    }

    const [items] = await db`select count(*)::int as n from items where order_id = ${order.id}`;
    if (to !== "zruseno") {
      // Kancelář kontroluje i cenu zakázky, kterou technikův pohled nezná.
      const [full] = await db`
        select assignee_id, customer_name, customer_phone, customer_email, addr_montaz,
               price_montage, price_customer, invoice_no,
               to_char(term_dodani, 'YYYY-MM-DD') as term_dodani,
               to_char(term_montaz, 'YYYY-MM-DD') as term_montaz
        from orders where id = ${order.id}
      `;
      const missing = blockingFor(expected, full as never, items?.n ?? 0, !!order.signed_at);
      if (missing.length > 0) {
        throw new ApiError(422, `Ještě chybí: ${missing.join(", ")}.`, { blocking: missing });
      }
    }

    const [updated] = await db`
      update orders o set phase = ${to},
        cancelled_reason = case when ${to} = 'zruseno' then ${body.reason} else o.cancelled_reason end
      where o.id = ${params.id!} and o.phase = ${expected}
      returning ${orderCols(db, ctx.user.role)}
    `;
    if (!updated) {
      const [current] = await db`select phase from orders where id = ${params.id!}`;
      if (!current) throw new ApiError(404, "Zakázka nenalezena.");
      throw new ApiError(
        409,
        `Zakázku mezitím posunul někdo jiný — je ve fázi „${PHASE_LABELS[current.phase as OrderPhase]}".`,
      );
    }

    await db`
      insert into order_events (order_id, user_id, from_phase, to_phase)
      values (${params.id!}, ${ctx.user.id}, ${expected}, ${to})
    `;

    const label = orderLabel({
      customer_name: order.customer_name,
      contact_name: order.contact_name,
      addr_montaz: order.addr_montaz,
    });
    const url = `${appOrigin(req)}/zakazky/${params.id!}`;
    const assignee = order.assignee_id ? [order.assignee_id as string] : [];

    if (to === "k_naceneni") {
      await notify({
        event: "nove_zamereni",
        subject: label,
        vars: { "položky": czItems(items?.n ?? 0) },
        orderId: params.id!,
        actorId: ctx.user.id,
        url,
      });
    } else if (to === "k_montazi") {
      await notify({
        event: "termin_dodani",
        subject: label,
        vars: { datum: czDate(updated.term_dodani) },
        orderId: params.id!,
        actorId: ctx.user.id,
        userIds: assignee,
        url,
      });
    } else if (to === "k_fakturaci") {
      await notify({
        event: "namontovano",
        subject: label,
        vars: {},
        orderId: params.id!,
        actorId: ctx.user.id,
        url,
      });
    } else if (to === "zruseno") {
      if (ctx.user.role === "technik") {
        await notify({
          event: "zruseno_technikem",
          subject: label,
          vars: { "důvod": body.reason },
          orderId: params.id!,
          actorId: ctx.user.id,
          url,
        });
      } else {
        await notify({
          event: "zakazka_zrusena",
          subject: label,
          vars: {},
          orderId: params.id!,
          actorId: ctx.user.id,
          userIds: assignee,
          url,
        });
      }
    }

    return json({ order: updated });
  }),
];
