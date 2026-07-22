import { z } from "zod";

// Schéma data-driven definice produktového formuláře.
// Definice žijí v db/seeds/definitions/*.json a v DB (form_definitions.definition).
// Nový produkt nebo úprava pole = úprava JSON + seed (nová verze), žádný kód.

export const condSchema = z
  .object({
    field: z.string().min(1),
    op: z.enum(["eq", "neq", "in"]),
    value: z.string().optional(),
    values: z.array(z.string()).nonempty().optional(),
  })
  .strict()
  .refine((c) => (c.op === "in" ? c.values !== undefined : c.value !== undefined), {
    message: "Podmínka: op eq/neq vyžaduje `value`, op in vyžaduje `values`.",
  });

export type Cond = z.infer<typeof condSchema>;

/** Jedna podmínka nebo pole podmínek (pole = AND). */
export const condsSchema = z.union([condSchema, z.array(condSchema).nonempty()]);
export type Conds = z.infer<typeof condsSchema>;

export const optionSchema = z
  .object({
    /** Hodnota uložená v params — kód/label výrobce (jde do exportu). */
    value: z.string().min(1),
    /** Text zobrazený ve formuláři (česky, vč. případného „-př." sufixu). */
    label: z.string().min(1),
    /** Náhled barvy ve výběru (hex) — pro jednobarevné odstíny. */
    swatch: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    /** Náhled barvy jako obrázek (cesta ve /public) — pro reálné textury (lamely). */
    swatchImage: z.string().optional(),
  })
  .strict();

export const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/, "Klíč pole: jen [a-z0-9_]"),
    label: z.string().min(1),
    type: z.enum(["number", "select", "text", "textarea"]),
    /** Jednotka za polem (mm, m², ks…). */
    unit: z.string().optional(),
    /**
     * Povinné pole. V kombinaci s visibleIf platí „povinné, jen když viditelné".
     * U polí s tbd=true se povinnost nevynucuje (podklady ještě nejsou).
     */
    required: z.boolean().optional(),
    default: z.union([z.string(), z.number()]).optional(),
    options: z.array(optionSchema).optional(),
    /** Tvrdé limity — blokující chyba. null/nevyplněno = bez kontroly. */
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    /** Měkké limity — nezablokující varování „zkontrolujte hodnotu". */
    warnMin: z.number().nullable().optional(),
    warnMax: z.number().nullable().optional(),
    /** Krok čísla; 1 (default) ⇒ inputmode numeric, jinak decimal. */
    step: z.number().positive().optional(),
    visibleIf: condsSchema.optional(),
    /** Podmíněná povinnost nad rámec `required` (vzácné). */
    requiredIf: condsSchema.optional(),
    /** Zobrazit hodnotu na kartě položky v seznamu. */
    summary: z.boolean().optional(),
    /**
     * Podklady k poli zatím chybí (možnosti/limity). Pole se vykreslí
     * neaktivní s popiskem „doplní se" a nevaliduje se.
     */
    tbd: z.boolean().optional(),
    help: z.string().optional(),
    placeholder: z.string().optional(),
  })
  .strict();

export type Field = z.infer<typeof fieldSchema>;

export const groupSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_]+$/),
    label: z.string().min(1),
    fields: z.array(fieldSchema).nonempty(),
  })
  .strict();

export type Group = z.infer<typeof groupSchema>;

const ruleLevel = z.enum(["info", "warning", "error"]);

/** Minimální (účtovaná) plocha š×v — hlásí se při menší ploše. */
const minAreaRule = z
  .object({
    type: z.literal("minArea"),
    widthField: z.string(),
    heightField: z.string(),
    m2: z.number().positive(),
    if: condsSchema.optional(),
    level: ruleLevel.default("info"),
    message: z.string().min(1),
  })
  .strict();

/** Vynucení vestavěné poznámky položky (items.note) při splnění podmínky. */
const requireNoteRule = z
  .object({
    type: z.literal("requireNote"),
    if: condsSchema.optional(),
    level: ruleLevel.default("error"),
    message: z.string().min(1),
  })
  .strict();

export const ruleSchema = z.discriminatedUnion("type", [minAreaRule, requireNoteRule]);
export type Rule = z.infer<typeof ruleSchema>;

/**
 * Mapování params → sloupce montážního listu / exportu.
 * stínění = product_types.name, kusů = počet položek, poznámky = items.note.
 * null = sloupec pro tento typ produktu nemá zdroj (zůstane prázdný).
 */
export const printMapSchema = z
  .object({
    sirka: z.string().nullable(),
    vyska: z.string().nullable(),
    barva: z.string().nullable(),
    strana: z.string().nullable(),
    ovladani: z.string().nullable(),
  })
  .strict();

export type PrintMap = z.infer<typeof printMapSchema>;

export const formDefinitionSchema = z
  .object({
    groups: z.array(groupSchema).nonempty(),
    rules: z.array(ruleSchema).default([]),
    printMap: printMapSchema,
  })
  .strict()
  .superRefine((def, ctx) => {
    const fields = def.groups.flatMap((g) => g.fields);
    const keys = new Set<string>();

    for (const f of fields) {
      if (keys.has(f.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicitní klíč pole „${f.key}".` });
      }
      keys.add(f.key);

      if (f.type === "select") {
        if (!f.tbd && (!f.options || f.options.length === 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Pole „${f.key}": select bez options je povolen jen s tbd=true.`,
          });
        }
        const values = new Set(f.options?.map((o) => o.value));
        if (values.size !== (f.options?.length ?? 0)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Pole „${f.key}": duplicitní option value.` });
        }
        if (f.default !== undefined && f.options && !values.has(String(f.default))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Pole „${f.key}": default „${f.default}" není mezi options.`,
          });
        }
      } else if (f.options) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Pole „${f.key}": options patří jen k typu select.` });
      }

      if (f.type !== "number") {
        for (const k of ["min", "max", "warnMin", "warnMax"] as const) {
          if (f[k] != null) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Pole „${f.key}": ${k} patří jen k typu number.` });
          }
        }
      }
    }

    const checkConds = (conds: Conds | undefined, where: string) => {
      if (!conds) return;
      for (const c of Array.isArray(conds) ? conds : [conds]) {
        if (!keys.has(c.field)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${where}: podmínka odkazuje na neexistující pole „${c.field}".`,
          });
        }
      }
    };

    for (const f of fields) {
      checkConds(f.visibleIf, `Pole „${f.key}" visibleIf`);
      checkConds(f.requiredIf, `Pole „${f.key}" requiredIf`);
    }
    def.rules.forEach((r, i) => {
      checkConds(r.if, `Pravidlo #${i + 1} (${r.type})`);
      if (r.type === "minArea") {
        for (const fk of [r.widthField, r.heightField]) {
          if (!keys.has(fk)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Pravidlo minArea odkazuje na neexistující pole „${fk}".`,
            });
          }
        }
      }
    });

    for (const [col, fk] of Object.entries(def.printMap)) {
      if (fk !== null && !keys.has(fk)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `printMap.${col} odkazuje na neexistující pole „${fk}".`,
        });
      }
    }
  });

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/** Hodnoty vyplněného formuláře: klíč pole → hodnota. Čísla jako number, zbytek string. */
export type ParamValue = string | number;
export type Params = Record<string, ParamValue>;
