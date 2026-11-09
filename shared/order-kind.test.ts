import { describe, expect, it } from "vitest";
import { orderCreateBody, orderUpdateBody } from "./api-contracts";
import { oznaceniTypuProPdf } from "./print";
import { ORDER_KINDS, ORDER_KIND_LABELS } from "./types";

// S03 #4: typ zakázky Nová / Oprava. Server klientovi nevěří — typ se
// revaliduje kontraktem i check constraintem v DB (migrace 016).

const CONTACT = "11111111-1111-4111-8111-111111111111";

describe("typ zakázky", () => {
  it("bez volby se zakládá nová — oprava je vědomé klepnutí", () => {
    expect(orderCreateBody.parse({ contact_id: CONTACT }).kind).toBe("nova");
  });

  it("založení přijme opravu", () => {
    expect(orderCreateBody.parse({ contact_id: CONTACT, kind: "oprava" }).kind).toBe("oprava");
  });

  it("neznámý typ neprojde ani při založení, ani při úpravě", () => {
    const zalozeni = orderCreateBody.safeParse({ contact_id: CONTACT, kind: "servis" });
    expect(zalozeni.success).toBe(false);
    expect(zalozeni.error?.issues[0]?.message).toBe("Typ zakázky je Nová, nebo Oprava.");

    const uprava = orderUpdateBody.safeParse({ kind: "", expected_updated_at: "x" });
    expect(uprava.success).toBe(false);
  });

  it("úprava typ nemusí posílat; když ho pošle, projde", () => {
    expect(orderUpdateBody.parse({ expected_updated_at: "x" }).kind).toBeUndefined();
    expect(orderUpdateBody.parse({ kind: "nova", expected_updated_at: "x" }).kind).toBe("nova");
  });

  it("každý typ má český popisek", () => {
    for (const k of ORDER_KINDS) expect(ORDER_KIND_LABELS[k]).toMatch(/^[A-ZÁ-Ž]/);
  });

  it("montážní list označí jen opravu — nová zůstává bez značky", () => {
    expect(oznaceniTypuProPdf("oprava")).toBe("OPRAVA");
    expect(oznaceniTypuProPdf("nova")).toBeNull();
    // starší řádek bez typu (záložka před nasazením) = nová
    expect(oznaceniTypuProPdf(undefined)).toBeNull();
  });
});
