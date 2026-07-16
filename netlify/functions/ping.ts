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

export const config = { schedule: "0 5 * * *" };
