import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, type Route } from "../router";

// Statistiky pro admina. „Vyměřeno/založeno" = založení zakázky technikem
// (zakládá se na místě při měření); „objednáno" = přepnutí na stav Objednáno
// (z auditu order_events — kdo a kdy). Dny se počítají v Europe/Prague.

const TZ = "Europe/Prague";

interface UserCounts {
  zalozeno: Map<string, number>;
  objednano: Map<string, number>;
}

function mergeUsers(c: UserCounts) {
  const names = new Set([...c.zalozeno.keys(), ...c.objednano.keys()]);
  return [...names]
    .sort((a, b) => a.localeCompare(b, "cs"))
    .map((name) => ({
      name,
      zalozeno: c.zalozeno.get(name) ?? 0,
      objednano: c.objednano.get(name) ?? 0,
    }));
}

export const statsRoutes: Route[] = [
  makeRoute(
    "GET",
    "/api/stats",
    async (req) => {
      const db = sql();
      const url = new URL(req.url);
      const month = url.searchParams.get("month");
      const week = url.searchParams.get("week");

      if (month) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ApiError(400, "Neplatný měsíc.");
        const start = `${month}-01`;

        const zalozeno = await db`
          select u.name, count(*)::int as n
          from orders o join users u on u.id = o.created_by
          where o.created_at >= (${start}::timestamp at time zone ${TZ})
            and o.created_at < ((${start}::date + interval '1 month') at time zone ${TZ})
          group by u.name
        `;
        const objednano = await db`
          select u.name, count(distinct e.order_id)::int as n
          from order_events e join users u on u.id = e.user_id
          where e.to_status = 'objednano'
            and e.created_at >= (${start}::timestamp at time zone ${TZ})
            and e.created_at < ((${start}::date + interval '1 month') at time zone ${TZ})
          group by u.name
        `;

        const counts: UserCounts = {
          zalozeno: new Map(zalozeno.map((r) => [r.name as string, r.n as number])),
          objednano: new Map(objednano.map((r) => [r.name as string, r.n as number])),
        };
        return json({
          month,
          zalozeno: [...counts.zalozeno.values()].reduce((a, b) => a + b, 0),
          objednano: [...counts.objednano.values()].reduce((a, b) => a + b, 0),
          users: mergeUsers(counts),
        });
      }

      if (week) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new ApiError(400, "Neplatný týden.");

        const zalozeno = await db`
          select ((o.created_at at time zone ${TZ})::date)::text as den, u.name, count(*)::int as n
          from orders o join users u on u.id = o.created_by
          where (o.created_at at time zone ${TZ})::date >= ${week}::date
            and (o.created_at at time zone ${TZ})::date < ${week}::date + 7
          group by den, u.name
        `;
        const objednano = await db`
          select ((e.created_at at time zone ${TZ})::date)::text as den, u.name,
                 count(distinct e.order_id)::int as n
          from order_events e join users u on u.id = e.user_id
          where e.to_status = 'objednano'
            and (e.created_at at time zone ${TZ})::date >= ${week}::date
            and (e.created_at at time zone ${TZ})::date < ${week}::date + 7
          group by den, u.name
        `;

        const monday = new Date(`${week}T00:00:00Z`);
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setUTCDate(d.getUTCDate() + i);
          const date = d.toISOString().slice(0, 10);
          const counts: UserCounts = {
            zalozeno: new Map(
              zalozeno.filter((r) => r.den === date).map((r) => [r.name as string, r.n as number]),
            ),
            objednano: new Map(
              objednano.filter((r) => r.den === date).map((r) => [r.name as string, r.n as number]),
            ),
          };
          return {
            date,
            zalozeno: [...counts.zalozeno.values()].reduce((a, b) => a + b, 0),
            objednano: [...counts.objednano.values()].reduce((a, b) => a + b, 0),
            users: mergeUsers(counts),
          };
        });
        return json({ week, days });
      }

      throw new ApiError(400, "Zadejte ?month=YYYY-MM nebo ?week=YYYY-MM-DD (pondělí).");
    },
    { adminOnly: true },
  ),
];
