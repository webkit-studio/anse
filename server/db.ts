import postgres from "postgres";

// Jediné DB připojení aplikace. Supabase transaction pooler (port 6543) neumí
// prepared statements → prepare: false. Lambda instance drží 1 spojení.
let client: postgres.Sql | undefined;

/** Lokální Postgres běží bez TLS; Supabase pooler TLS vyžaduje. */
export function sslFor(url: string): "require" | undefined {
  return /localhost|127\.0\.0\.1/.test(url) ? undefined : "require";
}

export function sql(): postgres.Sql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL není nastavena");
    client = postgres(url, {
      prepare: false,
      max: 1,
      idle_timeout: 240, // spolu s 5min keep-warm pingem drží spojení teplé
      connect_timeout: 10,
      ssl: sslFor(url),
    });
  }
  return client;
}
