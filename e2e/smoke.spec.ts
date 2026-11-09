import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// Smoke celé linky: kontakt → zakázka → údaje zákazníka → položka → cena práce
// → k nacenění → (kancelář) cena + termín → objednáno → (technik) termín montáže
// → podpis → hotovo → (kancelář) faktura. Mobilní viewport, česká lokalizace.

const SUFFIX = Date.now();
const CONTACT = `E2E Novák ${SUFFIX}`;

test.describe.configure({ mode: "serial" });

/** Výběr v našem SelectSheet: tap na trigger → tap na možnost. */
async function pickSheet(page: Page, triggerId: string, index = 0) {
  await page.locator(`#${triggerId}`).click();
  await page.locator(".sheet-option").nth(index).click();
}

async function login(page: Page, code: string) {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill(code);
  await expect(page).toHaveURL(/\/(?!login)/);
}

let orderUrl = "";

test("technik: kontakt → zakázka → položka → cena práce → k nacenění", async ({ page }) => {
  await login(page, "111111");

  // Dnes: pozdrav a spodní navigace se třemi cíli
  await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Kontakty/ })).toBeVisible();

  // nový kontakt — stačí jméno nebo telefon
  await page.goto("/kontakty/novy");
  await page.getByLabel("Jméno").fill(CONTACT);
  await page.locator("#c-phone").fill("608 123 456");
  await page.getByLabel("Místo").fill("Ostrava-Poruba");
  await page.getByRole("button", { name: "Založit kontakt" }).click();
  await expect(page.getByRole("heading", { name: CONTACT })).toBeVisible();

  // poznámka zůstává u kontaktu
  await page.getByLabel("Nová poznámka").fill("Volal kvůli sítím do oken.");
  await page.getByRole("button", { name: "Přidat poznámku" }).click();
  await expect(page.getByText("Volal kvůli sítím do oken.")).toBeVisible();

  // zakázka vzniká zadáním termínu zaměření
  await page.getByRole("button", { name: "Zaměřit", exact: true }).click();
  await page.locator(".sheet").getByRole("button", { name: "Zaměřit" }).click();
  await expect(page).toHaveURL(/\/zakazky\/[0-9a-f-]{36}$/);
  orderUrl = page.url();

  // Měřit jde hned. Chybějící údaje zákazníka drží až odeslání k nacenění,
  // nikoli zakládání položek — technik měří dřív, než se dostane k papírování.
  await page.getByRole("button", { name: "Přidat první položku" }).click();
  await expect(page).toHaveURL(/\/polozka\/nova$/);

  // výběr produktu → formulář podle definice dodavatele
  await expect(page.getByRole("heading", { name: "Co zaměřujeme" })).toBeVisible();
  await page.locator(".product-tile").first().click();
  await expect(page.getByText(/Povinná \d+\/\d+/)).toBeVisible();

  // místnost + rozměry + selecty
  await page.locator(".chip", { hasText: "Kuchyně" }).first().click();
  await page.locator("#f-sirka").fill("900");
  await page.locator("#f-vyska").fill("1400");
  for (const id of ["f-barva_profilu", "f-sitovina", "f-barva_sitoviny", "f-typ_uchyceni"]) {
    await pickSheet(page, id);
  }
  await page.getByRole("button", { name: "Uložit položku" }).click();
  await expect(page).toHaveURL(orderUrl);
  await expect(page.getByText("Kuchyně")).toBeVisible();

  // Co chybí, se doplňuje rovnou v řádku — ne na jiné obrazovce.
  await page.getByRole("button", { name: "Doplnit údaje zákazníka" }).click();
  await page.locator('[data-row="email"] input').fill("novak@example.cz");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-row="email"]')).toContainText("novak@example.cz");

  // Potvrzení FAJFKOU, ne Enterem: tlačítko sedí ve stejném slotu jako tužka,
  // takže dokud stisk bral fokus inputu, uložilo se, řádek se překreslil a
  // puštění myši dopadlo na tužku, která editaci hned zase otevřela — se starou
  // hodnotou. Kontroluje se i to, že se nová hodnota ukáže hned.
  await page.locator('[data-row="adresa"] .value-row-edit').click();
  await page.locator('[data-row="adresa"] input').fill("Nádražní 12, Ostrava");
  await page.locator('[data-row="adresa"] [title="Uložit"]').click();
  await expect(page.locator('[data-row="adresa"] input')).toHaveCount(0);
  await expect(page.locator('[data-row="adresa"]')).toContainText("Nádražní 12, Ostrava");

  // bez ceny práce nejde odeslat — CTA rovnou říká, co chybí
  await page.getByRole("button", { name: "Doplnit cenu práce" }).click();
  await expect(page).toHaveURL(/\/cena$/);
  await expect(page.getByText("Poslední krok")).toBeVisible();
  await page.locator(".preset", { hasText: "Půl dne" }).click();
  await page.getByRole("button", { name: "Odeslat k nacenění" }).click();

  await expect(page).toHaveURL(orderUrl);
  await expect(page.getByText("Čeká na kancelář")).toBeVisible();
});

test("technik cenu zakázky nevidí ani v API", async ({ request }) => {
  await request.post("/api/login", { data: { code: "111111" } });
  const id = orderUrl.split("/").pop();
  const res = await request.get(`/api/orders/${id}`);
  const body = (await res.json()) as { order: Record<string, unknown> };
  expect(body.order).not.toHaveProperty("price_customer");
  expect(body.order.price_montage).toBeTruthy();
});

// Kancelář pracuje na desktopu — na telefonu vidí technikův pohled (zadání §1).
test.describe("kancelář (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  // Marek je kancelář, a přesto měří. Položky zadá stejným formulářem jako
  // technik, rovnou z detailu zakázky (S02 #3).
  test("kancelář přidá, upraví a smaže položku ze zaměření", async ({ page }) => {
    // Přihlášení přes API sdílí cookie se stránkou — data se zakládají hned.
    await page.request.post("/api/login", { data: { code: "999999" } });
    const kontakt = (await (
      await page.request.post("/api/contacts", {
        data: { name: `E2E Měří kancelář ${SUFFIX}`, phone: "608 777 888", place: "Opava" },
      })
    ).json()) as { contact: { id: string } };
    const { id } = (await (
      await page.request.post("/api/orders", {
        data: { contact_id: kontakt.contact.id, measured_at: "2026-11-20", measured_time: "10:00" },
      })
    ).json()) as { id: string };

    await page.goto(`/zakazky/${id}`);
    await page.getByRole("link", { name: /Přidat položku/ }).click();
    await expect(page).toHaveURL(/\/polozka\/nova$/);
    await page.locator(".product-tile").first().click();
    await page.locator(".chip", { hasText: "Ložnice" }).first().click();
    await page.locator("#f-sirka").fill("800");
    await page.locator("#f-vyska").fill("1200");
    for (const fid of ["f-barva_profilu", "f-sitovina", "f-barva_sitoviny", "f-typ_uchyceni"]) {
      await pickSheet(page, fid);
    }
    await page.getByRole("button", { name: "Uložit položku" }).click();
    await expect(page).toHaveURL(new RegExp(`/zakazky/${id}$`));
    const radek = page.locator("tr.row-link", { hasText: "Ložnice" });
    await expect(radek).toContainText("800 × 1200");

    // úprava: rozbalit řádek → Upravit → stejný formulář
    await radek.click();
    await page.getByRole("link", { name: "Upravit" }).click();
    await page.locator("#f-sirka").fill("850");
    await page.getByRole("button", { name: "Uložit změny" }).click();
    await expect(page).toHaveURL(new RegExp(`/zakazky/${id}$`));
    await expect(radek).toContainText("850 × 1200");

    // smazání z formuláře položky (s potvrzením)
    await radek.click();
    await page.getByRole("link", { name: "Upravit" }).click();
    await page.getByRole("button", { name: "Smazat položku" }).click();
    await page.getByRole("button", { name: "Opravdu smazat?" }).click();
    await expect(page).toHaveURL(new RegExp(`/zakazky/${id}$`));
    await expect(page.getByText(/Zatím žádné položky/)).toBeVisible();
  });

  test("nacenění → objednáno", async ({ page }) => {
    await login(page, "999999");
    await page.goto(orderUrl);

    // Objednávka k dodavateli: portál JW ji načte ze souboru. Kontroluje se
    // celý řetěz — tlačítko, routa, sestavení souboru — ne jen že něco spadlo.
    const [soubor] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /CSV pro Jack West/ }).click(),
    ]);
    expect(soubor.suggestedFilename()).toMatch(/^jackwest-SEL-15-.*\.csv$/);
    const csv = readFileSync(await soubor.path(), "utf8");
    const radky = csv
      .replace(/^\ufeff/, "")
      .trimEnd()
      .split("\r\n");
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(radky[2]).toMatch(/^Vase_znacka;Pozadovany_Datum;Komentar;Vyrobek;/);
    const kody = radky[2]!.split(";");
    const data = radky[3]!.split(";");
    expect(data[kody.indexOf("Vyrobek")]).toBe("SEL-15");
    expect(data[kody.indexOf("Sirka")]).toBe("900");
    expect(data[kody.indexOf("Vyska")]).toBe("1400");
    expect(data[kody.indexOf("Pozice")]).toBe("Kuchyně 1");

    // Druhý „dodavatel": oprava nemá podkategorii → společný termín Ostatní.
    const id = orderUrl.split("/").pop()!;
    const detail = (await (await page.request.get(`/api/orders/${id}`)).json()) as {
      items: { product_type_id: string; room_id: string }[];
    };
    const oprava = await page.request.post("/api/items", {
      data: {
        kind: "oprava",
        order_id: id,
        room: { id: detail.items[0]!.room_id },
        product_type_id: detail.items[0]!.product_type_id,
        defect_note: "Utržená šňůra",
        note: "",
      },
    });
    expect(oprava.status()).toBe(201);
    await page.reload();

    // panel fáze: cena zakázky + termín pro každého dodavatele, teprve pak Objednáno
    await expect(page.getByRole("button", { name: "Objednáno" })).toBeDisabled();
    await page.locator("#p-cena").fill("18400");
    await page.locator("#p-cena").blur();
    await page.locator("#dodani-jackwest").click();
    await page.locator(".calendar-day:not(:disabled)").nth(10).click();
    await expect(page.locator("#dodani-jackwest")).not.toContainText("Vyber datum");

    // jeden termín ze dvou nestačí — server to odmítne a UI vypíše, komu chybí
    await expect(page.getByText("Chybí: Termín dodání (Ostatní).")).toBeVisible();
    await expect(page.getByRole("button", { name: "Objednáno" })).toBeDisabled();
    const predcasne = await page.request.post(`/api/orders/${id}/phase`, {
      data: { to: "k_montazi", expected: "k_naceneni", reason: "" },
    });
    expect(predcasne.status()).toBe(422);

    await page.locator("#dodani-ostatni").click();
    await page.locator(".calendar-day:not(:disabled)").nth(5).click();

    // Kdo montuje: měřil Jakub, montovat jde s ním Darina — přidá se k zakázce.
    // Uložení termínu posune updated_at; výběr až po načtení nové verze, jinak 409.
    await page.waitForLoadState("networkidle");
    await page.locator("#p-montuje").click();
    await page.locator(".sheet-option", { hasText: "Darina Konderlová" }).click();
    await page.locator(".sheet").getByRole("button", { name: "Zavřít" }).click();
    await expect(page.locator("#p-montuje")).toContainText("Darina Konderlová");

    await page.getByRole("button", { name: "Objednáno" }).click();
    await expect(page.getByText("K montáži").first()).toBeVisible();

    // přidaná montážnice se dozví o zakázce i o termínu dodání
    const darina = await page.context().browser()!.newContext({ baseURL: "http://localhost:5173" });
    await darina.request.post("/api/login", { data: { code: "555555" } });
    const { notifications } = (await (await darina.request.get("/api/notifications")).json()) as {
      notifications: { event: string; order_id: string }[];
    };
    const udalosti = notifications.filter((n) => n.order_id === id).map((n) => n.event);
    expect(udalosti).toContain("nova_zakazka");
    expect(udalosti).toContain("termin_dodani");
    await darina.close();
  });

  test("po objednání jde termín změnit a technik dostane zprávu", async ({ page, request }) => {
    await login(page, "999999");
    await page.goto(orderUrl);
    const id = orderUrl.split("/").pop()!;

    // ve fázi K montáži je pořád výběr data, ne jen text
    await page.locator("#dodani-jackwest").click();
    await page.locator(".calendar-day:not(:disabled)").nth(20).click();
    await expect(page.locator("#dodani-jackwest")).not.toContainText("Vyber datum");

    // souhrnné term_dodani = nejpozdější z termínů dodavatelů
    const { order, dodani } = (await (await page.request.get(`/api/orders/${id}`)).json()) as {
      order: { term_dodani: string };
      dodani: { dodavatel: string; term: string }[];
    };
    expect(dodani.map((r) => r.dodavatel)).toEqual(["jackwest", ""]);
    expect(order.term_dodani).toBe(dodani.map((r) => r.term).sort().at(-1));

    // přidělený technik má in-app notifikaci o změně
    await request.post("/api/login", { data: { code: "111111" } });
    const { notifications } = (await (await request.get("/api/notifications")).json()) as {
      notifications: { event: string; order_id: string; body: string }[];
    };
    const zmena = notifications.find((n) => n.event === "zmena_dodani" && n.order_id === id);
    expect(zmena?.body).toContain("změna dodání Jack West");
  });
});

test("technik: montáž → podpis → hotovo", async ({ page }) => {
  await login(page, "111111");
  await page.goto(orderUrl);
  // dva dodavatelé = dva termíny, technik vidí oba (jen data)
  await expect(page.getByText("Dodání · Jack West")).toBeVisible();
  await expect(page.getByText("Dodání · Ostatní")).toBeVisible();
  await page.locator('[data-row="montaz"] .value-row-edit').click();
  await page.getByRole("button", { name: "Uložit termín" }).click();

  // podpis: bez něj se Hotovo neodešle
  await page.getByRole("button", { name: "Podepsat" }).click();
  await expect(page).toHaveURL(/\/montaz$/);
  await expect(page.getByRole("button", { name: "Nejdřív podpis" })).toBeDisabled();

  await page.getByRole("button", { name: "Podepsat" }).click();
  const canvas = page.locator("canvas.signature-canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i < 10; i++) {
    await page.mouse.move(box.x + 40 + i * 20, box.y + box.height / 2 + Math.sin(i) * 20);
  }
  await page.mouse.up();
  await page.getByRole("button", { name: /Uložit podpis/ }).click();

  await page.getByRole("button", { name: "✓ Hotovo" }).click();
  await expect(page).toHaveURL(orderUrl);
  // technik vidí fakturaci jako hotovou práci
  await expect(page.getByText("Hotovo").first()).toBeVisible();
});

// Fakturace přijde na řadu, až technik odevzdá podepsanou montáž.
test.describe("kancelář: fakturace (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("faktura odemkne montážní list", async ({ page }) => {
    await login(page, "999999");
    await page.goto(orderUrl);
    await expect(page.getByRole("button", { name: "Stáhnout montážní list" })).toBeDisabled();
    await page.locator("#p-fa").fill(`E2E-${SUFFIX}`);
    await page.locator("#p-fa").blur();
    await expect(page.getByRole("button", { name: "Stáhnout montážní list" })).toBeEnabled();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Stáhnout montážní list" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  });
});
