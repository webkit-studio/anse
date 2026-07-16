import postgres from "postgres";

// Jediné DB připojení aplikace. Supabase transaction pooler (port 6543) neumí
// prepared statements → prepare: false. Lambda instance drží 1 spojení.
let client: postgres.Sql | undefined;

export function sql(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL není nastavena");
    client = postgres(url, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}
