// Zod kontrola všech JSON definic formulářů + seznamu typů produktů.
// Spouští se samostatně (CI) a před každým seedem.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { formDefinitionSchema } from "../shared/form-schema";

const seedsDir = fileURLToPath(new URL("../db/seeds", import.meta.url));

export const productTypeSeedSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    manufacturer: z.enum(["jackwest", "neva", "susy"]),
    active: z.boolean(),
    sort: z.number().int(),
    definitionFile: z.string().optional(),
  })
  .strict()
  .refine((t) => !t.active || t.definitionFile, {
    message: "Aktivní typ produktu musí mít definitionFile.",
  });

export async function loadAndValidate() {
  const typesRaw = JSON.parse(await readFile(path.join(seedsDir, "product-types.json"), "utf8"));
  const types = z.array(productTypeSeedSchema).min(1).parse(typesRaw);

  const codes = new Set<string>();
  for (const t of types) {
    if (codes.has(t.code)) throw new Error(`Duplicitní kód typu produktu: ${t.code}`);
    codes.add(t.code);
  }

  const definitions = new Map<string, unknown>();
  for (const t of types) {
    if (!t.definitionFile) continue;
    const defRaw = JSON.parse(await readFile(path.join(seedsDir, t.definitionFile), "utf8"));
    const parsed = formDefinitionSchema.safeParse(defRaw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(`Definice ${t.definitionFile} neprošla validací:\n${issues}`);
    }
    definitions.set(t.code, parsed.data);
  }

  return { types, definitions };
}

// Spuštěno přímo (ne importem ze seedu) → vypiš výsledek.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  loadAndValidate()
    .then(({ types, definitions }) => {
      console.log(`OK: ${types.length} typů produktů, ${definitions.size} definic prošlo validací.`);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
