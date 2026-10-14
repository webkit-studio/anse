import { sql } from "./db";
import { ApiError } from "./http";

// Přidělení víc lidem (kontakt i zakázka) — pole uuid v assignee_ids.
// Pole nemá cizí klíč, takže existenci uživatelů hlídá server při zápisu.

type Db = ReturnType<typeof sql>;

/** Jména přidělených ve stejném pořadí jako ids — `<alias>.assignee_names`. */
export function assigneeNamesCol(db: Db, alias: string) {
  return db.unsafe(`
    array(
      select u.name from unnest(${alias}.assignee_ids) with ordinality a(id, n)
      join users u on u.id = a.id order by a.n
    ) as assignee_names
  `);
}

/** Přidělit jde jen existujícímu aktivnímu uživateli. */
export async function assertAssignable(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const [row] = await db`select count(*)::int as n from users where id = any(${ids}) and active`;
  if ((row?.n ?? 0) !== ids.length) throw new ApiError(400, "Uživatel nenalezen.");
}

/** Kdo v novém přidělení přibyl — jen ti dostanou notifikaci. */
export function newlyAdded(before: string[], after: string[]): string[] {
  const prev = new Set(before);
  return after.filter((id) => !prev.has(id));
}
