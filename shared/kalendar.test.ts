import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import {
  KALENDAR_TOKEN,
  escapeText,
  foldLine,
  nazevSouboru,
  sekvence,
  sestavKalendar,
  udalostZakazky,
  udalostiZakazky,
  uidUdalosti,
  utcStamp,
  type KalendarZakazka,
} from "./kalendar";

// S04 #5: zaměření a montáže v kalendáři technika (RFC 5545). Výstup se
// kontroluje dvakrát: strukturou podle RFC (CRLF, 75 oktetů, povinné
// vlastnosti) a parserem ical.js (Thunderbird), který ho musí přečíst.

const ORIGIN = "https://anse-zakazky.netlify.app";
const TED = new Date("2026-11-09T22:15:00Z");

const ZAKAZKA: KalendarZakazka = {
  id: "5f1c2a9e-0b7d-4c1e-9a3f-2d6b8e4c7a10",
  kind: "nova",
  jmeno: "Jana Dvořáková",
  telefon: "+420 608 111 222",
  adresa: "Kounicova 12, 602 00 Brno",
  measured_at: "2026-11-12",
  measured_time: "09:30",
  term_montaz: "2026-11-20",
  prideleni: ["Jakub Svoboda", "Marek Konderla"],
  zmeneno: "2026-11-09T20:00:00Z",
};

function parse(ics: string) {
  const comp = new ICAL.Component(ICAL.parse(ics));
  for (const tz of comp.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  return comp;
}

function eventy(ics: string) {
  return parse(ics)
    .getAllSubcomponents("vevent")
    .map((v) => new ICAL.Event(v));
}

/** Strukturální kontrola podle RFC 5545 bez knihovny. */
function rfcStruktura(ics: string): string[] {
  const chyby: string[] = [];
  if (!ics.endsWith("\r\n")) chyby.push("chybí CRLF na konci");
  if (/[^\r]\n/.test(ics) || /\r(?!\n)/.test(ics)) chyby.push("konec řádku není CRLF");
  const fyzicke = ics.slice(0, -2).split("\r\n");
  fyzicke.forEach((l, i) => {
    if (Buffer.byteLength(l, "utf8") > 75) chyby.push(`řádek ${i + 1} má víc než 75 oktetů`);
  });
  // rozložení pokračovacích řádků
  const logicke = ics.replace(/\r\n[ \t]/g, "").slice(0, -2).split("\r\n");
  const zasobnik: string[] = [];
  let vevent: Set<string> | null = null;
  for (const l of logicke) {
    if (!/^[A-Z0-9-]+[;:]/.test(l)) chyby.push(`neplatný řádek: ${l}`);
    const nazev = l.split(/[;:]/)[0]!;
    if (l.startsWith("BEGIN:")) {
      zasobnik.push(l.slice(6));
      if (l === "BEGIN:VEVENT") vevent = new Set();
    } else if (l.startsWith("END:")) {
      if (zasobnik.pop() !== l.slice(4)) chyby.push(`nesedí ${l}`);
      if (l === "END:VEVENT" && vevent) {
        for (const p of ["UID", "DTSTAMP", "DTSTART"]) if (!vevent.has(p)) chyby.push(`VEVENT bez ${p}`);
        vevent = null;
      }
    } else if (vevent) {
      if (vevent.has(nazev) && nazev !== "DESCRIPTION") chyby.push(`VEVENT má ${nazev} dvakrát`);
      vevent.add(nazev);
    }
  }
  if (zasobnik.length > 0) chyby.push("neuzavřené komponenty");
  if (logicke[0] !== "BEGIN:VCALENDAR") chyby.push("nezačíná VCALENDAR");
  if (!logicke.includes("VERSION:2.0")) chyby.push("chybí VERSION");
  if (!logicke.some((l) => l.startsWith("PRODID:"))) chyby.push("chybí PRODID");
  return chyby;
}

describe("escapování TEXT", () => {
  it("escapuje zpětné lomítko, středník, čárku a konce řádků", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("vyhodí řídicí znaky, tabulátor nechá", () => {
    expect(escapeText("a\u0000b\u0007c\td")).toBe("abc\td");
  });
});

describe("skládání řádků", () => {
  it("krátký řádek nechá být", () => {
    expect(foldLine("SUMMARY:Montáž")).toBe("SUMMARY:Montáž");
  });

  it("dlouhý řádek složí na 75 oktetů a jde rozložit zpět", () => {
    const line = "DESCRIPTION:" + "x".repeat(300);
    const folded = foldLine(line);
    for (const l of folded.split("\r\n")) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });

  it("nedělí vícebajtové znaky (čeština, emoji)", () => {
    const line = "SUMMARY:" + "Žluťoučký kůň úpěl ďábelské ódy 🪟 ".repeat(8);
    const folded = foldLine(line);
    for (const l of folded.split("\r\n")) {
      expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
      // rozdělená UTF-8 sekvence by se dekódovala na náhradní znak
      expect(Buffer.from(l, "utf8").toString("utf8")).not.toContain("�");
    }
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});

describe("události zakázky", () => {
  it("zaměření s časem trvá hodinu, montáž je celodenní", () => {
    const [zam, mon] = udalostiZakazky(ZAKAZKA, ORIGIN);
    expect(zam).toMatchObject({ datum: "2026-11-12", cas: "09:30", delkaMinut: 60 });
    expect(mon).toMatchObject({ datum: "2026-11-20", cas: null });
  });

  it("zaměření bez času je celodenní", () => {
    expect(udalostZakazky({ ...ZAKAZKA, measured_time: null }, "zamereni", ORIGIN)?.cas).toBeNull();
  });

  it("bez termínu (nebo s nesmyslným datem) událost nevznikne", () => {
    expect(udalostZakazky({ ...ZAKAZKA, term_montaz: null }, "montaz", ORIGIN)).toBeNull();
    expect(udalostZakazky({ ...ZAKAZKA, measured_at: "2026-02-30" }, "zamereni", ORIGIN)).toBeNull();
    expect(udalostiZakazky({ ...ZAKAZKA, measured_at: null, term_montaz: null }, ORIGIN)).toEqual([]);
  });

  it("nesmyslný čas → celodenní, ne rozbitý DTSTART", () => {
    expect(udalostZakazky({ ...ZAKAZKA, measured_time: "25:00" }, "zamereni", ORIGIN)?.cas).toBeNull();
  });

  it("UID je stabilní per zakázka a typ", () => {
    const a = udalostiZakazky(ZAKAZKA, ORIGIN).map((u) => u.uid);
    const b = udalostiZakazky({ ...ZAKAZKA, jmeno: "Jiné jméno", term_montaz: "2026-12-01" }, ORIGIN).map(
      (u) => u.uid,
    );
    expect(a).toEqual(b);
    expect(a).toEqual([uidUdalosti(ZAKAZKA.id, "zamereni"), uidUdalosti(ZAKAZKA.id, "montaz")]);
    expect(new Set(a).size).toBe(2);
  });

  it("obsah: jméno, telefon, adresa, přidělení a odkaz do appky", () => {
    const u = udalostZakazky(ZAKAZKA, "zamereni", ORIGIN)!;
    expect(u.souhrn).toBe("Zaměření · Jana Dvořáková");
    expect(u.misto).toBe("Kounicova 12, 602 00 Brno");
    expect(u.popis).toContain("Telefon: +420 608 111 222");
    expect(u.popis).toContain("Přidělení: Jakub Svoboda, Marek Konderla");
    expect(u.odkaz).toBe(`${ORIGIN}/zakazky/${ZAKAZKA.id}`);
    expect(u.popis).not.toContain("Typ:");
  });

  it("oprava je vidět v názvu i popisu", () => {
    const u = udalostZakazky({ ...ZAKAZKA, kind: "oprava" }, "montaz", ORIGIN)!;
    expect(u.souhrn).toBe("Montáž (oprava) · Jana Dvořáková");
    expect(u.popis).toContain("Typ: Oprava");
  });

  it("bez jména zůstane srozumitelný název", () => {
    expect(udalostZakazky({ ...ZAKAZKA, jmeno: " " }, "montaz", ORIGIN)?.souhrn).toBe("Montáž · zakázka");
  });

  it("cena se do kalendáře nedostane, ani kdyby v datech omylem byla", () => {
    const sCenou = { ...ZAKAZKA, price_customer: "48 500", price_montage: "6 000" } as KalendarZakazka;
    const ics = sestavKalendar(udalostiZakazky(sCenou, ORIGIN), { ted: TED });
    expect(ics).not.toContain("48 500");
    expect(ics).not.toContain("6 000");
  });
});

describe("VCALENDAR", () => {
  const zvlastni: KalendarZakazka = {
    ...ZAKAZKA,
    jmeno: "Novák; Dvořák, s.r.o. \\ test",
    adresa: "Dlouhá 1, Praha\nvchod ze dvora",
  };
  const ics = sestavKalendar(udalostiZakazky(zvlastni, ORIGIN), { ted: TED, nazev: "Anse – zakázky" });

  it("splňuje strukturu RFC 5545 (CRLF, 75 oktetů, povinné vlastnosti)", () => {
    expect(rfcStruktura(ics)).toEqual([]);
  });

  it("ical.js ho přečte a hodnoty projdou tam i zpět", () => {
    const [zam, mon] = eventy(ics);
    expect(zam!.uid).toBe(uidUdalosti(ZAKAZKA.id, "zamereni"));
    expect(zam!.summary).toBe("Zaměření · Novák; Dvořák, s.r.o. \\ test");
    expect(zam!.location).toBe("Dlouhá 1, Praha\nvchod ze dvora");
    expect(zam!.description).toContain("Zakázka v aplikaci: " + ORIGIN);
    expect(mon!.summary).toBe("Montáž · Novák; Dvořák, s.r.o. \\ test");
  });

  it("zaměření v 9:30 pražského času je v listopadu 8:30 UTC, v červnu 7:30 UTC", () => {
    const [zima] = eventy(ics);
    expect(zima!.startDate.zone?.tzid).toBe("Europe/Prague");
    expect(zima!.startDate.toJSDate().toISOString()).toBe("2026-11-12T08:30:00.000Z");
    expect(zima!.endDate.toJSDate().toISOString()).toBe("2026-11-12T09:30:00.000Z");

    const leto = sestavKalendar(udalostiZakazky({ ...ZAKAZKA, measured_at: "2026-06-15" }, ORIGIN), { ted: TED });
    expect(eventy(leto)[0]!.startDate.toJSDate().toISOString()).toBe("2026-06-15T07:30:00.000Z");
  });

  it("celodenní montáž končí exkluzivně dalším dnem (i přes Silvestra)", () => {
    const [, mon] = eventy(ics);
    expect(mon!.startDate.isDate).toBe(true);
    expect(mon!.startDate.toString()).toBe("2026-11-20");
    expect(mon!.endDate.toString()).toBe("2026-11-21");

    const silvestr = sestavKalendar(udalostiZakazky({ ...ZAKAZKA, term_montaz: "2026-12-31" }, ORIGIN), {
      ted: TED,
    });
    expect(silvestr).toContain("DTSTART;VALUE=DATE:20261231\r\n");
    expect(silvestr).toContain("DTEND;VALUE=DATE:20270101\r\n");
  });

  it("zaměření ve 23:30 skončí po půlnoci dalšího dne", () => {
    const pozde = sestavKalendar(
      udalostiZakazky({ ...ZAKAZKA, measured_at: "2026-11-30", measured_time: "23:30" }, ORIGIN),
      { ted: TED },
    );
    expect(pozde).toContain("DTSTART;TZID=Europe/Prague:20261130T233000\r\n");
    expect(pozde).toContain("DTEND;TZID=Europe/Prague:20261201T003000\r\n");
    expect(rfcStruktura(pozde)).toEqual([]);
  });

  it("DTSTAMP a LAST-MODIFIED jsou v UTC", () => {
    expect(ics).toContain(`DTSTAMP:${utcStamp(TED)}\r\n`);
    expect(utcStamp(TED)).toBe("20261109T221500Z");
    expect(ics).toContain("LAST-MODIFIED:20261109T200000Z\r\n");
  });

  it("odebíraný kalendář má název a nápovědu k obnově, jedna událost ne", () => {
    expect(parse(ics).getFirstPropertyValue("x-wr-calname")).toBe("Anse – zakázky");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    const jedna = sestavKalendar([udalostZakazky(ZAKAZKA, "montaz", ORIGIN)!], { ted: TED });
    expect(jedna).not.toContain("X-WR-CALNAME");
    expect(eventy(jedna)).toHaveLength(1);
    expect(rfcStruktura(jedna)).toEqual([]);
  });

  it("prázdný kalendář je pořád platný", () => {
    const prazdny = sestavKalendar([], { ted: TED, nazev: "Anse – zakázky" });
    expect(rfcStruktura(prazdny)).toEqual([]);
    expect(eventy(prazdny)).toHaveLength(0);
  });
});

describe("drobnosti", () => {
  it("název souboru je ASCII bez diakritiky", () => {
    expect(nazevSouboru("zamereni", "Jana Dvořáková")).toBe("zamereni-jana-dvorakova.ics");
    expect(nazevSouboru("montaz", "  ")).toBe("montaz-zakazka.ics");
    expect(nazevSouboru("montaz", "Ř".repeat(60))).toBe(`montaz-${"r".repeat(40)}.ics`);
  });

  it("SEQUENCE roste s každou úpravou zakázky, bez času je 0", () => {
    expect(sekvence(null)).toBe(0);
    expect(sekvence("nesmysl")).toBe(0);
    expect(sekvence("2025-06-01T00:00:00Z")).toBe(0);
    const a = sekvence("2026-11-09T20:00:00Z");
    expect(sekvence("2026-11-09T20:05:00Z")).toBe(a + 5);
    expect(sestavKalendar(udalostiZakazky(ZAKAZKA, ORIGIN), { ted: TED })).toContain(`SEQUENCE:${a}\r\n`);
  });

  it("token odkazu má 256 bitů v base64url", () => {
    expect(KALENDAR_TOKEN.test("A".repeat(43))).toBe(true);
    expect(KALENDAR_TOKEN.test("A".repeat(42))).toBe(false);
    expect(KALENDAR_TOKEN.test("A".repeat(42) + "/")).toBe(false);
  });
});
