import { clientUpdateBody } from "../../shared/api-contracts";
import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

const CLIENT_COLS = (db: ReturnType<typeof sql>) => db.unsafe(`
  c.id, c.name, c.contact_person, c.address, c.delivery_address, c.phone,
  c.email, c.ico, c.dic, c.note, c.updated_at
`);

export const clientRoutes: Route[] = [
  makeRoute("GET", "/api/clients", async (req) => {
    const db = sql();
    const q = (new URL(req.url).searchParams.get("search") ?? "").trim();
    const rows = await db`
      select ${CLIENT_COLS(db)} from clients c
      where ${q} = ''
        or unaccent_cz(c.name) like '%' || unaccent_cz(${q}) || '%'
        or unaccent_cz(c.address) like '%' || unaccent_cz(${q}) || '%'
        or c.phone like '%' || ${q} || '%'
        or c.ico like '%' || ${q} || '%'
      order by c.updated_at desc
      limit 20
    `;
    return json({ clients: rows });
  }),

  makeRoute("PATCH", "/api/clients/:id", async (req, _ctx, params) => {
    const db = sql();
    const body = await parseBody(req, clientUpdateBody);
    const { expected_updated_at, ...fields } = body;

    const [updated] = await db`
      update clients c set ${db(fields)}
      where c.id = ${params.id!} and c.updated_at = ${expected_updated_at}
      returning ${CLIENT_COLS(db)}
    `;
    if (!updated) {
      const [exists] = await db`select 1 from clients where id = ${params.id!}`;
      if (!exists) throw new ApiError(404, "Klient nenalezen.");
      throw new ApiError(409, "Klienta mezitím upravil někdo jiný. Načtěte ho prosím znovu.");
    }
    return json({ client: updated });
  }),
];
