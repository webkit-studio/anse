import { z } from "zod";
import { ORDER_PHASES, NOTIF_EVENTS } from "./types";

// Zod kontrakty request bodies — parsují se na serveru (nikdy nevěříme
// klientovi) a typují API klienta.

const trimmed = z.string().transform((s) => s.trim()).pipe(z.string());
const optionalText = trimmed.optional().default("");

/** YYYY-MM-DD nebo prázdno (→ null). */
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/** HH:MM nebo prázdno (→ null). */
const timeString = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Neplatný čas.")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const loginBody = z.object({
  code: z.string().regex(/^\d{6}$/, "Kód má 6 číslic."),
});

// === kontakty ==============================================================

/** Jméno NEBO telefon — musí se stihnout během telefonátu. */
export const contactCreateBody = z
  .object({
    name: optionalText,
    phone: optionalText,
    place: optionalText,
  })
  .refine((c) => c.name !== "" || c.phone !== "", {
    message: "Vyplň jméno nebo telefon.",
    path: ["name"],
  });

export const contactUpdateBody = z.object({
  name: trimmed.optional(),
  phone: trimmed.optional(),
  place: trimmed.optional(),
  fresh: z.boolean().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export const contactNoteBody = z.object({
  text: trimmed.pipe(z.string().min(1, "Napiš poznámku.")),
});

export const contactCancelBody = z.object({
  reason: trimmed.pipe(z.string().min(1, "Napiš důvod zrušení.")),
});

// === zakázky ===============================================================

/** Zakázka vzniká vždy z kontaktu zadáním termínu zaměření. */
export const orderCreateBody = z.object({
  contact_id: z.string().uuid(),
  measured_at: dateString,
  measured_time: timeString,
  assignee_id: z.string().uuid().nullable().optional(),
});

export const orderUpdateBody = z.object({
  // údaje zákazníka (blokující krok technika)
  customer_name: trimmed.optional(),
  customer_phone: trimmed.optional(),
  customer_email: trimmed.optional(),
  addr_montaz: trimmed.optional(),
  addr_fakt: trimmed.optional(),
  ico: trimmed.optional(),
  dic: trimmed.optional(),
  note: trimmed.optional(),
  measured_at: dateString,
  measured_time: timeString,
  addr_fakt_same: z.boolean().optional(),

  /** Cena práce technika — smí měnit technik i kancelář. */
  price_montage: trimmed.optional(),
  term_montaz: dateString,

  /** Jen kancelář. */
  price_customer: trimmed.optional(),
  term_dodani: dateString,
  invoice_no: trimmed.optional(),
  order_no: trimmed.optional(),
  assignee_id: z.string().uuid().nullable().optional(),

  expected_updated_at: z.string().min(1),
});

export const phaseBody = z.object({
  to: z.enum(ORDER_PHASES as [string, ...string[]]),
  expected: z.enum(ORDER_PHASES as [string, ...string[]]),
  /** Povinné jen při přechodu na `zruseno`. */
  reason: optionalText,
});

// === položky ===============================================================

const paramsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const roomRef = z.union([
  z.object({ id: z.string().uuid() }),
  z.object({ name: trimmed.pipe(z.string().min(1, "Vyplň název místnosti.")) }),
]);

export const itemCreateBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("config"),
    order_id: z.string().uuid(),
    room: roomRef,
    product_type_id: z.string().uuid(),
    subcategory_id: z.string().uuid(),
    params: paramsSchema,
    note: optionalText,
  }),
  z.object({
    kind: z.literal("oprava"),
    order_id: z.string().uuid(),
    room: roomRef,
    product_type_id: z.string().uuid(),
    /** U opravy je popis závady povinný (foto se posílá zvlášť). */
    defect_note: trimmed.pipe(z.string().min(1, "Popiš závadu.")),
    note: optionalText,
  }),
]);

export const itemUpdateBody = z.object({
  params: paramsSchema.optional(),
  note: optionalText,
  defect_note: trimmed.optional(),
  room_id: z.string().uuid().optional(),
  expected_updated_at: z.string().min(1),
});

export const roomCreateBody = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplň název místnosti.")),
});

export const roomUpdateBody = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplň název místnosti.")),
});

// === fotky a podpis ========================================================

const dataUrlImage = z
  .string()
  .max(1_400_000, "Fotka je příliš velká.")
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Neplatný formát obrázku.");

export const photoCreateBody = z.object({
  order_id: z.string().uuid(),
  item_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["zamereni", "zavada", "realizace"]),
  data: dataUrlImage,
});

export const signatureBody = z.object({
  data: z
    .string()
    .max(700_000, "Podpis je příliš velký. Zkus ho nakreslit znovu.")
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/, "Neplatný formát podpisu."),
  signer_name: optionalText,
});

// === uživatelé a nastavení =================================================

export const userCreateBody = z.object({
  name: trimmed.pipe(z.string().min(1, "Vyplň jméno.")),
  role: z.enum(["technik", "kancelar"]),
  phone: optionalText,
  email: optionalText,
});

export const userUpdateBody = z.object({
  name: trimmed.pipe(z.string().min(1)).optional(),
  role: z.enum(["technik", "kancelar"]).optional(),
  phone: trimmed.optional(),
  email: trimmed.optional(),
  active: z.boolean().optional(),
  code: z.string().regex(/^\d{6}$/, "Kód musí mít přesně 6 číslic.").optional(),
});

export const settingsBody = z.object({
  admin_group_email: trimmed,
  /** Které události jdou na společnou adresu kanceláře. Chybí = default události. */
  admin_group_events: z.record(z.string(), z.boolean()).optional(),
});

// === produkty ==============================================================

export const productTypeUpdateBody = z.object({
  custom_name: trimmed.optional(),
  note_for_tech: trimmed.optional(),
  active: z.boolean().optional(),
});

export const subcategoryUpdateBody = z.object({
  custom_name: trimmed.optional(),
  note: trimmed.optional(),
  active: z.boolean().optional(),
});

// === notifikace ============================================================

const notifEventEnum = z.enum(NOTIF_EVENTS.map((e) => e.event) as [string, ...string[]]);

export const notifPrefBody = z.object({
  event: notifEventEnum,
  email: z.boolean(),
});

export const notifReadBody = z.object({
  /** Prázdné = označit všechny přečtené. */
  ids: z.array(z.number()).optional(),
});

export type ContactCreateBody = z.infer<typeof contactCreateBody>;
export type OrderUpdateBody = z.infer<typeof orderUpdateBody>;
export type ItemCreateBody = z.infer<typeof itemCreateBody>;
