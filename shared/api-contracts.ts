import { z } from "zod";
import { ORDER_STATUSES } from "./types";

// Zod kontrakty request bodies — parsují se na serveru (nikdy nevěříme
// klientovi) a typují API klienta.

const trimmed = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string());

const optionalText = trimmed.optional().default("");

/** YYYY-MM-DD nebo prázdno (→ null). */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const loginBody = z.object({
  code: z.string().regex(/^\d{6}$/, "Kód má 6 číslic."),
});

export const clientFields = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplňte jméno nebo firmu.")),
  contact_person: optionalText,
  address: optionalText,
  delivery_address: optionalText,
  phone: optionalText,
  email: optionalText,
  ico: optionalText,
  dic: optionalText,
  note: optionalText,
});

export const clientUpdateBody = clientFields.extend({
  expected_updated_at: z.string().min(1),
});

export const orderCreateBody = z.object({
  client: z.union([
    z.object({ id: z.string().uuid() }),
    z.object({ new: clientFields }),
  ]),
  installation_address: optionalText,
  montage_number: optionalText,
  order_number: optionalText,
  delivery_date: dateString,
  note: optionalText,
});

export const orderUpdateBody = z.object({
  installation_address: trimmed.optional(),
  montage_number: trimmed.optional(),
  order_number: trimmed.optional(),
  measured_at: dateString,
  delivery_date: dateString,
  note: trimmed.optional(),
  /** Jen admin. */
  invoice_number: trimmed.optional(),
  expected_updated_at: z.string().min(1),
});

export const statusBody = z.object({
  to: z.enum(ORDER_STATUSES as [string, ...string[]]),
  expected: z.enum(ORDER_STATUSES as [string, ...string[]]),
});

const paramsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const itemCreateBody = z.object({
  order_id: z.string().uuid(),
  product_type_id: z.string().uuid(),
  room: z.union([
    z.object({ id: z.string().uuid() }),
    z.object({ name: trimmed.pipe(z.string().min(1, "Vyplňte název místnosti.")) }),
  ]),
  params: paramsSchema,
  note: optionalText,
});

export const itemUpdateBody = z.object({
  params: paramsSchema,
  note: optionalText,
  expected_updated_at: z.string().min(1),
});

export const roomUpdateBody = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplňte název místnosti.")).optional(),
  note: trimmed.optional(),
});

export const userCreateBody = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplňte jméno.")),
  role: z.enum(["technik", "admin"]),
});

export const userUpdateBody = z.object({
  name: trimmed.pipe(z.string().min(1)).optional(),
  role: z.enum(["technik", "admin"]).optional(),
  active: z.boolean().optional(),
  /** Ruční změna přihlašovacího kódu (jen admin routa). */
  code: z.string().regex(/^\d{6}$/, "Kód musí mít přesně 6 číslic.").optional(),
});

export const settingsBody = z.object({
  admin_group_email: trimmed,
});

export type LoginBody = z.infer<typeof loginBody>;
export type ClientFields = z.infer<typeof clientFields>;
export type OrderCreateBody = z.infer<typeof orderCreateBody>;
export type OrderUpdateBody = z.infer<typeof orderUpdateBody>;
export type ItemCreateBody = z.infer<typeof itemCreateBody>;
export type ItemUpdateBody = z.infer<typeof itemUpdateBody>;
