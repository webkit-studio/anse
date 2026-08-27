import {
  contactCancelBody,
  contactCreateBody,
  contactNoteBody,
  contactUpdateBody,
} from "../../shared/api-contracts";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { appOrigin, notify } from "../notify";
import { makeRoute, parseBody, type Route } from "../router";

// Kontakty = databáze čísel, ne pipeline. Žádné stavy kromě „ozvat se" (fresh)
// a zrušení s důvodem. Vidí je obě role v plném rozsahu.

const CONTACT_COLS = (db: ReturnType<typeof sql>) => db.unsafe(`
  c.id, c.name, c.phone, c.place, c.fresh, c.cancelled, c.cancelled_reason,
  c.created_at, c.updated_at
`);

/** Nevalidní uuid v URL = nenalezeno; ostatní chyby DB propadnou do 500. */
function invalidUuidAsMissing(err: unknown): never[] {
  if ((err as { code?: string }).code === "22P02") return [];
  throw err;
}

/** Popisek kontaktu do notifikace. */
export function contactLabel(c: { name?: string; phone?: string; place?: string }): string {
  const head = (c.name ?? "").trim() || (c.phone ?? "").trim() || "Kontakt";
  const place = (c.place ?? "").trim();
  return place ? `${head} · ${place}` : head;
}

export const contactRoutes: Route[] = [
  makeRoute("GET", "/api/contacts", async (req) => {
    const db = sql();
    const url = new URL(req.url);
    const q = (url.searchParams.get("search") ?? "").trim();
    const filter = url.searchParams.get("filter") ?? "vse"; // vse | fresh

    const rows = await db`
      select ${CONTACT_COLS(db)},
        (select count(*)::int from orders o where o.contact_id = c.id) as order_count,
        (select count(*)::int from orders o
          where o.contact_id = c.id and o.phase not in ('hotovo', 'zruseno')) as open_order_count,
        (select count(*)::int from contact_notes n where n.contact_id = c.id) as notes_count
      from contacts c
      where not c.cancelled
        and (${filter} <> 'fresh' or c.fresh)
        and (
          ${q} = '' or
          unaccent_cz(c.name) like '%' || unaccent_cz(${q}) || '%' or
          unaccent_cz(c.place) like '%' || unaccent_cz(${q}) || '%' or
          replace(c.phone, ' ', '') like '%' || replace(${q}, ' ', '') || '%'
        )
      order by c.fresh desc, c.created_at desc
      limit 200
    `;
    return json({ contacts: rows });
  }),

  // Odznak v navigaci = počet kontaktů „ozvat se".
  makeRoute("GET", "/api/contacts/fresh-count", async () => {
    const db = sql();
    const [row] = await db`select count(*)::int as n from contacts where fresh and not cancelled`;
    return json({ count: row?.n ?? 0 });
  }),

  makeRoute("POST", "/api/contacts", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, contactCreateBody);

    const [contact] = await db`
      insert into contacts as c (name, phone, place, fresh, created_by)
      values (${body.name}, ${body.phone}, ${body.place}, true, ${ctx.user.id})
      returning ${CONTACT_COLS(db)}
    `;

    await notify({
      event: "novy_kontakt",
      subject: contactLabel(contact!),
      vars: { "jméno": contactLabel(contact!) },
      contactId: contact!.id as string,
      actorId: ctx.user.id,
      url: `${appOrigin(req)}/kontakty/${contact!.id}`,
    });

    return json({ contact }, { status: 201 });
  }),

  makeRoute("GET", "/api/contacts/:id", async (_req, _ctx, params) => {
    const db = sql();
    const [contact] = await db`
      select ${CONTACT_COLS(db)} from contacts c where c.id = ${params.id!}
    `.catch(invalidUuidAsMissing);
    if (!contact) throw new ApiError(404, "Kontakt nenalezen.");

    const notes = await db`
      select n.id, n.contact_id, n.author_id, u.name as author_name, n.text, n.created_at
      from contact_notes n join users u on u.id = n.author_id
      where n.contact_id = ${contact.id}
      order by n.created_at desc
    `;
    const orders = await db`
      select o.id, o.contact_id, o.phase, o.addr_montaz, o.assignee_id,
             u.name as assignee_name, o.term_dodani, o.term_montaz, o.updated_at,
             (select count(*)::int from items i where i.order_id = o.id) as item_count,
             (select s.signed_at from signatures s where s.order_id = o.id) as signed_at
      from orders o left join users u on u.id = o.assignee_id
      where o.contact_id = ${contact.id}
      order by o.created_at desc
    `;
    return json({ contact, notes, orders });
  }),

  makeRoute("PATCH", "/api/contacts/:id", async (req, _ctx, params) => {
    const db = sql();
    const body = await parseBody(req, contactUpdateBody);

    const patch: Record<string, string | boolean> = {};
    for (const key of ["name", "phone", "place"] as const) {
      if (body[key] !== undefined) patch[key] = body[key]!;
    }
    if (body.fresh !== undefined) patch.fresh = body.fresh;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

    // Kontakt musí mít pořád jméno nebo telefon.
    const [current] = await db`
      select name, phone from contacts where id = ${params.id!}
    `.catch(invalidUuidAsMissing);
    if (!current) throw new ApiError(404, "Kontakt nenalezen.");
    const name = (patch.name as string) ?? current.name;
    const phone = (patch.phone as string) ?? current.phone;
    if (!String(name).trim() && !String(phone).trim()) {
      throw new ApiError(400, "Kontakt musí mít jméno nebo telefon.");
    }

    const [updated] = await db`
      update contacts c set ${db(patch)} where c.id = ${params.id!}
      returning ${CONTACT_COLS(db)}
    `;
    return json({ contact: updated });
  }),

  makeRoute("POST", "/api/contacts/:id/notes", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, contactNoteBody);
    try {
      const [note] = await db`
        with ins as (
          insert into contact_notes (contact_id, author_id, text)
          values (${params.id!}, ${ctx.user.id}, ${body.text})
          returning *
        )
        select ins.*, u.name as author_name from ins join users u on u.id = ins.author_id
      `;
      return json({ note }, { status: 201 });
    } catch (err) {
      if ((err as { code?: string }).code === "23503") throw new ApiError(404, "Kontakt nenalezen.");
      throw err;
    }
  }),

  // Zrušení kontaktu vyžaduje důvod; zapíše se i jako poznámka (ty zůstávají navždy).
  makeRoute("POST", "/api/contacts/:id/cancel", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, contactCancelBody);

    const [contact] = await db`
      update contacts c set cancelled = true, cancelled_reason = ${body.reason}, fresh = false
      where c.id = ${params.id!} and not c.cancelled
      returning ${CONTACT_COLS(db)}
    `.catch(invalidUuidAsMissing);
    if (!contact) throw new ApiError(404, "Kontakt nenalezen nebo už je zrušený.");

    await db`
      insert into contact_notes (contact_id, author_id, text)
      values (${params.id!}, ${ctx.user.id}, ${`Kontakt zrušen: ${body.reason}`})
    `;

    if (ctx.user.role === "technik") {
      await notify({
        event: "zruseno_technikem",
        subject: contactLabel(contact),
        vars: { "důvod": body.reason },
        contactId: contact.id as string,
        actorId: ctx.user.id,
        url: `${appOrigin(req)}/kontakty/${contact.id}`,
      });
    }

    return json({ contact });
  }),
];
