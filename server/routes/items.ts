import { itemCreateBody, itemUpdateBody } from "../../shared/api-contracts";
import { hasBlocking, validateItem } from "../../shared/form-engine";
import { formDefinitionSchema, type FormDefinition, type Params } from "../../shared/form-schema";
import { sql } from "../db";
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

/** Vložení s pozicí max+1; při souběhu (unique room_id+position) jeden retry. */
async function insertWithPosition<T>(insert: () => Promise<T>): Promise<T> {
  try {
    return await insert();
  } catch (err) {
    if ((err as { code?: string }).code === "23505") return await insert();
    throw err;
  }
}

function isForeignKeyViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "23503";
}

export const itemRoutes: Route[] = [
  makeRoute("POST", "/api/items", async (req) => {
    const db = sql();
    const body = await parseBody(req, itemCreateBody);

    const [pt] = await db`
      select id, active, current_definition_id from product_types where id = ${body.product_type_id}
    `;
    if (!pt?.active || !pt.current_definition_id) {
      throw new ApiError(400, "Tento typ produktu zatím není k dispozici.");
    }
    const def = await pinnedDefinition(pt.current_definition_id);
    const params = validateOr422(def, body.params, body.note);

    // Místnost: id (existující) nebo name (najít/založit). Bez transakce —
    // nejhorší scénář při pádu je prázdná místnost (jde smazat, reusuje se).
    let roomId: string;
    if ("id" in body.room) {
      roomId = body.room.id;
    } else {
      const name = body.room.name;
      const [existing] = await db`
        select id from rooms where order_id = ${body.order_id} and lower(name) = lower(${name})
      `;
      if (existing) {
        roomId = existing.id;
      } else {
        const [room] = await insertWithPosition(
          () => db`
            insert into rooms (order_id, name, position)
            values (${body.order_id}, ${name},
                    coalesce((select max(position) from rooms where order_id = ${body.order_id}), 0) + 1)
            returning id
          `,
        ).catch((err) => {
          if (isForeignKeyViolation(err)) throw new ApiError(404, "Zakázka nenalezena.");
          throw err;
        });
        roomId = room!.id;
      }
    }

    // Jeden dotaz: insert + join na typ (latence US↔EU) — složená FK
    // (room_id, order_id) → rooms zajistí, že místnost patří k zakázce.
    try {
      const [item] = await insertWithPosition(
        () => db`
          with ins as (
            insert into items (order_id, room_id, product_type_id, form_definition_id, params, note, position)
            values (${body.order_id}, ${roomId}, ${pt.id}, ${pt.current_definition_id},
                    ${db.json(params as never)}, ${body.note},
                    coalesce((select max(position) from items where room_id = ${roomId}), 0) + 1)
            returning *
          )
          select ins.*, pt.code as product_type_code, pt.name as product_type_name
          from ins join product_types pt on pt.id = ins.product_type_id
        `,
      );
      return json({ item }, { status: 201 });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ApiError(400, "Místnost nepatří k této zakázce.");
      }
      throw err;
    }
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

    // Jeden dotaz: optimistický zámek + případný přesun místnosti (s novou
    // pozicí na konci cílové místnosti) + join na typ. Složená FK ohlídá,
    // že cílová místnost patří ke stejné zakázce; souběh pozic řeší retry.
    try {
      const [updated] = await insertWithPosition(
        () => db`
          with upd as (
            update items set
              params = ${db.json(normalized as never)},
              note = ${body.note},
              room_id = coalesce(${body.room_id ?? null}::uuid, room_id),
              position = case
                when ${body.room_id ?? null}::uuid is not null and ${body.room_id ?? null}::uuid <> room_id
                  then coalesce((select max(i2.position) from items i2 where i2.room_id = ${body.room_id ?? null}::uuid), 0) + 1
                else position
              end
            where id = ${params.id!} and updated_at = ${body.expected_updated_at}
            returning *
          )
          select upd.*, pt.code as product_type_code, pt.name as product_type_name
          from upd join product_types pt on pt.id = upd.product_type_id
        `,
      );
      if (!updated) {
        throw new ApiError(409, "Položku mezitím upravil někdo jiný. Načtěte ji prosím znovu.");
      }
      return json({ item: updated });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ApiError(400, "Místnost nepatří k této zakázce.");
      }
      throw err;
    }
  }),

  makeRoute("POST", "/api/items/:id/duplicate", async (_req, _ctx, params) => {
    const db = sql();
    // Kopie 1:1 včetně připnuté verze definice (stejná okna vedle sebe) —
    // jediný dotaz: čtení zdroje + insert + join na typ.
    const [copy] = await insertWithPosition(
      () => db`
        with src as (
          select order_id, room_id, product_type_id, form_definition_id, params, note
          from items where id = ${params.id!}
        ), ins as (
          insert into items (order_id, room_id, product_type_id, form_definition_id, params, note, position)
          select order_id, room_id, product_type_id, form_definition_id, params, note,
                 coalesce((select max(position) from items i where i.room_id = src.room_id), 0) + 1
          from src
          returning *
        )
        select ins.*, pt.code as product_type_code, pt.name as product_type_name
        from ins join product_types pt on pt.id = ins.product_type_id
      `,
    );
    if (!copy) throw new ApiError(404, "Položka nenalezena.");
    return json({ item: copy }, { status: 201 });
  }),

  makeRoute("DELETE", "/api/items/:id", async (_req, _ctx, params) => {
    const db = sql();
    const [deleted] = await db`delete from items where id = ${params.id!} returning id`;
    if (!deleted) throw new ApiError(404, "Položka nenalezena.");
    return json({ ok: true });
  }),
];
