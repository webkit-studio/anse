// Linkové ikony rozhraní — stejný rukopis jako ProductIcon: 24×24, tah 1,6,
// kulaté spoje, currentColor. Unicode glyfy se na Androidu i iOS kreslí pokaždé
// jinak (a ✆ leckde chybí úplně), takže navigace i lišty používají tyhle.

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export type IconName =
  | "dnes"
  | "kontakty"
  | "zakazky"
  | "zvonek"
  | "statistiky"
  | "nastaveni"
  | "prehled";

const PATHS: Record<IconName, JSX.Element> = {
  // dnes — kalendářní list s odškrtnutím
  dnes: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M8 3v3M16 3v3M3.5 9.5h17" />
      <path d="M9 14.5l2 2 4-4" />
    </>
  ),
  // kontakty — sluchátko
  kontakty: (
    <path d="M7.5 3.8c.7 0 1.3.4 1.5 1l.9 2.4c.2.6 0 1.3-.5 1.7l-1 .8a11 11 0 0 0 4.9 4.9l.8-1c.4-.5 1.1-.7 1.7-.5l2.4.9c.6.2 1 .8 1 1.5v2.6c0 .9-.8 1.7-1.7 1.6C10.6 19.9 4.1 13.4 3.6 5.5c0-.9.7-1.7 1.6-1.7z" />
  ),
  // zakázky — seznam
  zakazky: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="19" cy="18" r="1.6" />
    </>
  ),
  // zvonek
  zvonek: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.2 1.5 5.2H5s1.5-1.2 1.5-5.2Z" />
      <path d="M10.2 18.5a2 2 0 0 0 3.6 0" />
    </>
  ),
  // statistiky — sloupce
  statistiky: (
    <>
      <path d="M4 20h16" />
      <path d="M7.5 20v-6M12 20V6M16.5 20v-9" />
    </>
  ),
  // nastavení — posuvníky
  nastaveni: (
    <>
      <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
      <circle cx="16" cy="8" r="2" />
      <circle cx="10" cy="16" r="2" />
    </>
  ),
  // přehled — dlaždice
  prehled: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...STROKE}>
      {PATHS[name]}
    </svg>
  );
}
