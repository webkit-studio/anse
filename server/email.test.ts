import { describe, expect, it } from "vitest";
import { parseRecipients, statusMailHtml, statusMailSubject, statusMailText } from "./email";
import type { StatusMailData } from "./email";

const base: StatusMailData = {
  orderId: "8f2c1e4a-1111-2222-3333-444455556666",
  clientName: "Novákovi",
  installationAddress: "Květinová 128, Průhonice",
  orderNumber: "ZAK26071",
  montageNumber: "MON-2026-042",
  itemCount: 7,
  from: "k_naceneni",
  to: "k_objednavce",
  userName: "Marek Konderla",
  changedAt: "5. 8. 2026 14:20",
  orderUrl: "https://anse-zakazky.netlify.app/zakazky/8f2c1e4a-1111-2222-3333-444455556666",
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

describe("statusMail", () => {
  it("předmět nese zákazníka, číslo zakázky a nový stav", () => {
    expect(statusMailSubject(base)).toBe("Anse: Novákovi (ZAK26071) — K objednávce");
  });

  it("předmět bez čísel zakázky nespadne na prázdné závorky", () => {
    expect(statusMailSubject({ ...base, orderNumber: "", montageNumber: "" })).toBe(
      "Anse: Novákovi — K objednávce",
    );
  });

  it("HTML obsahuje kdo, co a odkaz na zakázku", () => {
    const html = statusMailHtml(base);
    expect(html).toContain("Marek Konderla");
    expect(html).toContain("K nacenění");
    expect(html).toContain("K objednávce");
    expect(html).toContain(base.orderUrl);
    expect(html).toContain("Květinová 128, Průhonice");
  });

  it("escapuje HTML v datech zákazníka (jméno z formuláře je vstup uživatele)", () => {
    const html = statusMailHtml({ ...base, clientName: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("textová varianta drží stejná data", () => {
    const text = statusMailText(base);
    expect(text).toContain("K nacenění → K objednávce");
    expect(text).toContain("Marek Konderla");
    expect(text).toContain(base.orderUrl);
  });
});
