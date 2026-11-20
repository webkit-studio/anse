// Vyčistí limit pokusů přihlášení v lokální testovací DB (jen localhost!).
// Limit je per IP a e2e běží z jedné — každá změna kódu se do něj počítá
// (S05 #7), takže by se testy navzájem zablokovaly.
import postgres from "postgres";

export async function vycistitPokusy(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // .env nemusí existovat (CI)
  }
  const url = process.env.DATABASE_URL;
  if (!url || (!url.includes("localhost") && !url.includes("127.0.0.1"))) {
    throw new Error("E2E smí čistit pokusy jen v lokální DB.");
  }
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql`delete from login_attempts`;
  } finally {
    await sql.end();
  }
}
