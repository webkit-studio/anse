// Termíny dodání po dodavatelích — práce s DB. Pravidla (odvození dodavatelů,
// nejpozdější termín, co chybí) drží čistý modul shared/dodani.ts.
//
// Invariant: orders.term_dodani = nejpozdější termín mezi dodavateli, kteří
// v zakázce opravdu jsou (podle položek). Drží ho syncTermDodani() po každé
// změně termínu i po přidání/smazání položky.

import type postgres from "postgres";
import { dodaniRows, type DodaniRow } from "../shared/dodani";
import { sql } from "./db";

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
  /** Souhrnné orders.term_dodani — pojistka pro termín zadaný starým kódem. */
  termDodani?: string | null,
): Promise<DodaniRow[]> {
  const stored = await ulozeneDodani(db, orderId);
  const polozky = items.map((i) => ({ subcategory_manufacturer: i.subcategory_manufacturer || "" }));
  // Termín zadaný záložkou se starým kódem během nasazení má jen souhrnné
  // pole, žádné řádky — platí pak pro všechny dodavatele, ať zakázka
  // nevypadá jako „chybí termín".
  if (stored.length === 0 && termDodani) {
    return dodaniRows(polozky, []).map((r) => ({ ...r, term: termDodani }));
  }
  return dodaniRows(polozky, stored);
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
    where o.id = ${orderId} and x.m is not null and o.term_dodani is distinct from x.m
  `;
  // x.m is null (žádný řádek) = nech souhrnné pole být: mohl ho zadat starý
  // kód bez řádků a smazat ho by znamenalo ztratit termín.
}

/**
 * Přepočet po změně položek: zamkne řádek zakázky, ať se nepotká se
 * souběžným zadáním termínu (max() by jinak počítal ze starého snímku).
 */
export async function syncTermDodaniZamcene(orderId: string): Promise<void> {
  await sql().begin(async (tx) => {
    await tx`select 1 from orders where id = ${orderId} for update`;
    await syncTermDodani(tx, orderId);
  });
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
