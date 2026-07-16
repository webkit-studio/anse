import { itemCreateBody, itemUpdateBody } from "../../shared/api-contracts";
import { hasBlocking, validateItem } from "../../shared/form-engine";
import { formDefinitionSchema, type FormDefinition, type Params } from "../../shared/form-schema";
import { sql, updatedAtUs } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

// Definice jsou po vzniku immutable → cache na dobu života instance.
const definitionCache = new Map<string, FormDefinition>();

export async function pinnedDefinition(definitionId: string): Promise<FormDefinition> {
  const cached = definitionCache.get(definitionId);
  if (cached) return cached;
  const [row] = await sql()`select definition from form_definitions where id = ${definitionId}`;
  if (!row) throw new ApiError(404, "Definice formuláře nenalezena.");
  const parsed = formDefinitionSchema.parse(row.definition);
  definitionCache.set(definitionId, parsed);
  return parsed;
}

/** Serverová validace params proti definici; blokující chyby ⇒ 422. */
function validateOr422(def: FormDefinition, rawParams: Params, note: string) {
  const { params, issues } = validateItem(def, rawParams, note);
  if (hasBlocking(issues)) {
    throw new ApiError(422, "Formulář obsahuje chyby — zkontrolujte zvýrazněná pole.", { issues });
  }
  return params;
}

const ITEM_COLS = (db: ReturnType<typeof sql>) => db.unsafe(`
  i.id, i.order_id, i.room_id, i.product_type_id, i.form_definition_id,
  i.params, i.note, i.position, ${updatedAtUs("i")}
`);

async function itemWithType(db: ReturnType<typeof sql>, id: string) {
  const [row] = await db`
    select ${ITEM_COLS(db)}, pt.code as product_type_code, pt.name as product_type_name
    from items i join product_types pt on pt.id = i.product_type_id
    where i.id = ${id}
  `;
  return row;
}

/** Vložení s pozicí max+1; při souběhu (unique room_id+position) jeden retry. */
async function insertWithPosition<T>(insert: () => Promise<T>): Promise<T> {
  try {
    return await insert();
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return await insert();
    throw err;
  }
}

export const itemRoutes: Route[] = [
  makeRoute("POST", "/api/items", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, itemCreateBody);

    const [pt] = await db`
      select id, active, current_definition_id from product_types where id = ${body.product_type_id}
    `;
    if (!pt?.active || !pt.current_definition_id) {
      throw new ApiError(400, "Tento typ produktu zatím není k dispozici.");
    }
    const [order] = await db`select id from orders where id = ${body.order_id}`;
    if (!order) throw new ApiError(404, "Zakázka nenalezena.");

    const def = await pinnedDefinition(pt.current_definition_id);
    const params = validateOr422(def, body.params, body.note);

    const itemId = await db.begin(async (tx) => {
      let roomId: string;
      if ("id" in body.room) {
        const [room] = await tx`
          select id from rooms where id = ${body.room.id} and order_id = ${body.order_id}
        `;
        if (!room) throw new ApiError(400, "Místnost nepatří k této zakázce.");
        roomId = room.id;
      } else {
        const name = body.room.name;
        const [existing] = await tx`
          select id from rooms
          where order_id = ${body.order_id} and lower(name) = lower(${name})
        `;
        if (existing) {
          roomId = existing.id;
        } else {
          const [room] = await tx`
            insert into rooms (order_id, name, position)
            values (${body.order_id}, ${name},
                    coalesce((select max(position) from rooms where order_id = ${body.order_id}), 0) + 1)
            returning id
          `;
          roomId = room!.id;
        }
      }

      const [item] = await insertWithPosition(
        () => tx`
          insert into items (order_id, room_id, product_type_id, form_definition_id, params, note, position)
          values (${body.order_id}, ${roomId}, ${pt.id}, ${pt.current_definition_id},
                  ${tx.json(params as never)}, ${body.note},
                  coalesce((select max(position) from items where room_id = ${roomId}), 0) + 1)
          returning id
        `,
      );
      return item!.id as string;
    });

    return json({ item: await itemWithType(db, itemId) }, { status: 201 });
  }),

  makeRoute("PATCH", "/api/items/:id", async (req, _ctx, params) => {
    const db = sql();
    const body = await parseBody(req, itemUpdateBody);

    const [existing] = await db`
      select id, form_definition_id from items where id = ${params.id!}
    `;
    if (!existing) throw new ApiError(404, "Položka nenalezena.");

    // Revalidace proti PŘIPNUTÉ verzi definice položky, ne aktuální.
    const def = await pinnedDefinition(existing.form_definition_id);
    const normalized = validateOr422(def, body.params, body.note);

    const [updated] = await db`
      update items i set params = ${db.json(normalized as never)}, note = ${body.note}
      where i.id = ${params.id!} and i.updated_at = ${body.expected_updated_at}::timestamptz
      returning i.id
    `;
    if (!updated) {
      throw new ApiError(409, "Položku mezitím upravil někdo jiný. Načtěte ji prosím znovu.");
    }
    return json({ item: await itemWithType(db, params.id!) });
  }),

  makeRoute("POST", "/api/items/:id/duplicate", async (_req, _ctx, params) => {
    const db = sql();
    const [source] = await db`
      select order_id, room_id, product_type_id, form_definition_id, params, note
      from items where id = ${params.id!}
    `;
    if (!source) throw new ApiError(404, "Položka nenalezena.");

    // Kopie 1:1 včetně připnuté verze definice (stejná okna vedle sebe).
    const [copy] = await insertWithPosition(
      () => db`
        insert into items (order_id, room_id, product_type_id, form_definition_id, params, note, position)
        values (${source.order_id}, ${source.room_id}, ${source.product_type_id},
                ${source.form_definition_id}, ${db.json(source.params)}, ${source.note},
                coalesce((select max(position) from items where room_id = ${source.room_id}), 0) + 1)
        returning id
      `,
    );
    return json({ item: await itemWithType(db, copy!.id) }, { status: 201 });
  }),

  makeRoute("DELETE", "/api/items/:id", async (_req, _ctx, params) => {
    const db = sql();
    const [deleted] = await db`delete from items where id = ${params.id!} returning id`;
    if (!deleted) throw new ApiError(404, "Položka nenalezena.");
    return json({ ok: true });
  }),
];
