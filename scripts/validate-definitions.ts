// Zod kontrola JSON definic formulářů + katalogu produktů (2 úrovně:
// produkt → podkategorie). Spouští se samostatně (CI) a před každým seedem.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { formDefinitionSchema } from "../shared/form-schema";

const seedsDir = fileURLToPath(new URL("../db/seeds", import.meta.url));

export const subcategorySeedSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    manufacturer: z.enum(["jackwest", "neva", "susy"]),
    active: z.boolean(),
    sort: z.number().int(),
    definitionFile: z.string().optional(),
  })
  .strict()
  .refine((s) => !s.active || s.definitionFile, {
    message: "Aktivní podkategorie musí mít definitionFile.",
  });

export const productTypeSeedSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    active: z.boolean(),
    sort: z.number().int(),
    subcategories: z.array(subcategorySeedSchema),
  })
  .strict()
  .refine((t) => !t.active || t.subcategories.some((s) => s.active), {
    message: "Aktivní produkt musí mít aspoň jednu aktivní podkategorii.",
  });

export type ProductTypeSeed = z.infer<typeof productTypeSeedSchema>;

export async function loadAndValidate() {
  const typesRaw = JSON.parse(await readFile(path.join(seedsDir, "product-types.json"), "utf8"));
  const types = z.array(productTypeSeedSchema).min(1).parse(typesRaw);

  const codes = new Set<string>();
  const subCodes = new Set<string>();
  for (const t of types) {
    if (codes.has(t.code)) throw new Error(`Duplicitní kód produktu: ${t.code}`);
    codes.add(t.code);
    for (const s of t.subcategories) {
      // kód podkategorie musí být unikátní globálně — je to klíč definice
      if (subCodes.has(s.code)) throw new Error(`Duplicitní kód podkategorie: ${s.code}`);
      subCodes.add(s.code);
    }
  }

  // klíč = kód podkategorie
  const definitions = new Map<string, unknown>();
  for (const t of types) {
    for (const s of t.subcategories) {
      if (!s.definitionFile) continue;
      const defRaw = JSON.parse(await readFile(path.join(seedsDir, s.definitionFile), "utf8"));
      const parsed = formDefinitionSchema.safeParse(defRaw);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("\n");
        throw new Error(`Definice ${s.definitionFile} neprošla validací:\n${issues}`);
      }
      definitions.set(s.code, parsed.data);
    }
  }

  return { types, definitions };
}

// Spuštěno přímo (ne importem ze seedu) → vypiš výsledek.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  loadAndValidate()
    .then(({ types, definitions }) => {
      const subs = types.reduce((n, t) => n + t.subcategories.length, 0);
      console.log(
        `OK: ${types.length} produktů, ${subs} podkategorií, ${definitions.size} definic prošlo validací.`,
      );
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
