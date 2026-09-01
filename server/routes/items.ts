import { itemCreateBody, itemUpdateBody } from "../../shared/api-contracts";
import { hasBlocking, validateItem, type Issue } from "../../shared/form-engine";
import { formDefinitionSchema, type FormDefinition, type Params } from "../../shared/form-schema";
import { validateKonfig, validateSuysDimensions, type KonfigProduct } from "../../shared/konfigurator";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { getKonfigProduct } from "../konfigurator";
import { makeRoute, parseBody, type Ctx, type Route } from "../router";

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

/**
 * Validace proti naměřeným podkladům dodavatele (konfigurátor).
 * Server nevěří klientovi — stejný vyhodnocovač běží na obou stranách.
 * Vrací stav ořezaný na stringy (params jsou v DB jsonb map kód → hodnota).
 */
function validateKonfigOr422(product: KonfigProduct, rawParams: Params): Params {
  const state: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    if (v !== undefined && v !== null && String(v) !== "") state[k] = String(v);
  }
  const { issues } = validateKonfig(product, state);
  const dims = product.dodavatel === "suys" ? validateSuysDimensions(product, state) : [];
  const all = [...issues, ...dims];
  if (all.some((i) => i.level === "error")) {
    const mapped: Issue[] = all.map((i) => ({
      level: i.level,
      fieldKey: i.fieldCode,
      message: i.message,
    }));
    throw new ApiError(422, "Formulář obsahuje chyby — zkontrolujte zvýrazněná pole.", {
      issues: mapped,
    });
  }
  return state;
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

/** Technik smí sahat jen na svoje zakázky — cizí pro něj neexistují. */
async function assertOwnOrder(ctx: Ctx, orderId: string): Promise<void> {
  if (ctx.user.role !== "technik") return;
  const [o] = await sql()`select assignee_id from orders where id = ${orderId}`.catch(() => []);
  if (!o || o.assignee_id !== ctx.user.id) throw new ApiError(404, "Zakázka nenalezena.");
}

async function assertOwnItem(ctx: Ctx, itemId: string): Promise<void> {
  if (ctx.user.role !== "technik") return;
  const [row] = await sql()`
    select o.assignee_id from items i join orders o on o.id = i.order_id where i.id = ${itemId}
  `.catch(() => []);
  if (!row || row.assignee_id !== ctx.user.id) throw new ApiError(404, "Položka nenalezena.");
}

/** Místnost: id (existující) nebo name (najít/založit). */
async function resolveRoom(
  db: ReturnType<typeof sql>,
  orderId: string,
  room: { id: string } | { name: string },
): Promise<string> {
  if ("id" in room) return room.id;
  const [existing] = await db`
    select id from rooms where order_id = ${orderId} and lower(name) = lower(${room.name})
  `;
  if (existing) return existing.id as string;

  const [created] = await insertWithPosition(
    () => db`
      insert into rooms (order_id, name, position)
      values (${orderId}, ${room.name},
              coalesce((select max(position) from rooms where order_id = ${orderId}), 0) + 1)
      returning id
    `,
  ).catch((err) => {
    if (isForeignKeyViolation(err)) throw new ApiError(404, "Zakázka nenalezena.");
    throw err;
  });
  return created!.id as string;
}

/** Přepis názvu z nastavení vyhrává nad originálem dodavatele. */
function withNames(item: Record<string, unknown> | undefined) {
  if (!item) return item;
  const { product_type_custom_name, subcategory_custom_name, ...rest } = item as Record<string, string>;
  return {
    ...rest,
    product_type_name: product_type_custom_name || rest.product_type_name,
    subcategory_name: subcategory_custom_name || rest.subcategory_name,
    photos: [],
  };
}

export const itemRoutes: Route[] = [
  makeRoute("POST", "/api/items", async (req, ctx) => {
    const db = sql();
    const body = await parseBody(req, itemCreateBody);
    await assertOwnOrder(ctx, body.order_id);

    const [pt] = await db`
      select id, active from product_types where id = ${body.product_type_id}
    `.catch(() => []);
    if (!pt?.active) throw new ApiError(400, "Tento produkt zatím není k dispozici.");

    // Zaměření se vyplňuje podle definice podkategorie; oprava je jen
    // foto závady + popis (žádný formulář, žádná podkategorie).
    let definitionId: string | null = null;
    let subcategoryId: string | null = null;
    let konfigKey: string | null = null;
    let params: Params = {};

    if (body.kind === "config") {
      const [sub] = await db`
        select id, active, current_definition_id, konfig_key from subcategories
        where id = ${body.subcategory_id} and product_type_id = ${pt.id}
      `.catch(() => []);
      if (!sub?.active) throw new ApiError(400, "Tato podkategorie zatím není k dispozici.");
      subcategoryId = sub.id;

      if (sub.konfig_key) {
        const product = getKonfigProduct(sub.konfig_key as string);
        if (!product) throw new ApiError(400, "Podklady produktu nejsou k dispozici.");
        params = validateKonfigOr422(product, body.params);
        konfigKey = sub.konfig_key as string;
      } else if (sub.current_definition_id) {
        const def = await pinnedDefinition(sub.current_definition_id);
        params = validateOr422(def, body.params, body.note);
        definitionId = sub.current_definition_id;
      } else {
        throw new ApiError(400, "Tato podkategorie zatím není k dispozici.");
      }
    }

    const roomId = await resolveRoom(db, body.order_id, body.room);
    const defectNote = body.kind === "oprava" ? body.defect_note : "";

    // Jeden dotaz: insert + join na katalog (latence US↔EU) — složená FK
    // (room_id, order_id) → rooms zajistí, že místnost patří k zakázce.
    try {
      const [item] = await insertWithPosition(
        () => db`
          with ins as (
            insert into items (order_id, room_id, kind, product_type_id, subcategory_id,
                               form_definition_id, konfig_key, params, note, defect_note, position)
            values (${body.order_id}, ${roomId}, ${body.kind}, ${pt.id}, ${subcategoryId},
                    ${definitionId}, ${konfigKey}, ${db.json(params as never)}, ${body.note}, ${defectNote},
                    coalesce((select max(position) from items where room_id = ${roomId}), 0) + 1)
            returning *
          )
          select ins.*, pt.name as product_type_name, pt.custom_name as product_type_custom_name,
                 s.name as subcategory_name, s.custom_name as subcategory_custom_name
          from ins
          join product_types pt on pt.id = ins.product_type_id
          left join subcategories s on s.id = ins.subcategory_id
        `,
      );
      return json({ item: withNames(item) }, { status: 201 });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ApiError(400, "Místnost nepatří k této zakázce.");
      }
      throw err;
    }
  }),

  makeRoute("PATCH", "/api/items/:id", async (req, ctx, params) => {
    const db = sql();
    const body = await parseBody(req, itemUpdateBody);
    await assertOwnItem(ctx, params.id!);

    const [existing] = await db`
      select id, kind, form_definition_id, konfig_key from items where id = ${params.id!}
    `.catch(() => []);
    if (!existing) throw new ApiError(404, "Položka nenalezena.");

    // Revalidace proti PŘIPNUTÉ verzi definice položky, ne aktuální.
    let normalized: Params = {};
    if (existing.kind === "config" && existing.konfig_key) {
      const product = getKonfigProduct(existing.konfig_key as string);
      if (!product) throw new ApiError(400, "Podklady produktu nejsou k dispozici.");
      normalized = validateKonfigOr422(product, body.params ?? {});
    } else if (existing.kind === "config") {
      const def = await pinnedDefinition(existing.form_definition_id);
      normalized = validateOr422(def, body.params ?? {}, body.note);
    }
    if (existing.kind === "oprava" && body.defect_note !== undefined && !body.defect_note.trim()) {
      throw new ApiError(400, "Popište závadu.");
    }

    // Jeden dotaz: optimistický zámek + případný přesun místnosti (s novou
    // pozicí na konci cílové místnosti) + join na katalog. Složená FK ohlídá,
    // že cílová místnost patří ke stejné zakázce; souběh pozic řeší retry.
    try {
      const [updated] = await insertWithPosition(
        () => db`
          with upd as (
            update items set
              params = case when kind = 'config' then ${db.json(normalized as never)}::jsonb else params end,
              note = ${body.note},
              defect_note = coalesce(${body.defect_note ?? null}, defect_note),
              room_id = coalesce(${body.room_id ?? null}::uuid, room_id),
              position = case
                when ${body.room_id ?? null}::uuid is not null and ${body.room_id ?? null}::uuid <> room_id
                  then coalesce((select max(i2.position) from items i2 where i2.room_id = ${body.room_id ?? null}::uuid), 0) + 1
                else position
              end
            where id = ${params.id!} and updated_at = ${body.expected_updated_at}
            returning *
          )
          select upd.*, pt.name as product_type_name, pt.custom_name as product_type_custom_name,
                 s.name as subcategory_name, s.custom_name as subcategory_custom_name
          from upd
          join product_types pt on pt.id = upd.product_type_id
          left join subcategories s on s.id = upd.subcategory_id
        `,
      );
      if (!updated) {
        throw new ApiError(409, "Položku mezitím upravil někdo jiný. Načtěte ji prosím znovu.");
      }
      return json({ item: withNames(updated) });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ApiError(400, "Místnost nepatří k této zakázce.");
      }
      throw err;
    }
  }),

  makeRoute("POST", "/api/items/:id/duplicate", async (_req, ctx, params) => {
    const db = sql();
    await assertOwnItem(ctx, params.id!);
    // Kopie 1:1 včetně připnuté verze definice (stejná okna vedle sebe) —
    // jediný dotaz: čtení zdroje + insert + join na katalog.
    const [copy] = await insertWithPosition(
      () => db`
        with src as (
          select order_id, room_id, kind, product_type_id, subcategory_id, form_definition_id,
                 konfig_key, params, note, defect_note
          from items where id = ${params.id!}
        ), ins as (
          insert into items (order_id, room_id, kind, product_type_id, subcategory_id,
                             form_definition_id, konfig_key, params, note, defect_note, position)
          select order_id, room_id, kind, product_type_id, subcategory_id, form_definition_id,
                 konfig_key, params, note, defect_note,
                 coalesce((select max(position) from items i where i.room_id = src.room_id), 0) + 1
          from src
          returning *
        )
        select ins.*, pt.name as product_type_name, pt.custom_name as product_type_custom_name,
               s.name as subcategory_name, s.custom_name as subcategory_custom_name
        from ins
        join product_types pt on pt.id = ins.product_type_id
        left join subcategories s on s.id = ins.subcategory_id
      `,
    );
    if (!copy) throw new ApiError(404, "Položka nenalezena.");
    return json({ item: withNames(copy) }, { status: 201 });
  }),

  makeRoute("DELETE", "/api/items/:id", async (_req, ctx, params) => {
    const db = sql();
    await assertOwnItem(ctx, params.id!);
    const [deleted] = await db`delete from items where id = ${params.id!} returning id`
      .catch(() => []);
    if (!deleted) throw new ApiError(404, "Položka nenalezena.");
    return json({ ok: true });
  }),
];
