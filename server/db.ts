import postgres from "postgres";

// Jediné DB připojení aplikace. Supabase transaction pooler (port 6543) neumí
// prepared statements → prepare: false. Lambda instance drží 1 spojení.
let client: postgres.Sql | undefined;

/**
 * updated_at jako ISO text s mikrosekundami. JS Date má jen ms — kdyby se
 * timestamp točil přes Date, optimistický zámek (rovnost updated_at) by nikdy
 * neseděl. Vždy SELECTovat přes tento fragment a porovnávat ::timestamptz.
 */
export function updatedAtUs(alias: string): string {
  return `to_char(${alias}.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at`;
}

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
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: sslFor(url),
    });
  }
  return client;
}
