import { sql } from "../../server/db";
import { days } from "../../shared/format";
import { notify } from "../../server/notify";

// Keepalive + údržba. Supabase free tier pauzne projekt po ~7 dnech bez
// aktivity, proto se sem chodí každých 5 minut; jednou denně se navíc
// upozorní na zakázky, které stojí.

const STALE_DAYS = 7;

/** Zakázky bez pohybu v terénních fázích (nacenění a fakturace čekají
 *  na rozhodnutí lidí a klidně týdny — ty se nehlásí). */
async function reportStale(origin: string): Promise<void> {
  const db = sql();
  const rows = await db`
    select o.id, o.customer_name, o.addr_montaz, c.name as contact_name,
           extract(day from now() - o.updated_at)::int as idle_days
    from orders o
    join contacts c on c.id = o.contact_id
    where o.phase in ('k_zamereni', 'k_montazi')
      and o.updated_at < now() - make_interval(days => ${STALE_DAYS})
      and not exists (
        select 1 from notifications n
        where n.order_id = o.id and n.event = 'stoji'
          and n.created_at > now() - make_interval(days => ${STALE_DAYS})
      )
    limit 20
  `;

  for (const o of rows) {
    const who = String(o.customer_name || o.contact_name || "Zakázka").trim();
    const where = String(o.addr_montaz ?? "").trim();
    await notify({
      event: "stoji",
      subject: where ? `${who} · ${where}` : who,
      vars: { dny: days(Number(o.idle_days)) },
      orderId: o.id as string,
      url: `${origin}/zakazky/${o.id}`,
    });
  }
}

export default async (req: Request) => {
  if (!process.env.DATABASE_URL) return new Response("skip: DATABASE_URL není nastavena");
  const db = sql();
  await db`select 1`;
  await db`delete from login_attempts where attempted_at < now() - interval '2 days'`.catch(
    () => undefined, // tabulka nemusí existovat před první migrací
  );

  // Kontrola stojících zakázek jen v ranním okně, ne 288× denně.
  const hourPrague = Number(
    new Intl.DateTimeFormat("cs-CZ", {
      timeZone: "Europe/Prague",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hourPrague === 7) {
    const origin = process.env.APP_URL ?? new URL(req.url).origin;
    await reportStale(origin).catch((err) => {
      console.error("Kontrola stojících zakázek selhala:", err instanceof Error ? err.message : err);
    });
  }

  return new Response("ok");
};

// Každých 5 minut: drží funkci i DB spojení teplé (latence ukládání v terénu)
// a zároveň brání Supabase free-tier pauze. ~8 640 volání/měs. z limitu 125k.
export const config = { schedule: "*/5 * * * *" };
