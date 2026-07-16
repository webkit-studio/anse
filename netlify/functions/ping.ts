import { sql } from "../../server/db";

// Denní keepalive: Supabase free tier pauzne projekt po ~7 dnech bez aktivity.
// Zároveň promazává staré záznamy o pokusech o přihlášení.
export default async () => {
  if (!process.env.DATABASE_URL) return new Response("skip: DATABASE_URL není nastavena");
  const db = sql();
  await db`select 1`;
  await db`delete from login_attempts where attempted_at < now() - interval '2 days'`.catch(
    () => undefined, // tabulka nemusí existovat před první migrací
  );
  return new Response("ok");
};

// Každých 5 minut: drží funkci i DB spojení teplé (latence ukládání v terénu)
// a zároveň brání Supabase free-tier pauze. ~8 640 volání/měs. z limitu 125k.
export const config = { schedule: "*/5 * * * *" };
