import { orderCreateBody, orderUpdateBody, statusBody } from "../../shared/api-contracts";
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUSES,
  STATUS_LABELS,
  type OrderStatus,
} from "../../shared/types";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

const ORDER_COLS = (db: ReturnType<typeof sql>) => db.unsafe(`
  o.id, o.client_id, o.installation_address, o.montage_number, o.order_number, o.status,
  to_char(o.measured_at, 'YYYY-MM-DD') as measured_at,
  to_char(o.delivery_date, 'YYYY-MM-DD') as delivery_date,
  o.invoice_number, o.note, o.created_at, o.updated_at
`);

export const orderRoutes: Route[] = [
  makeRoute("GET", "/api/dashboard", async () => {
    const db = sql();
    const rows = await db`select status, count(*)::int as n from orders group by status`;
    const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
      OrderStatus,
      number
    >;
    for (const r of rows) counts[r.status as OrderStatus] = r.n;
    return json({ counts });
  }),

  makeRoute("GET", "/api/orders", async (req) => {
    const db = sql();
    const url = new URL(req.url);
    const q = (url.searchParams.get("search") ?? "").trim();
    const status = url.searchParams.get("status");
    if (status && !ORDER_STATUSES.includes(status as OrderStatus)) {
      throw new ApiError(400, "Neznámý stav.");
    }

    const rows = await db`
      select
        o.id, o.status, o.installation_address, o.montage_number, o.order_number,
        o.updated_at,
        c.name as client_name,
        (select count(*)::int from items i where i.order_id = o.id) as item_count
      from orders o
      join clients c on c.id = o.client_id
      where (${status ?? null}::text is null or o.status = ${status})
        and (
          ${q} = '' or
          unaccent_cz(c.name) like '%' || unaccent_cz(${q}) || '%' or
          unaccent_cz(o.installation_address) like '%' || unaccent_cz(${q}) || '%' or
          unaccent_cz(c.address) like '%' || unaccent_cz(${q}) || '%' or
          exists (
            select 1 from items ii
            join product_types pt on pt.id = ii.product_type_id
            where ii.order_id = o.id
              and (unaccent_cz(pt.name) like '%' || unaccent_cz(${q}) || '%'
                   or unaccent_cz(pt.code) like '%' || unaccent_cz(${q}) || '%')
          )
        )
      order by o.created_at desc
      limit 100
    `;
    return json({ orders: rows });
  }),

  makeRoute("POST", "/api/orders", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, orderCreateBody);

    const id = await db.begin(async (tx) => {
      let clientId: string;
      let clientAddress = "";

      if ("id" in body.client) {
        const [c] = await tx`select id, address from clients where id = ${body.client.id}`;
        if (!c) throw new ApiError(404, "Klient nenalezen.");
        clientId = c.id;
        clientAddress = c.address;
      } else {
        const [c] = await tx`insert into clients ${tx(body.client.new)} returning id, address`;
        clientId = c!.id;
        clientAddress = c!.address;
      }

      // Nová zakázka vzniká rovnou „Rozpracovaná" s předvyplněným termínem
      // vyměření = dnešek (potvrzené rozhodnutí, 16. 7.).
      const installation = body.installation_address || clientAddress;
      const [o] = await tx`
        insert into orders (client_id, installation_address, montage_number, order_number,
                            delivery_date, note, measured_at, created_by)
        values (${clientId}, ${installation}, ${body.montage_number}, ${body.order_number},
                ${body.delivery_date ?? null}, ${body.note}, current_date, ${ctx.user.id})
        returning id
      `;
      return o!.id as string;
    });

    return json({ id }, { status: 201 });
  }),

  makeRoute("GET", "/api/orders/:id", async (_req, _ctx, params) => {
    const db = sql();
    const [order] = await db`
      select ${ORDER_COLS(db)} from orders o where o.id = ${params.id!}
    `.catch(() => []);
    if (!order) throw new ApiError(404, "Zakázka nenalezena.");

    const [client] = await db`
      select c.id, c.name, c.contact_person, c.address, c.delivery_address, c.phone,
             c.email, c.ico, c.dic, c.note, c.updated_at
      from clients c where c.id = ${order.client_id}
    `;
    const rooms = await db`
      select id, order_id, name, note, position from rooms
      where order_id = ${order.id} order by position
    `;
    const items = await db`
      select i.id, i.order_id, i.room_id, i.product_type_id, i.form_definition_id,
             i.params, i.note, i.position, i.updated_at,
             pt.code as product_type_code, pt.name as product_type_name
      from items i
      join product_types pt on pt.id = i.product_type_id
      where i.order_id = ${order.id}
      order by i.position
    `;
    const defs = await db`
      select fd.id, fd.version, fd.definition from form_definitions fd
      where fd.id in (select distinct form_definition_id from items where order_id = ${order.id})
    `;

    return json({
      order,
      client,
      rooms,
      items,
      definitions: Object.fromEntries(
        defs.map((d) => [d.id, { version: d.version, definition: d.definition }]),
      ),
    });
  }),

  makeRoute("PATCH", "/api/orders/:id", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, orderUpdateBody);

    if (body.invoice_number !== undefined && ctx.user.role !== "admin") {
      throw new ApiError(403, "Číslo faktury může měnit jen administrátor.");
    }

    const patch: Record<string, string | null> = {};
    for (const key of [
      "installation_address",
      "montage_number",
      "order_number",
      "note",
      "invoice_number",
    ] as const) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.measured_at !== undefined) patch.measured_at = body.measured_at;
    if (body.delivery_date !== undefined) patch.delivery_date = body.delivery_date;

    if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

    const [updated] = await db`
      update orders o set ${db(patch)}
      where o.id = ${params.id!} and o.updated_at = ${body.expected_updated_at}
      returning ${ORDER_COLS(db)}
    `;
    if (!updated) {
      const [exists] = await db`select 1 from orders where id = ${params.id!}`;
      if (!exists) throw new ApiError(404, "Zakázka nenalezena.");
      throw new ApiError(409, "Zakázku mezitím upravil někdo jiný. Načtěte ji prosím znovu.");
    }
    return json({ order: updated });
  }),

  makeRoute("POST", "/api/orders/:id/status", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, statusBody);
    const to = body.to as OrderStatus;
    const expected = body.expected as OrderStatus;

    const allowed = ALLOWED_TRANSITIONS[ctx.user.role][expected] ?? [];
    if (!allowed.includes(to)) {
      throw new ApiError(
        403,
        `Přechod „${STATUS_LABELS[expected]} → ${STATUS_LABELS[to]}" nemůžete provést.`,
      );
    }

    // Compare-and-swap: přepne se jen z očekávaného stavu; jinak 409.
    const [updated] = await db`
      update orders o set status = ${to}
      where o.id = ${params.id!} and o.status = ${expected}
      returning ${ORDER_COLS(db)}
    `;

    if (!updated) {
      const [current] = await db`select status from orders where id = ${params.id!}`;
      if (!current) throw new ApiError(404, "Zakázka nenalezena.");
      throw new ApiError(
        409,
        `Zakázka je mezitím ve stavu „${STATUS_LABELS[current.status as OrderStatus]}". Načtěte ji prosím znovu.`,
      );
    }

    await db`
      insert into order_events (order_id, user_id, from_status, to_status)
      values (${params.id!}, ${ctx.user.id}, ${expected}, ${to})
    `;

    return json({ order: updated });
  }),
];
