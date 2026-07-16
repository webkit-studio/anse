import { sql } from "../db";
import { json } from "../http";
import { makeRoute, type Route } from "../router";

export const productTypeRoutes: Route[] = [
  makeRoute("GET", "/api/product-types", async () => {
    const db = sql();
    const rows = await db`
      select pt.id, pt.code, pt.name, pt.manufacturer, pt.active, pt.sort,
             pt.current_definition_id, fd.version as definition_version, fd.definition
      from product_types pt
      left join form_definitions fd on fd.id = pt.current_definition_id
      order by pt.sort
    `;
    return json({
      product_types: rows.map((r) => ({
        ...r,
        // Definice se posílá jen u aktivních typů (neaktivní jsou jen dlaždice).
        definition: r.active ? (r.definition ?? undefined) : undefined,
      })),
    });
  }),
];
