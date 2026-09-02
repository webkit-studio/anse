import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, type Route } from "../router";

// Statistiky kanceláře — měsíční pohled. Hranice měsíce v Europe/Prague.
// „Zaměřeno" a „namontováno" se čtou z auditu přechodů (order_events), ne ze
// současné fáze: zakázka, která už je hotová, musela projít oběma kroky.

const TZ = "Europe/Prague";

export const statsRoutes: Route[] = [
  makeRoute(
    "GET",
    "/api/stats",
    async (req) => {
      const db = sql();
      const url = new URL(req.url);
      const month = url.searchParams.get("month");
      if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        throw new ApiError(400, "Zadej ?month=YYYY-MM.");
      }
      const start = `${month}-01`;

      const range = (col: string) => db.unsafe(`
        ${col} >= ('${start}'::timestamp at time zone '${TZ}')
        and ${col} < (('${start}'::date + interval '1 month') at time zone '${TZ}')
      `);

      const [kontakty] = await db`
        select count(*)::int as n from contacts c where ${range("c.created_at")}
      `;
      // Kohorta: kontakty ZALOŽENÉ v měsíci a co z nich je K DNEŠKU — kontakt
      // klidně dozraje v zakázku o měsíc později a pořád se počítá sem.
      const [cohort] = await db`
        select
          count(*) filter (where exists
            (select 1 from orders o where o.contact_id = c.id))::int as se_zakazkou,
          count(*) filter (where exists (
            select 1 from orders o where o.contact_id = c.id
              and (o.phase in ('k_montazi', 'k_fakturaci', 'hotovo')
                   or exists (select 1 from order_events e
                              where e.order_id = o.id and e.to_phase = 'k_montazi'))
          ))::int as objednano,
          count(*) filter (where c.cancelled)::int as zruseno
        from contacts c where ${range("c.created_at")}
      `;
      const [zamereno] = await db`
        select count(distinct e.order_id)::int as n from order_events e
        where e.to_phase = 'k_naceneni' and ${range("e.created_at")}
      `;
      const [objednano] = await db`
        select count(distinct e.order_id)::int as n from order_events e
        where e.to_phase = 'k_montazi' and ${range("e.created_at")}
      `;
      const [hotovo] = await db`
        select count(distinct e.order_id)::int as n from order_events e
        where e.to_phase in ('k_fakturaci', 'hotovo') and ${range("e.created_at")}
      `;

      const techs = await db`
        select u.name,
          count(*) filter (where e.to_phase = 'k_naceneni')::int as zamereno,
          count(*) filter (where e.to_phase = 'k_fakturaci')::int as namontovano,
          coalesce(sum(
            case when e.to_phase = 'k_fakturaci'
              then nullif(regexp_replace(o.price_montage, '[^0-9]', '', 'g'), '')::numeric
            end
          ), 0)::text as price_montage_sum
        from order_events e
        join users u on u.id = e.user_id
        join orders o on o.id = e.order_id
        where ${range("e.created_at")} and e.to_phase in ('k_naceneni', 'k_fakturaci')
        group by u.name
        order by u.name
      `;

      return json({
        month,
        kpi: {
          nove_kontakty: kontakty?.n ?? 0,
          zamereno: zamereno?.n ?? 0,
          objednano: objednano?.n ?? 0,
          hotovo: hotovo?.n ?? 0,
        },
        funnel: [
          { label: "Založeno", value: kontakty?.n ?? 0 },
          { label: "Má zakázku", value: (cohort?.se_zakazkou as number) ?? 0 },
          { label: "Objednáno", value: (cohort?.objednano as number) ?? 0 },
          { label: "Zrušeno", value: (cohort?.zruseno as number) ?? 0 },
        ],
        techs,
      });
    },
    { officeOnly: true },
  ),
];
