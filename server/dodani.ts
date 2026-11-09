// Termíny dodání po dodavatelích — práce s DB. Pravidla (odvození dodavatelů,
// nejpozdější termín, co chybí) drží čistý modul shared/dodani.ts.
//
// Invariant: orders.term_dodani = nejpozdější termín mezi dodavateli, kteří
// v zakázce opravdu jsou (podle položek). Drží ho syncTermDodani() po každé
// změně termínu i po přidání/smazání položky.

import type postgres from "postgres";
import { dodaniRows, type DodaniRow } from "../shared/dodani";

type Db = postgres.Sql | postgres.TransactionSql;

/** Výrobci položek zakázky (jeden řádek na položku, "" = bez výrobce). */
export async function polozkyDodavatelu(db: Db, orderId: string) {
  return db<{ subcategory_manufacturer: string }[]>`
    select coalesce(s.manufacturer, '') as subcategory_manufacturer
    from items i
    left join subcategories s on s.id = i.subcategory_id
    where i.order_id = ${orderId}
  `;
}

/** Uložené termíny zakázky. */
export async function ulozeneDodani(db: Db, orderId: string) {
  return db<{ dodavatel: string; term: string }[]>`
    select dodavatel, to_char(term, 'YYYY-MM-DD') as term
    from order_dodani where order_id = ${orderId}
  `;
}

/** Řádky termínů pro UI a blokace (položky už načtené volajícím). */
export async function dodaniProPolozky(
  db: Db,
  orderId: string,
  items: { subcategory_manufacturer?: string | null }[],
): Promise<DodaniRow[]> {
  const stored = await ulozeneDodani(db, orderId);
  return dodaniRows(
    items.map((i) => ({ subcategory_manufacturer: i.subcategory_manufacturer || "" })),
    stored,
  );
}

/**
 * Přepočítá orders.term_dodani na nejpozdější termín dodavatelů, kteří
 * v zakázce jsou. Zapisuje jen při změně — zbytečný zápis by posunul
 * updated_at a kolegovi v kanceláři by hodil 409.
 */
export async function syncTermDodani(db: Db, orderId: string): Promise<void> {
  await db`
    update orders o set term_dodani = x.m
    from (
      select max(d.term) as m
      from order_dodani d
      where d.order_id = ${orderId}
        and d.dodavatel in (
          select coalesce(s.manufacturer, '')
          from items i left join subcategories s on s.id = i.subcategory_id
          where i.order_id = ${orderId}
        )
    ) x
    where o.id = ${orderId} and o.term_dodani is distinct from x.m
  `;
}

/**
 * Jedno datum pro všechny dodavatele zakázky — kompatibilita pro záložky
 * se starým kódem, které posílají `term_dodani` přes PATCH zakázky.
 */
export async function nastavVsemDodavatelum(
  db: Db,
  orderId: string,
  term: string | null,
): Promise<void> {
  if (term === null) {
    await db`delete from order_dodani where order_id = ${orderId}`;
    return;
  }
  await db`
    insert into order_dodani (order_id, dodavatel, term)
    select distinct ${orderId}::uuid, coalesce(s.manufacturer, ''), ${term}::date
    from items i left join subcategories s on s.id = i.subcategory_id
    where i.order_id = ${orderId}
    on conflict (order_id, dodavatel) do update set term = excluded.term, updated_at = now()
  `;
}
