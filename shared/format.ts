// Formátování pro české UI, e-maily i PDF. Čistá logika bez IO —
// stejné výstupy na klientu i na serveru.

const MONTHS_SHORT = ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "12."];

/** ISO datum (YYYY-MM-DD) → „20. 9. 2026". Prázdné → pomlčka. */
export function czDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

/** Krátké datum bez roku pro seznamy — „20. 9." (rok jen když není letošní). */
export function czDateShort(iso: string | null | undefined, today = new Date()): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const base = `${Number(m[3])}. ${MONTHS_SHORT[Number(m[2]) - 1]}`;
  return year === today.getFullYear() ? base : `${base} ${year}`;
}

/** Datum a čas změny — „20. 9. 14:20". */
export function czDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()}. ${d.getMonth() + 1}. ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** Česká čísla: 1 položka / 2 položky / 5 položek. */
export function czPlural(n: number, one: string, few: string, many: string): string {
  const word = n === 1 ? one : n >= 2 && n <= 4 ? few : many;
  return `${n} ${word}`;
}

export function items(n: number): string {
  return czPlural(n, "položka", "položky", "položek");
}

export function days(n: number): string {
  return czPlural(n, "den", "dny", "dní");
}

/** Částka: „18 400 Kč"; prázdná hodnota → pomlčka. Nechává i ručně psané tvary. */
export function money(value: string | null | undefined, fallback = "—"): string {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits || /[a-zA-Z]/.test(raw)) return raw;
  return `${Number(digits).toLocaleString("cs-CZ").replace(/ /g, " ")} Kč`;
}

/** „před 3 dny" pro sloupec Změněno. */
export function ago(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return "právě teď";
  if (mins < 60) return `před ${czPlural(mins, "minutou", "minutami", "minutami")}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `před ${czPlural(hours, "hodinou", "hodinami", "hodinami")}`;
  const d = Math.round(hours / 24);
  return `před ${czPlural(d, "dnem", "dny", "dny")}`;
}
