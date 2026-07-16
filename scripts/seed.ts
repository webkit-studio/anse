// Seed: výchozí uživatelé, typy produktů a verzované definice formulářů.
// Idempotentní — bezpečné spouštět opakovaně:
//  - uživatelé se zakládají jen pokud jméno v DB chybí (kódy náhodné, vypíšou se JEDNOU)
//  - definice se porovnají s aktuální verzí; změna ⇒ nová verze (staré se nemění)
import { randomInt } from "node:crypto";
import postgres from "postgres";
import { CODE_REGEX, isTrivialCode } from "../shared/codes";
import { sslFor } from "../server/db";
import { loadEnv, requireEnv } from "./lib/env";
import { loadAndValidate } from "./validate-definitions";

loadEnv();
const url = process.env.DIRECT_DATABASE_URL ?? requireEnv("DATABASE_URL");
const sql = postgres(url, { prepare: false, max: 1, ssl: sslFor(url) });

const DEFAULT_USERS = [
  { name: "Marek Konderla", role: "admin" },
  { name: "Darina Konderlová", role: "admin" },
  { name: "Jakub Svoboda", role: "technik" },
  { name: "Lukáš Svoboda", role: "admin" }, // testovací přístup dodavatele
] as const;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function generateUniqueCode(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const [existing] = await sql`select 1 from users where code = ${code}`;
    if (!existing) return code;
  }
  throw new Error("Nepodařilo se vygenerovat unikátní kód.");
}

async function seedUsers() {
  // Bootstrap bez kódů v (build) logu: SEED_ADMIN_CODE dostane Lukáš Svoboda,
  // přihlásí se a kódy ostatních zobrazí/změní v admin rozhraní.
  const bootstrap = process.env.SEED_ADMIN_CODE;
  const bootstrapValid = !!bootstrap && CODE_REGEX.test(bootstrap) && !isTrivialCode(bootstrap);
  if (bootstrap && !bootstrapValid) {
    console.warn("SEED_ADMIN_CODE není platný (6 číslic, ne triviální) — ignoruji.");
  }

  let createdAny = false;
  for (const u of DEFAULT_USERS) {
    const [existing] = await sql`select 1 from users where name = ${u.name}`;
    if (existing) continue;
    createdAny = true;

    if (u.name === "Lukáš Svoboda" && bootstrapValid) {
      const [taken] = await sql`select 1 from users where code = ${bootstrap!}`;
      const code = taken ? await generateUniqueCode() : bootstrap!;
      await sql`insert into users (name, code, role) values (${u.name}, ${code}, ${u.role})`;
      console.log(
        taken
          ? `Založen uživatel ${u.name} — SEED_ADMIN_CODE už je obsazený, kód zobrazíte v admin UI.`
          : `Založen uživatel ${u.name} — kód dle SEED_ADMIN_CODE (nevypisuji).`,
      );
      continue;
    }

    const code = await generateUniqueCode();
    await sql`insert into users (name, code, role) values (${u.name}, ${code}, ${u.role})`;
    if (bootstrapValid) {
      // kódy nejdou do logu — admin je uvidí v aplikaci
      console.log(`Založen uživatel ${u.name} (${u.role}) — kód zobrazíte v admin UI.`);
    } else {
      // fallback bootstrap: jednorázový výpis (jinak by se nešlo přihlásit)
      console.log(`Založen uživatel ${u.name} (${u.role}) — přihlašovací kód: ${code}`);
    }
  }

  if (createdAny) {
    console.log("Tip: kódy můžete kdykoli změnit v aplikaci (Správa → Uživatelé).");
  }
}

async function seedProductTypes() {
  const { types, definitions } = await loadAndValidate();

  for (const t of types) {
    await sql`
      insert into product_types (code, name, manufacturer, active, sort)
      values (${t.code}, ${t.name}, ${t.manufacturer}, ${t.active}, ${t.sort})
      on conflict (code) do update
        set name = excluded.name,
            manufacturer = excluded.manufacturer,
            active = excluded.active,
            sort = excluded.sort
    `;

    const definition = definitions.get(t.code);
    if (!definition) continue;

    const [pt] = await sql`
      select pt.id, fd.definition as current_definition
      from product_types pt
      left join form_definitions fd on fd.id = pt.current_definition_id
      where pt.code = ${t.code}
    `;
    if (!pt) throw new Error(`Typ produktu ${t.code} po upsertu nenalezen.`);

    const unchanged =
      pt.current_definition && stableStringify(pt.current_definition) === stableStringify(definition);
    if (unchanged) continue;

    await sql.begin(async (tx) => {
      const [versionRow] = await tx`
        select coalesce(max(version), 0) + 1 as next_version
        from form_definitions where product_type_id = ${pt.id}
      `;
      const next_version = versionRow!.next_version as number;
      const [fd] = await tx`
        insert into form_definitions (product_type_id, version, definition)
        values (${pt.id}, ${next_version}, ${tx.json(definition as never)})
        returning id, version
      `;
      await tx`update product_types set current_definition_id = ${fd!.id} where id = ${pt.id}`;
      console.log(`Definice ${t.code}: nová verze ${fd!.version}.`);
    });
  }
}

async function seedSettings() {
  await sql`
    insert into settings (key, value)
    values ('admin_group_email', '""'::jsonb)
    on conflict (key) do nothing
  `;
}

async function main() {
  await seedUsers();
  await seedProductTypes();
  await seedSettings();
  console.log("Seed hotový.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
