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
  // povinné dle zadání (Marek): adresa a e-mail zákazníka
  address: trimmed.pipe(z.string().min(1, "Vyplňte adresu.")),
  delivery_address: optionalText,
  phone: optionalText,
  email: trimmed.pipe(z.string().min(1, "Vyplňte e-mail.").email("Zkontrolujte formát e-mailu.")),
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
  /** Údaje pro export montážního listu — jen admin. Částky jako volný text
   *  (na papíře se píší i s měnou), aplikace s nimi nepočítá. */
  invoice_number: trimmed.optional(),
  price_ex_vat: trimmed.optional(),
  price_vat: trimmed.optional(),
  price_montage: trimmed.optional(),
  price_total: trimmed.optional(),
  price_deposit: trimmed.optional(),
  price_balance: trimmed.optional(),
  montage_by: trimmed.optional(),
  expected_updated_at: z.string().min(1),
});

export const statusBody = z.object({
  to: z.enum(ORDER_STATUSES as [string, ...string[]]),
  expected: z.enum(ORDER_STATUSES as [string, ...string[]]),
});

/**
 * Digitální podpis zákazníka — PNG z canvas jako data-URL. Limit 700 kB
 * (podpisový tah na 2× canvasu je řádově desítky kB; limit chrání DB).
 */
export const signatureBody = z.object({
  signature_png: z
    .string()
    .max(700_000, "Podpis je příliš velký. Zkuste ho nakreslit znovu.")
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, "Neplatný formát podpisu."),
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
  /** Přesun položky do jiné místnosti téže zakázky. */
  room_id: z.string().uuid().optional(),
  expected_updated_at: z.string().min(1),
});

export const roomCreateBody = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplňte název místnosti.")),
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
