import { productTypeUpdateBody, subcategoryUpdateBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { getKonfigProduct } from "../konfigurator";
import { makeRoute, parseBody, type Route } from "../router";

// Katalog má dvě úrovně: produkt (Okenní síť) → podkategorie (Jack West · SEL 15).
// Definice formuláře visí na podkategorii; pole se nastavují v JSON definicích
// u dodavatele, v aplikaci jde měnit jen název, poznámka pro technika a aktivita.

export const productTypeRoutes: Route[] = [
  // Naměřený produkt dodavatele — celé schéma polí a pravidel pro formulář.
  // Klient si ho cachuje; podklady se mění jen s deployem.
  makeRoute("GET", "/api/konfigurator/:key", async (_req, _ctx, params) => {
    const product = getKonfigProduct(params.key!);
    if (!product) throw new ApiError(404, "Podklady produktu nenalezeny.");
    return json({ product }, { headers: { "cache-control": "private, max-age=3600" } });
  }),

  makeRoute("GET", "/api/product-types", async () => {
    const db = sql();
    const types = await db`
      select id, code, name, custom_name, note_for_tech, active, sort
      from product_types order by sort
    `;
    const subs = await db`
      select s.id, s.product_type_id, s.code, s.name, s.custom_name, s.note, s.active, s.sort,
             s.konfig_key, s.current_definition_id, fd.version as definition_version, fd.definition
      from subcategories s
      left join form_definitions fd on fd.id = s.current_definition_id
      order by s.sort, s.name
    `;

    return json({
      product_types: types.map((t) => ({
        ...t,
        subcategories: subs
          .filter((s) => s.product_type_id === t.id)
          .map((s) => ({
            ...s,
            // Definice se posílá jen u aktivních podkategorií; produkty
            // z konfigurátoru si klient stahuje zvlášť přes /api/konfigurator.
            definition: s.active && t.active && !s.konfig_key ? (s.definition ?? undefined) : undefined,
            field_count: s.konfig_key
              ? (getKonfigProduct(s.konfig_key as string)?.fields.length ?? 0)
              : s.definition
                ? (s.definition as { groups?: { fields?: unknown[] }[] }).groups?.reduce(
                    (n, g) => n + (g.fields?.length ?? 0),
                    0,
                  )
                : 0,
          })),
      })),
    });
  }),

  makeRoute(
    "PATCH",
    "/api/product-types/:id",
    async (req, _ctx, params) => {
      const db = sql();
      const body = await parseBody(req, productTypeUpdateBody);
      const patch: Record<string, string | boolean> = {};
      if (body.custom_name !== undefined) patch.custom_name = body.custom_name;
      if (body.note_for_tech !== undefined) patch.note_for_tech = body.note_for_tech;
      if (body.active !== undefined) patch.active = body.active;
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

      const [updated] = await db`
        update product_types set ${db(patch)} where id = ${params.id!}
        returning id, code, name, custom_name, note_for_tech, active, sort
      `.catch((err) => {
        if ((err as { code?: string }).code === "22P02") return [];
        throw err;
      });
      if (!updated) throw new ApiError(404, "Produkt nenalezen.");
      return json({ product_type: updated });
    },
    { officeOnly: true },
  ),

  makeRoute(
    "PATCH",
    "/api/subcategories/:id",
    async (req, _ctx, params) => {
      const db = sql();
      const body = await parseBody(req, subcategoryUpdateBody);
      const patch: Record<string, string | boolean> = {};
      if (body.custom_name !== undefined) patch.custom_name = body.custom_name;
      if (body.note !== undefined) patch.note = body.note;
      if (body.active !== undefined) patch.active = body.active;
      if (Object.keys(patch).length === 0) throw new ApiError(400, "Není co uložit.");

      const [updated] = await db`
        update subcategories set ${db(patch)} where id = ${params.id!}
        returning id, product_type_id, code, name, custom_name, note, active, sort
      `.catch((err) => {
        if ((err as { code?: string }).code === "22P02") return [];
        throw err;
      });
      if (!updated) throw new ApiError(404, "Podkategorie nenalezena.");
      return json({ subcategory: updated });
    },
    { officeOnly: true },
  ),
];
