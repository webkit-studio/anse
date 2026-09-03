import type { Tone } from "@shared/types";

// Linkové ikony rozhraní — stejný rukopis jako ProductIcon: 24×24, tah 1,6,
// kulaté spoje, currentColor. Unicode glyfy se na Androidu i iOS kreslí pokaždé
// jinak (a ✆ leckde chybí úplně), takže UI používá výhradně tenhle set.

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
  | "prehled"
  | "volat"
  | "tuzka"
  | "kopie"
  | "navod"
  | "oprava"
  | "foto"
  | "hvezda"
  | "hvezda-plna"
  | "oko"
  | "oko-skrt"
  | "obalka"
  | "mapa"
  | "hotovo"
  | "lupa"
  | "obnovit"
  | "kos";

const STAR_PATH =
  "M12 3.6l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z";

const PATHS: Record<IconName, JSX.Element> = {
  // fajfka — potvrzení akce (zkopírováno)
  hotovo: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  lupa: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8L21 21" />
      <path d="M11 8.5v5M8.5 11h5" />
    </>
  ),
  // obálka — napsat e-mail
  obalka: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3.8 7l7.3 5.2a1.5 1.5 0 0 0 1.8 0L20.2 7" />
    </>
  ),
  // špendlík — otevřít v mapách
  mapa: (
    <>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  // oko — zobrazit kód
  oko: (
    <>
      <path d="M3 12s3.2-5.2 9-5.2S21 12 21 12s-3.2 5.2-9 5.2S3 12 3 12z" />
      <circle cx="12" cy="12" r="2.4" />
    </>
  ),
  // přeškrtnuté oko — kód je vidět, tap ho skryje
  "oko-skrt": (
    <>
      <path d="M3 12s3.2-5.2 9-5.2S21 12 21 12s-3.2 5.2-9 5.2S3 12 3 12z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M4.5 19.5l15-15" />
    </>
  ),
  // kruhová šipka — vydat nový kód
  obnovit: (
    <>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M17.5 3.5v4h-4" />
    </>
  ),
  // dnes — kalendářní list s odškrtnutím
  dnes: (
    <>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M8 3v3M16 3v3M3.5 9.5h17" />
      <path d="M9 14.5l2 2 4-4" />
    </>
  ),
  // kontakty i volat — sluchátko
  kontakty: (
    <path d="M7.5 3.8c.7 0 1.3.4 1.5 1l.9 2.4c.2.6 0 1.3-.5 1.7l-1 .8a11 11 0 0 0 4.9 4.9l.8-1c.4-.5 1.1-.7 1.7-.5l2.4.9c.6.2 1 .8 1 1.5v2.6c0 .9-.8 1.7-1.7 1.6C10.6 19.9 4.1 13.4 3.6 5.5c0-.9.7-1.7 1.6-1.7z" />
  ),
  volat: (
    <path d="M7.5 3.8c.7 0 1.3.4 1.5 1l.9 2.4c.2.6 0 1.3-.5 1.7l-1 .8a11 11 0 0 0 4.9 4.9l.8-1c.4-.5 1.1-.7 1.7-.5l2.4.9c.6.2 1 .8 1 1.5v2.6c0 .9-.8 1.7-1.7 1.6C10.6 19.9 4.1 13.4 3.6 5.5c0-.9.7-1.7 1.6-1.7z" />
  ),
  // zakázky — seznam s tečkou
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
  // tužka — inline editace
  tuzka: (
    <>
      <path d="M14.5 5.2l4.3 4.3L8.3 20H4v-4.3z" />
      <path d="M12.6 7.1l4.3 4.3" />
    </>
  ),
  // kopie — duplikace položky
  kopie: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M5.5 15.5h-1a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4.5 3.5H14A1.5 1.5 0 0 1 15.5 5v1" />
    </>
  ),
  // návod — otevřená kniha
  navod: (
    <>
      <path d="M12 6.2C10.6 5 8.6 4.5 5.5 4.5c-.6 0-1 .4-1 1v11c0 .6.4 1 1 1 3.1 0 5.1.5 6.5 1.7 1.4-1.2 3.4-1.7 6.5-1.7.6 0 1-.4 1-1v-11c0-.6-.4-1-1-1-3.1 0-5.1.5-6.5 1.7z" />
      <path d="M12 6.2v13" />
    </>
  ),
  // oprava — obnovovací šipka (⟳)
  oprava: (
    <>
      <path d="M19 12a7 7 0 1 1-2-4.9" />
      <path d="M17.5 3.5v4h-4" />
    </>
  ),
  // foto — fotoaparát
  foto: (
    <>
      <path d="M4.5 8.5A1.5 1.5 0 0 1 6 7h2l1.4-2h5.2L16 7h2a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 17z" />
      <circle cx="12" cy="12.5" r="3.2" />
    </>
  ),
  // hvězda — „ozvat se"
  hvezda: <path d={STAR_PATH} />,
  "hvezda-plna": <path d={STAR_PATH} fill="currentColor" stroke="none" />,
  // koš
  kos: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M6.5 6.5l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
      <path d="M10 10.5v6M14 10.5v6" />
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

// --- glyfy stavů -------------------------------------------------------------
// Unicode ● ◐ ○ se na Androidu kreslí každým fontem jinak → vlastní SVG.
// Stav musí být čitelný i černobíle: glyf + slovo, barva jen zesiluje.

const TONE_SHAPES: Record<Tone, JSX.Element> = {
  // na tahu ty — plná tečka
  todo: <circle cx="8" cy="8" r="4.4" fill="currentColor" stroke="none" />,
  // probíhá — půlená tečka
  work: (
    <>
      <circle cx="8" cy="8" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill="currentColor" stroke="none" />
    </>
  ),
  // čeká se na druhé — prázdný kroužek
  wait: <circle cx="8" cy="8" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  // hotovo — fajfka
  done: (
    <path
      d="M3.5 8.5l3 3 6-6.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  // zrušeno — křížek
  dead: (
    <path
      d="M4.5 4.5l7 7M11.5 4.5l-7 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  ),
  // neutrální — kosočtverec
  idle: (
    <path
      d="M8 3.4L12.6 8 8 12.6 3.4 8z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
};

export function ToneGlyph({ tone, size = 13 }: { tone: Tone; size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {TONE_SHAPES[tone]}
    </svg>
  );
}
