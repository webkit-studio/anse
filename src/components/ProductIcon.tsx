// Linkové ikony typů produktů — jednotný styl: 24×24, tah 1.6, kulaté spoje,
// currentColor (barvu řídí kontejner). Mapuje se podle NÁZVU typu (ne kódu),
// takže nové produkty dostanou správnou ikonu i po přejmenování kódů;
// neznámý typ má obecné okno.

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

type IconKind = "mesh" | "blinds" | "pleat" | "extBlinds" | "shutter" | "screen" | "window";

function kindFor(name: string): IconKind {
  const n = normalize(name);
  if (n.includes("sit")) return "mesh";
  if (n.includes("plis")) return "pleat";
  if (n.includes("zaluzie") && n.includes("venkovni")) return "extBlinds";
  if (n.includes("zaluzie")) return "blinds";
  if (n.includes("rolet")) return "shutter";
  if (n.includes("screen")) return "screen";
  return "window";
}

const PATHS: Record<IconKind, JSX.Element> = {
  // okenní síť: rám + mřížka
  mesh: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" />
    </>
  ),
  // horizontální žaluzie: rám + lamely
  blinds: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 8.5h16M4 12h16M4 15.5h16" />
    </>
  ),
  // plissé: rám + skládaný zigzag
  pleat: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="m4 9 4 2 4-2 4 2 4-2M4 14l4 2 4-2 4 2 4-2" />
    </>
  ),
  // venkovní žaluzie: kazeta nahoře + volné lamely
  extBlinds: (
    <>
      <rect x="4" y="4" width="16" height="4" rx="1.5" />
      <path d="M5 11.5h14M5 15h14M5 18.5h14" />
    </>
  ),
  // venkovní roleta: kazeta + segmentovaný pancíř
  shutter: (
    <>
      <rect x="4" y="4" width="16" height="4" rx="1.5" />
      <rect x="6" y="10.5" width="12" height="8" rx="1.2" />
      <path d="M6 13.2h12M6 15.8h12" />
    </>
  ),
  // venkovní screen: kazeta + napnutá látka se spodní lištou
  screen: (
    <>
      <rect x="4" y="4" width="16" height="4" rx="1.5" />
      <path d="M6.5 8v7.5M17.5 8v7.5M5 18.5h14" />
    </>
  ),
  // obecné okno (fallback pro nové typy)
  window: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M12 4v16M4 12h16" />
    </>
  ),
};

export function ProductIcon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...STROKE}>
      {PATHS[kindFor(name)]}
    </svg>
  );
}
