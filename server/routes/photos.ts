import { photoCreateBody, signatureBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Ctx, type Route } from "../router";

// Fotky (od zákazníka / zaměření / závada / realizace) a podpis zákazníka.
// Data jdou do DB jako data-URL — free tier nemá objektové úložiště a fotky
// jsou komprimované na klientu (limit 1,4 MB hlídá zod kontrakt).
// Fotka patří buď kontaktu (od zákazníka, ještě před zakázkou), nebo zakázce.
// Galerie posílá jen popisy; obrázek si prohlížeč stáhne z /api/photos/:id/img
// (cookie jde i s <img>), takže výpis nenarazí na limit velikosti odpovědi.

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function assertOwnOrder(ctx: Ctx, orderId: string): Promise<{ contact_id: string }> {
  const [o] = await sql()`
    select contact_id, assignee_ids from orders where id = ${orderId}
  `.catch(() => []);
  if (!o) throw new ApiError(404, "Zakázka nenalezena.");
  if (ctx.user.role === "technik" && !(o.assignee_ids as string[]).includes(ctx.user.id)) {
    throw new ApiError(404, "Zakázka nenalezena.");
  }
  return { contact_id: o.contact_id as string };
}

/** Kontakty vidí obě role v plném rozsahu — stačí, že existuje. */
async function assertContact(contactId: string): Promise<void> {
  const [c] = await sql()`select 1 from contacts where id = ${contactId}`.catch(() => []);
  if (!c) throw new ApiError(404, "Kontakt nenalezen.");
}

/** Fotka smí ven jen tomu, kdo vidí její zakázku nebo kontakt. */
async function assertPhotoAccess(
  ctx: Ctx,
  photo: { order_id: string | null; contact_id: string | null },
): Promise<void> {
  if (photo.order_id) await assertOwnOrder(ctx, photo.order_id);
  else if (photo.contact_id) await assertContact(photo.contact_id);
}

const GALLERY_COLS = (db: ReturnType<typeof sql>) => db.unsafe(`
  p.id, p.kind, p.order_id, p.item_id, p.created_at, u.name as author_name,
  concat_ws(' · ',
    coalesce(nullif(s.custom_name, ''), s.name, nullif(pt.custom_name, ''), pt.name),
    nullif(r.name, '')) as popis
`);

export const photoRoutes: Route[] = [
  // Galerie kontaktu (?contact_id) nebo zakázky (?order_id) — bez dat obrázků.
  // Kontakt: jeho fotky + fotky jeho zakázek (technik jen svých).
  // Zakázka: její fotky + fotky od zákazníka u jejího kontaktu.
  makeRoute("GET", "/api/photos", async (req, ctx) => {
    const db = sql();
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");
    const contactId = url.searchParams.get("contact_id");
    const mine = ctx.user.role === "technik";

    let where;
    if (orderId) {
      const { contact_id } = await assertOwnOrder(ctx, orderId);
      where = db`p.order_id = ${orderId} or p.contact_id = ${contact_id}`;
    } else if (contactId) {
      await assertContact(contactId);
      where = db`p.contact_id = ${contactId} or p.order_id in (
        select o.id from orders o
        where o.contact_id = ${contactId} and (${!mine} or ${ctx.user.id} = any(o.assignee_ids))
      )`;
    } else {
      throw new ApiError(400, "Chybí zakázka nebo kontakt.");
    }

    const photos = await db`
      select ${GALLERY_COLS(db)}
      from item_photos p
      join users u on u.id = p.created_by
      left join items i on i.id = p.item_id
      left join rooms r on r.id = i.room_id
      left join product_types pt on pt.id = i.product_type_id
      left join subcategories s on s.id = i.subcategory_id
      where (${where})
      order by p.created_at
    `;
    return json({ photos });
  }),

  // Obrázek fotky. Fotka se nikdy nemění (jen maže), takže smí do cache napořád.
  makeRoute("GET", "/api/photos/:id/img", async (_req, ctx, params) => {
    const [photo] = await sql()`
      select data, order_id, contact_id from item_photos where id = ${params.id!}
    `.catch(() => []);
    if (!photo) throw new ApiError(404, "Fotka nenalezena.");
    await assertPhotoAccess(ctx, photo as never);

    const m = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(String(photo.data));
    if (!m) throw new ApiError(404, "Fotka nenalezena.");
    return new Response(Buffer.from(m[2]!, "base64"), {
      headers: {
        "content-type": m[1]!,
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  }),

  makeRoute("POST", "/api/photos", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, photoCreateBody);
    if (body.order_id) await assertOwnOrder(ctx, body.order_id);
    else await assertContact(body.contact_id!);

    try {
      const [photo] = await db`
        insert into item_photos (item_id, order_id, contact_id, kind, data, created_by)
        values (${body.item_id ?? null}, ${body.order_id ?? null}, ${body.contact_id ?? null},
                ${body.kind}, ${body.data}, ${ctx.user.id})
        returning id, item_id, kind, data, created_at
      `;
      return json({ photo }, { status: 201 });
    } catch (err) {
      if ((err as { code?: string }).code === "23503") {
        throw new ApiError(404, "Zakázka nebo položka nenalezena.");
      }
      throw err;
    }
  }),

  makeRoute("DELETE", "/api/photos/:id", async (_req, ctx, params) => {
    const db = sql();
    const [photo] = await db`
      select p.id, p.order_id, p.contact_id from item_photos p where p.id = ${params.id!}
    `.catch(() => []);
    if (!photo) throw new ApiError(404, "Fotka nenalezena.");
    await assertPhotoAccess(ctx, photo as never);

    await db`delete from item_photos where id = ${params.id!}`;
    return json({ ok: true });
  }),

  // Podpis zákazníka — přepodepsání povolené (poslední platí).
  makeRoute("POST", "/api/orders/:id/signature", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, signatureBody);
    await assertOwnOrder(ctx, params.id!);

    // Server nevěří klientovi: payload musí být skutečné PNG (magic bytes),
    // jinak by poškozený „podpis" později shazoval PDF montážního listu.
    const bytes = Buffer.from(body.data.slice(PNG_DATA_URL_PREFIX.length), "base64");
    if (bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) {
      throw new ApiError(422, "Neplatný podpis. Zkus ho nakreslit znovu.");
    }

    const [signature] = await db`
      insert into signatures (order_id, data, signer_name, signed_by)
      values (${params.id!}, ${body.data}, ${body.signer_name}, ${ctx.user.id})
      on conflict (order_id) do update
        set data = excluded.data, signer_name = excluded.signer_name,
            signed_by = excluded.signed_by, signed_at = now()
      returning id, order_id, signer_name, signed_at
    `;
    return json({ signature }, { status: 201 });
  }),

  makeRoute("DELETE", "/api/orders/:id/signature", async (_req, ctx, params) => {
    const db = sql();
    await assertOwnOrder(ctx, params.id!);
    await db`delete from signatures where order_id = ${params.id!}`;
    return json({ ok: true });
  }),
];
