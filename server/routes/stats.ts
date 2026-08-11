import { sql } from "../db";
import { ApiError, json } from "../http";
import { makeRoute, type Route } from "../router";

// Statistiky pro admina (jen měsíční pohled). „Vyměřeno/založeno" = založení
// zakázky technikem (zakládá se na místě při měření); „objednáno" = přepnutí
// na stav Objednáno (z auditu order_events). Hranice měsíce v Europe/Prague.

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
          where e.to_status = 'k_objednavce'
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


      throw new ApiError(400, "Zadejte ?month=YYYY-MM.");
    },
    { adminOnly: true },
  ),
];
