import { devices, expect, test, type Browser, type Page } from "@playwright/test";

// L01 #6: přihlášení, které si správce hesel (iCloud Klíčenka, Google) umí
// uložit a doplnit přes Face ID, platí 90 dní — a reset kódu kanceláří
// dotyčného odhlásí ze všech zařízení.

const SUFFIX = Date.now();

test.describe.configure({ mode: "serial" });

async function prihlasit(page: Page, code: string) {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill(code);
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}

/** Další zařízení technika — vlastní cookies, stejný mobil jako v configu. */
async function zarizeni(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "cs-CZ",
    baseURL: "http://localhost:5173",
  });
  return ctx.newPage();
}

test("přihlášení: pole pro správce hesel a skutečná navigace po odeslání", async ({ page }) => {
  await page.goto("/login");

  const form = page.locator("form.login-card");
  await expect(form).toHaveCount(1);
  const kod = form.getByLabel("Přihlašovací kód");
  await expect(kod).toHaveAttribute("type", "password");
  await expect(kod).toHaveAttribute("autocomplete", "current-password");
  await expect(kod).toHaveAttribute("inputmode", "numeric");
  expect(await kod.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

  // Username ve stejném formuláři před heslem — Klíčenka ví, k čemu kód patří.
  const prvni = form.locator("input").first();
  await expect(prvni).toHaveAttribute("autocomplete", "username");
  await expect(prvni).toHaveValue("Anse");
  // vykreslené (ne display:none), ale mimo tok — vzhled se nemění
  expect(await prvni.evaluate((el) => getComputedStyle(el).position)).toBe("absolute");
  expect(await prvni.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");

  // Enter s neúplným kódem odešle formulář a chyba je u pole.
  await kod.fill("123");
  await kod.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Kód má 6 číslic.");
  await expect(page).toHaveURL(/\/login$/);

  // Značka v okně zmizí jen při skutečném načtení stránky — na tu správci
  // hesel reagují, změnu routy v SPA neberou vždycky.
  await page.evaluate(() => {
    (window as unknown as { predPrihlasenim?: boolean }).predPrihlasenim = true;
  });
  await kod.fill("111111");
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { predPrihlasenim?: boolean }).predPrihlasenim),
  ).toBeUndefined();

  // Cookie platí 90 dní.
  const cookie = (await page.context().cookies()).find((c) => c.name === "anse_session")!;
  const dni = (cookie.expires - Date.now() / 1000) / 86400;
  expect(dni).toBeGreaterThan(89);
  expect(dni).toBeLessThanOrEqual(90);
  expect(cookie.httpOnly).toBe(true);
});

test("reset kódu kanceláří odhlásí technika ze všech zařízení", async ({ page, browser }) => {
  await prihlasit(page, "999999");
  const zalozeni = await page.request.post("/api/users", {
    data: { name: `E2E Reset ${SUFFIX}`, role: "technik" },
  });
  expect(zalozeni.status()).toBe(201);
  const { user } = (await zalozeni.json()) as { user: { id: string; name: string; code: string } };

  const telefon = await zarizeni(browser);
  const tablet = await zarizeni(browser);
  try {
    for (const z of [telefon, tablet]) {
      await prihlasit(z, user.code);
      await expect(z.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
    }

    // Kancelář v Nastavení → Účty vydá nový kód.
    await page.goto("/nastaveni/ucty");
    await page.getByRole("button", { name: `Vygenerovat nový kód pro ${user.name}` }).click();
    await page.getByRole("button", { name: "Opravdu nový kód?" }).click();
    await expect(page.getByText("Nový kód platí")).toBeVisible();

    // Otevřená appka se odhlásí sama při dalším požadavku, bez obnovení
    // stránky; druhé zařízení po obnovení.
    await telefon.getByRole("link", { name: /Kontakty/ }).click();
    await expect(telefon).toHaveURL(/\/login$/);
    await tablet.reload();
    await expect(tablet).toHaveURL(/\/login$/);

    // Starý kód už neplatí.
    await telefon.getByLabel("Přihlašovací kód").fill(user.code);
    await expect(telefon.getByRole("alert")).toHaveText("Neplatný kód.");

    // Kancelář zůstala přihlášená.
    await page.reload();
    await expect(page).toHaveURL(/\/nastaveni\/ucty$/);

    // Nový kód funguje.
    const ucty = (await (await page.request.get("/api/users")).json()) as {
      users: { id: string; code: string }[];
    };
    const novyKod = ucty.users.find((u) => u.id === user.id)!.code;
    expect(novyKod).not.toBe(user.code);
    await prihlasit(telefon, novyKod);
    await expect(telefon.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();

    // Vypnutí účtu odhlásí taky (skutečný PATCH proti Postgresu).
    const vypnuti = await page.request.patch(`/api/users/${user.id}`, { data: { active: false } });
    expect(vypnuti.ok()).toBe(true);
    await telefon.reload();
    await expect(telefon).toHaveURL(/\/login$/);
  } finally {
    await page.request.patch(`/api/users/${user.id}`, { data: { active: false } });
    await telefon.context().close();
    await tablet.context().close();
  }
});
