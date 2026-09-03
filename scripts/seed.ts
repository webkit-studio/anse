// Seed: výchozí uživatelé, katalog produktů (produkt → podkategorie) a
// verzované definice formulářů. Idempotentní — bezpečné spouštět opakovaně:
//  - uživatelé se zakládají jen pokud jméno v DB chybí (kódy náhodné)
//  - definice se porovnají s aktuální verzí; změna ⇒ nová verze (staré se nemění)
import { randomInt } from "node:crypto";
import postgres from "postgres";
import { CODE_REGEX, isTrivialCode } from "../shared/codes";
import { sslFor } from "../server/db";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { DODAVATELE } from "../shared/dodavatele";
import {
  loadAll,
  type JwCatalog,
  type NevaCatalog,
  type SuysCatalog,
} from "../shared/konfigurator";
import { loadEnv, requireEnv } from "./lib/env";
import { loadAndValidate } from "./validate-definitions";

loadEnv();
const url = process.env.DIRECT_DATABASE_URL ?? requireEnv("DATABASE_URL");
const sql = postgres(url, { prepare: false, max: 1, ssl: sslFor(url) });

const DEFAULT_USERS = [
  { name: "Marek Konderla", role: "kancelar" },
  { name: "Darina Konderlová", role: "kancelar" },
  { name: "Jakub Svoboda", role: "technik" },
  { name: "Lukáš Svoboda", role: "kancelar" }, // testovací přístup dodavatele
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
  // přihlásí se a kódy ostatních zobrazí/změní ve Správě účtů.
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
          ? `Založen uživatel ${u.name} — SEED_ADMIN_CODE už je obsazený, kód zobrazíte ve Správě účtů.`
          : `Založen uživatel ${u.name} — kód dle SEED_ADMIN_CODE (nevypisuji).`,
      );
      continue;
    }

    const code = await generateUniqueCode();
    await sql`insert into users (name, code, role) values (${u.name}, ${code}, ${u.role})`;
    if (bootstrapValid) {
      // kódy nejdou do logu — kancelář je uvidí v aplikaci
      console.log(`Založen uživatel ${u.name} (${u.role}) — kód zobrazíte ve Správě účtů.`);
    } else {
      // fallback bootstrap: jednorázový výpis (jinak by se nešlo přihlásit)
      console.log(`Založen uživatel ${u.name} (${u.role}) — přihlašovací kód: ${code}`);
    }
  }

  if (createdAny) {
    console.log("Tip: kódy můžete kdykoli změnit v aplikaci (Nastavení → Účty).");
  }
}

/** Nová verze definice u podkategorie — jen když se JSON opravdu liší. */
async function upsertDefinition(
  productTypeId: string,
  subcategoryId: string,
  code: string,
  definition: unknown,
) {
  const [row] = await sql`
    select fd.definition as current_definition
    from subcategories s
    left join form_definitions fd on fd.id = s.current_definition_id
    where s.id = ${subcategoryId}
  `;
  if (row?.current_definition && stableStringify(row.current_definition) === stableStringify(definition)) {
    return;
  }

  await sql.begin(async (tx) => {
    const [versionRow] = await tx`
      select coalesce(max(version), 0) + 1 as next_version
      from form_definitions where subcategory_id = ${subcategoryId}
    `;
    const nextVersion = versionRow!.next_version as number;
    const [fd] = await tx`
      insert into form_definitions (product_type_id, subcategory_id, version, definition)
      values (${productTypeId}, ${subcategoryId}, ${nextVersion}, ${tx.json(definition as never)})
      returning id, version
    `;
    await tx`update subcategories set current_definition_id = ${fd!.id} where id = ${subcategoryId}`;
    console.log(`Definice ${code}: nová verze ${fd!.version}.`);
  });
}

async function seedCatalog() {
  const { types, definitions } = await loadAndValidate();

  // Úklid opuštěných placeholderů (přejmenování kódu): smaže se jen produkt,
  // který už v katalogu není, nemá položky ani definice — nic ostrého nezmizí.
  const keptCodes = types.map((t) => t.code);
  const removed = await sql`
    delete from product_types pt
    where pt.code <> all(${keptCodes})
      and not exists (select 1 from items i where i.product_type_id = pt.id)
      and not exists (select 1 from form_definitions fd where fd.product_type_id = pt.id)
    returning pt.code
  `;
  for (const r of removed) console.log(`Odstraněn opuštěný produkt: ${r.code}`);

  for (const t of types) {
    const [pt] = await sql`
      insert into product_types (code, name, active, sort)
      values (${t.code}, ${t.name}, ${t.active}, ${t.sort})
      on conflict (code) do update
        set name = excluded.name,
            active = excluded.active,
            sort = excluded.sort
      returning id
    `;
    if (!pt) throw new Error(`Produkt ${t.code} po upsertu nenalezen.`);

    for (const s of t.subcategories) {
      const [sub] = await sql`
        insert into subcategories (product_type_id, code, name, manufacturer, active, sort)
        values (${pt.id}, ${s.code}, ${s.name}, ${s.manufacturer}, ${s.active}, ${s.sort})
        on conflict (product_type_id, code) do update
          set name = excluded.name,
              manufacturer = excluded.manufacturer,
              active = excluded.active,
              sort = excluded.sort
        returning id
      `;
      if (!sub) throw new Error(`Podkategorie ${s.code} po upsertu nenalezena.`);

      const definition = definitions.get(s.code);
      if (definition) await upsertDefinition(pt.id as string, sub.id as string, s.code, definition);
    }
  }
}

/**
 * Naměřené produkty dodavatelů (podklady/data/*) → podkategorie s `konfig_key`.
 * Zakládají se NEAKTIVNÍ — kancelář zapíná v Nastavení → Produkty, co se má
 * technikům nabízet. Aktivitu už existujících řádků seed nikdy nepřepisuje.
 */
async function seedKonfigurator() {
  const rootDir = fileURLToPath(new URL("..", import.meta.url));
  const read = async (p: string) => JSON.parse(await readFile(path.join(rootDir, p), "utf8"));

  const mapa = (await read("db/seeds/konfigurator-mapa.json")) as {
    noveTypy: { code: string; name: string; sort: number }[];
    skupiny: Record<string, string>;
    vyjimky: Record<string, string>;
  };
  const jw = (await read("podklady/data/jack-west/produkty-davka-2.json")) as JwCatalog;
  const suys = (await read("podklady/data/suys/produkty.json")) as SuysCatalog;
  const neva = (await read("podklady/data/neva/produkty.json")) as NevaCatalog;
  const products = loadAll(jw, suys, neva);

  for (const t of mapa.noveTypy) {
    await sql`
      insert into product_types (code, name, active, sort)
      values (${t.code}, ${t.name}, false, ${t.sort})
      on conflict (code) do update set name = excluded.name, sort = excluded.sort
    `;
  }

  const typeIds = new Map<string, string>();
  for (const row of await sql`select id, code from product_types`) {
    typeIds.set(row.code as string, row.id as string);
  }

  let created = 0;
  for (const [key, p] of products) {
    const typeCode = mapa.vyjimky[p.kod] ?? mapa.skupiny[p.skupina];
    if (!typeCode) throw new Error(`Konfigurátor: skupina ${p.skupina} (${p.kod}) nemá mapování.`);
    const typeId = typeIds.get(typeCode);
    if (!typeId) throw new Error(`Konfigurátor: typ ${typeCode} pro ${p.kod} v DB není.`);

    // Název i značka dodavatele jdou ze sdílené mapy — dřív to byl ternární
    // výraz, který uměl jen dva dodavatele a ukládal SUYS s překlepem „susy".
    const name = `${DODAVATELE[p.dodavatel].nazev} · ${p.nazev}`;
    const [row] = await sql`
      insert into subcategories (product_type_id, code, name, manufacturer, active, sort, konfig_key)
      values (${typeId}, ${p.kod}, ${name}, ${p.dodavatel}, false, 100, ${key})
      on conflict (product_type_id, code) do update
        set name = excluded.name, manufacturer = excluded.manufacturer,
            konfig_key = excluded.konfig_key
      returning (xmax = 0) as inserted
    `;
    if (row?.inserted) created += 1;
  }
  if (created > 0) console.log(`Konfigurátor: založeno ${created} podkategorií (neaktivní).`);
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
  await seedCatalog();
  await seedKonfigurator();
  await seedSettings();
  console.log("Seed hotový.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
