import { describe, expect, it } from "vitest";
import { parseRecipients, notifMailHtml, notifMailSubject, notifMailText } from "./email";
import type { NotifMailData } from "./email";
import { fillTemplate } from "./notify";
import { NOTIF_EVENTS } from "../shared/types";

const base: NotifMailData = {
  title: "Novákovi · Květinová 128, Průhonice",
  body: "Novákovi · Květinová 128, Průhonice — 7 položek k nacenění.",
  eventLabel: "Nové zaměření",
  url: "https://anse-zakazky.netlify.app/zakazky/8f2c1e4a-1111-2222-3333-444455556666",
  cta: "Otevřít zakázku",
};

describe("parseRecipients", () => {
  it("rozdělí adresy podle čárky i středníku a ořeže mezery", () => {
    expect(parseRecipients("a@b.cz, c@d.cz; e@f.cz")).toEqual(["a@b.cz", "c@d.cz", "e@f.cz"]);
  });

  it("prázdné nastavení = žádní adresáti (notifikace se neposílají)", () => {
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients("   ")).toEqual([]);
  });

  it("zahodí položky bez zavináče (překlep nesmí shodit odeslání)", () => {
    expect(parseRecipients("a@b.cz, nesmysl")).toEqual(["a@b.cz"]);
  });
});

describe("notifMail", () => {
  it("předmět nese událost i zakázku", () => {
    expect(notifMailSubject(base)).toBe(
      "Nové zaměření — Novákovi · Květinová 128, Průhonice",
    );
  });

  it("HTML obsahuje zprávu i odkaz na zakázku", () => {
    const html = notifMailHtml(base);
    expect(html).toContain("Nové zaměření");
    expect(html).toContain("7 položek k nacenění");
    expect(html).toContain(base.url);
    expect(html).toContain("Otevřít zakázku");
  });

  it("escapuje HTML v datech zákazníka (jméno z formuláře je vstup uživatele)", () => {
    const html = notifMailHtml({ ...base, title: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("textová varianta drží stejná data", () => {
    const text = notifMailText(base);
    expect(text).toContain("Nové zaměření");
    expect(text).toContain("7 položek k nacenění");
    expect(text).toContain(base.url);
  });
});

describe("fillTemplate", () => {
  it("doplní placeholdery včetně české diakritiky v názvu", () => {
    expect(fillTemplate("{zakázka} — dodání {datum}. Zadej termín montáže.", {
      "zakázka": "Novákovi",
      datum: "2026-09-04",
    })).toBe("Novákovi — dodání 2026-09-04. Zadej termín montáže.");
  });

  it("neznámý placeholder nechá být (radši viditelně, než tiše prázdné)", () => {
    expect(fillTemplate("{zakázka} — {neznamy}", { "zakázka": "X" })).toBe("X — {neznamy}");
  });

  it("všechny šablony událostí jdou vyplnit beze zbytku", () => {
    const vars = {
      "zakázka": "Zakázka",
      datum: "1. 9. 2026",
      "jméno": "Novák",
      "položky": "3 položky",
      dny: "8 dní",
      "důvod": "nezájem",
    };
    for (const e of NOTIF_EVENTS) {
      expect(fillTemplate(e.template, vars)).not.toMatch(/\{[^}]+\}/);
    }
  });
});
