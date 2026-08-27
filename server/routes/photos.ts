import { photoCreateBody, signatureBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Ctx, type Route } from "../router";

// Fotky (zaměření / závada / realizace) a podpis zákazníka.
// Data jdou do DB jako data-URL — free tier nemá objektové úložiště a fotky
// jsou komprimované na klientu (limit 1,4 MB hlídá zod kontrakt).

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function assertOwnOrder(ctx: Ctx, orderId: string): Promise<void> {
  const [o] = await sql()`select assignee_id from orders where id = ${orderId}`.catch(() => []);
  if (!o) throw new ApiError(404, "Zakázka nenalezena.");
  if (ctx.user.role === "technik" && o.assignee_id !== ctx.user.id) {
    throw new ApiError(404, "Zakázka nenalezena.");
  }
}

export const photoRoutes: Route[] = [
  makeRoute("POST", "/api/photos", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, photoCreateBody);
    await assertOwnOrder(ctx, body.order_id);

    try {
      const [photo] = await db`
        insert into item_photos (item_id, order_id, kind, data, created_by)
        values (${body.item_id ?? null}, ${body.order_id}, ${body.kind}, ${body.data}, ${ctx.user.id})
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
      select p.id, p.order_id from item_photos p where p.id = ${params.id!}
    `.catch(() => []);
    if (!photo) throw new ApiError(404, "Fotka nenalezena.");
    await assertOwnOrder(ctx, photo.order_id as string);

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
      throw new ApiError(422, "Neplatný podpis. Zkuste ho nakreslit znovu.");
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
