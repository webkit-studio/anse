// Aplikuje db/migrations/*.sql v abecedním pořadí; evidence v schema_migrations.
// Spouštět proti DIRECT_DATABASE_URL (session pooler) — DDL mimo transaction pooler.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { loadEnv, requireEnv } from "./lib/env";

loadEnv();
const url = process.env.DIRECT_DATABASE_URL ?? requireEnv("DATABASE_URL");
const sql = postgres(url, { prepare: false, max: 1 });

const migrationsDir = fileURLToPath(new URL("../db/migrations", import.meta.url));

async function main() {
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await sql`select name from schema_migrations`).map((r) => r.name as string),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const content = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`Aplikuji ${file}…`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
  }

  console.log("Migrace hotové.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
