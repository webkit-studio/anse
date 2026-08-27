import { describe, expect, it } from "vitest";
import { blockingFor } from "./routes/orders";

const full = {
  customer_name: "Novák Jan",
  customer_phone: "606 111 222",
  customer_email: "novak@example.cz",
  addr_montaz: "Nádražní 12, Ostrava",
  price_montage: "3400",
  price_customer: "18400",
  term_dodani: "2026-09-20",
  term_montaz: "2026-09-25",
  invoice_no: "2026-0431",
};

describe("blokující kroky", () => {
  it("kompletní zakázka nic neblokuje", () => {
    for (const phase of ["k_zamereni", "k_naceneni", "k_montazi", "k_fakturaci"] as const) {
      expect(blockingFor(phase, full, 3, true)).toEqual([]);
    }
  });

  it("zaměření: údaje zákazníka, položka a cena práce", () => {
    expect(blockingFor("k_zamereni", { ...full, customer_email: "" }, 3, false)).toEqual([
      "Údaje zákazníka",
    ]);
    expect(blockingFor("k_zamereni", full, 0, false)).toEqual(["Aspoň jedna položka"]);
    expect(blockingFor("k_zamereni", { ...full, price_montage: " " }, 1, false)).toEqual([
      "Cena práce",
    ]);
  });

  it("nacenění: cena zakázky a termín dodání", () => {
    expect(blockingFor("k_naceneni", { ...full, price_customer: "", term_dodani: null }, 1, false)).toEqual(
      ["Cena zakázky", "Termín dodání"],
    );
  });

  it("technikův pohled cenu zakázky vůbec nemá, tak ji ani neblokuje", () => {
    const { price_customer, ...bezCeny } = full;
    void price_customer;
    expect(blockingFor("k_naceneni", bezCeny, 1, false)).toEqual([]);
  });

  it("montáž: termín montáže a podpis", () => {
    expect(blockingFor("k_montazi", { ...full, term_montaz: null }, 1, false)).toEqual([
      "Termín montáže",
      "Podpis zákazníka",
    ]);
    expect(blockingFor("k_montazi", full, 1, true)).toEqual([]);
  });

  it("fakturace: číslo faktury", () => {
    expect(blockingFor("k_fakturaci", { ...full, invoice_no: "" }, 1, true)).toEqual([
      "Číslo faktury",
    ]);
  });
});
