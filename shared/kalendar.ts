// Zaměření a montáže ve formátu iCalendar (RFC 5545). Čistá logika bez IO —
// server z ní skládá odebíraný kalendář (feed) i jednu událost ke stažení.
//
// Časy jsou místní s TZID=Europe/Prague a přiloženým VTIMEZONE (pravidla
// CET/CEST), takže se nic nepřepočítává a letní čas řeší kalendář sám.

import { ORDER_KIND_LABELS, type OrderKind } from "./types";

export const KALENDAR_TZ = "Europe/Prague";

export type TypUdalosti = "zamereni" | "montaz";

export const TYPY_UDALOSTI: TypUdalosti[] = ["zamereni", "montaz"];

export const TYP_UDALOSTI_LABELS: Record<TypUdalosti, string> = {
  zamereni: "Zaměření",
  montaz: "Montáž",
};

/** Zaměření s časem trvá v kalendáři hodinu; bez času je celodenní. */
export const DELKA_ZAMERENI_MIN = 60;

/**
 * Co ze zakázky smí do kalendáře. Záměrně BEZ cen — typ je nemá kam nést,
 * takže se cena do feedu nedostane ani omylem (kalendář vidí i technik).
 */
export interface KalendarZakazka {
  id: string;
  kind: OrderKind;
  /** Jméno zákazníka (ze zakázky, jinak z kontaktu). */
  jmeno: string;
  telefon: string;
  /** Adresa montáže → LOCATION. */
  adresa: string;
  /** YYYY-MM-DD */
  measured_at: string | null;
  /** HH:MM; bez času je zaměření celodenní. */
  measured_time: string | null;
  /** YYYY-MM-DD, montáž je vždy celodenní. */
  term_montaz: string | null;
  /** Jména přidělených (jedou-li měřit spolu, ať každý ví s kým). */
  prideleni: string[];
  /** Poslední změna zakázky (ISO čas) → LAST-MODIFIED. */
  zmeneno: string | null;
}

export interface Udalost {
  /** Stabilní per zakázka a typ — obnova feedu události neduplikuje. */
  uid: string;
  souhrn: string;
  popis: string;
  misto: string;
  odkaz: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM, null = celodenní. */
  cas: string | null;
  delkaMinut: number;
  zmeneno: string | null;
}

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const CAS = /^([01]\d|2[0-3]):([0-5]\d)$/;

function platneDatum(iso: string | null | undefined): iso is string {
  const m = iso ? DATUM.exec(iso) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** UID události — stejné pro tutéž zakázku a typ v každém stažení. */
export function uidUdalosti(orderId: string, typ: TypUdalosti): string {
  return `${typ}-${orderId}@anse`;
}

/** Událost zakázky daného typu; null, když k ní není (platný) termín. */
export function udalostZakazky(z: KalendarZakazka, typ: TypUdalosti, origin: string): Udalost | null {
  const datum = typ === "zamereni" ? z.measured_at : z.term_montaz;
  if (!platneDatum(datum)) return null;
  const cas = typ === "zamereni" && z.measured_time && CAS.test(z.measured_time) ? z.measured_time : null;

  const jmeno = z.jmeno.trim();
  const telefon = z.telefon.trim();
  const adresa = z.adresa.trim();
  const oprava = z.kind === "oprava";
  const odkaz = `${origin.replace(/\/+$/, "")}/zakazky/${z.id}`;

  const typText = TYP_UDALOSTI_LABELS[typ] + (oprava ? ` (${ORDER_KIND_LABELS.oprava.toLowerCase()})` : "");
  const popis = [
    jmeno && `Zákazník: ${jmeno}`,
    telefon && `Telefon: ${telefon}`,
    adresa && `Adresa: ${adresa}`,
    oprava && `Typ: ${ORDER_KIND_LABELS.oprava}`,
    z.prideleni.length > 0 && `Přidělení: ${z.prideleni.join(", ")}`,
    `Zakázka v aplikaci: ${odkaz}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    uid: uidUdalosti(z.id, typ),
    souhrn: `${typText} · ${jmeno || "zakázka"}`,
    popis,
    misto: adresa,
    odkaz,
    datum,
    cas,
    delkaMinut: DELKA_ZAMERENI_MIN,
    zmeneno: z.zmeneno,
  };
}

/** Všechny události zakázky (zaměření, montáž), které mají termín. */
export function udalostiZakazky(z: KalendarZakazka, origin: string): Udalost[] {
  return TYPY_UDALOSTI.map((t) => udalostZakazky(z, t, origin)).filter((u): u is Udalost => u !== null);
}

// --- formát iCalendar ---------------------------------------------------------

/** Escapování hodnoty typu TEXT (RFC 5545, 3.3.11). */
export function escapeText(value: string): string {
  return (
    value
      // řídicí znaky TEXT nesmí obsahovat (kromě tabulátoru); konce řádků řeší \n
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n")
  );
}

function utf8Bytes(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/**
 * Skládání řádků (RFC 5545, 3.1): nejvýš 75 oktetů na řádek, pokračování
 * začíná mezerou. Dělí se po celých znacích, nikdy uprostřed UTF-8 sekvence.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = utf8Bytes(ch.codePointAt(0)!);
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // úvodní mezera pokračovacího řádku je taky oktet
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** Čas v UTC: 20261109T221500Z. */
export function utcStamp(d: Date): string {
  return (
    `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** YYYY-MM-DD + n dní → YYYYMMDD (bez ohledu na časové pásmo stroje). */
function datumPlus(iso: string, dni: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const x = new Date(Date.UTC(y, m - 1, d + dni));
  return `${pad(x.getUTCFullYear(), 4)}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}`;
}

function zacatekKonec(u: Udalost): [string, string] {
  if (!u.cas) {
    // Celodenní: DTEND je exkluzivní → následující den.
    return [`DTSTART;VALUE=DATE:${datumPlus(u.datum, 0)}`, `DTEND;VALUE=DATE:${datumPlus(u.datum, 1)}`];
  }
  const [h, min] = u.cas.split(":").map(Number) as [number, number];
  const start = h * 60 + min;
  const end = start + u.delkaMinut;
  const tz = `;TZID=${KALENDAR_TZ}`;
  return [
    `DTSTART${tz}:${datumPlus(u.datum, 0)}T${pad(h)}${pad(min)}00`,
    `DTEND${tz}:${datumPlus(u.datum, Math.floor(end / 1440))}T${pad(Math.floor((end % 1440) / 60))}${pad(end % 60)}00`,
  ];
}

/** Europe/Prague: SEČ/SELČ podle pravidel EU (poslední neděle v březnu a říjnu). */
const VTIMEZONE_PRAHA = [
  "BEGIN:VTIMEZONE",
  `TZID:${KALENDAR_TZ}`,
  `X-LIC-LOCATION:${KALENDAR_TZ}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** Počátek pro SEQUENCE — malá čísla, která s každou úpravou zakázky rostou. */
const SEKVENCE_OD = Date.UTC(2026, 0, 1);

/**
 * SEQUENCE z času poslední změny (minuty od 1. 1. 2026). Znovu stažená
 * událost se stejným UID pak přepíše starší verzi, místo aby ji kalendář
 * (Outlook, import na iPhonu) ignoroval jako tutéž revizi.
 */
export function sekvence(zmeneno: string | null): number {
  const t = zmeneno ? Date.parse(zmeneno) : Number.NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((t - SEKVENCE_OD) / 60_000));
}

function vevent(u: Udalost, ted: Date): string[] {
  const [start, end] = zacatekKonec(u);
  const zmeneno = u.zmeneno ? new Date(u.zmeneno) : null;
  return [
    "BEGIN:VEVENT",
    `UID:${u.uid}`,
    `DTSTAMP:${utcStamp(ted)}`,
    ...(zmeneno && !Number.isNaN(zmeneno.getTime()) ? [`LAST-MODIFIED:${utcStamp(zmeneno)}`] : []),
    `SEQUENCE:${sekvence(u.zmeneno)}`,
    start,
    end,
    `SUMMARY:${escapeText(u.souhrn)}`,
    ...(u.misto ? [`LOCATION:${escapeText(u.misto)}`] : []),
    `DESCRIPTION:${escapeText(u.popis)}`,
    // URI se neescapuje jako TEXT; jen se z něj vyhodí, co by rozbilo řádek
    `URL:${u.odkaz.replace(/[\s"]/g, "")}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ];
}

export interface KalendarVolby {
  /** Čas vygenerování → DTSTAMP. */
  ted: Date;
  /**
   * Název odebíraného kalendáře (X-WR-CALNAME) a nápověda k obnově.
   * U jedné události ke stažení se nedává — jinak by si ji Apple
   * mohl založit jako nový kalendář.
   */
  nazev?: string;
}

/** Celý VCALENDAR; řádky CRLF, složené na 75 oktetů. */
export function sestavKalendar(udalosti: Udalost[], volby: KalendarVolby): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FWDS Europe//Anse//CS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(volby.nazev
      ? [
          `X-WR-CALNAME:${escapeText(volby.nazev)}`,
          `X-WR-TIMEZONE:${KALENDAR_TZ}`,
          // RFC 7986 + starší hint Outlooku: obnovovat aspoň po hodině
          "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
          "X-PUBLISHED-TTL:PT1H",
        ]
      : []),
    ...VTIMEZONE_PRAHA,
    ...udalosti.flatMap((u) => vevent(u, volby.ted)),
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Název souboru ke stažení: zamereni-jana-dvorakova.ics (jen ASCII). */
export function nazevSouboru(typ: TypUdalosti, jmeno: string): string {
  const slug = jmeno
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return `${typ}-${slug || "zakazka"}.ics`;
}

/** Token odkazu na kalendář: 32 náhodných bajtů v base64url (256 bitů). */
export const KALENDAR_TOKEN = /^[A-Za-z0-9_-]{43}$/;
