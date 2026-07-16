// Nastaví známé přihlašovací kódy pro E2E (jen lokální testovací DB!).
import postgres from "postgres";

export default async function globalSetup() {
  try {
    process.loadEnvFile();
  } catch {
    // .env nemusí existovat (CI)
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("E2E vyžaduje DATABASE_URL (lokální Postgres).");
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("E2E smí běžet jen proti lokální DB — odmítám měnit kódy jinde.");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await sql`update users set code = '111111' where name = 'Jakub Svoboda'`;
    await sql`update users set code = '999999' where name = 'Marek Konderla'`;
  } finally {
    await sql.end();
  }
}
