import { roomCreateBody, roomUpdateBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

export const roomRoutes: Route[] = [
  makeRoute("POST", "/api/orders/:orderId/rooms", async (req, _ctx, params) => {
    const db = sql();
    const body = await parseBody(req, roomCreateBody);

    const [existing] = await db`
      select id, order_id, name, note, position from rooms
      where order_id = ${params.orderId!} and lower(name) = lower(${body.name})
    `;
    if (existing) return json({ room: existing });

    try {
      const [room] = await db`
        insert into rooms (order_id, name, position)
        values (${params.orderId!}, ${body.name},
                coalesce((select max(position) from rooms where order_id = ${params.orderId!}), 0) + 1)
        returning id, order_id, name, note, position
      `;
      return json({ room }, { status: 201 });
    } catch (err) {
      if ((err as { code?: string }).code === "23503") throw new ApiError(404, "Zakázka nenalezena.");
      if ((err as { code?: string }).code === "23505") {
        // souběh pozice — jeden retry
        const [room] = await db`
          insert into rooms (order_id, name, position)
          values (${params.orderId!}, ${body.name},
                  coalesce((select max(position) from rooms where order_id = ${params.orderId!}), 0) + 1)
          returning id, order_id, name, note, position
        `;
        return json({ room }, { status: 201 });
      }
      throw err;
    }
  }),

  makeRoute("PATCH", "/api/rooms/:id", async (req, _ctx, params) => {
    const db = sql();
    const body = await parseBody(req, roomUpdateBody);

    const patch: Record<string, string> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.note !== undefined) patch.note = body.note;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

    const [updated] = await db`
      update rooms set ${db(patch)} where id = ${params.id!}
      returning id, order_id, name, note, position
    `;
    if (!updated) throw new ApiError(404, "Místnost nenalezena.");
    return json({ room: updated });
  }),

  makeRoute("DELETE", "/api/rooms/:id", async (_req, _ctx, params) => {
    const db = sql();
    const [room] = await db`
      select r.id, (select count(*)::int from items i where i.room_id = r.id) as item_count
      from rooms r where r.id = ${params.id!}
    `;
    if (!room) throw new ApiError(404, "Místnost nenalezena.");
    if (room.item_count > 0) {
      throw new ApiError(409, "Místnost není prázdná — nejdřív odeberte položky.");
    }
    await db`delete from rooms where id = ${params.id!}`;
    return json({ ok: true });
  }),
];
