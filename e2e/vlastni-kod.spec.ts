import { devices, expect, test, type Browser, type Page } from "@playwright/test";

// S05 #7: uživatel si v Nastavení nastaví vlastní přihlašovací kód. Ostatní
// zařízení se odhlásí, aktuální zůstane přihlášené, nový kód funguje
// a kancelář ho nevidí (jen „vlastní"). Reset kanceláří vlastní kód zruší.

const SUFFIX = Date.now();
const NOVY_KOD = `Moje-Brana-${SUFFIX}`;
/** Číselný vlastní kód — při ručním psaní se nesmí odeslat po 6. číslici. */
const CISELNY_KOD = String(SUFFIX).slice(-8);
const OBSAZENY_KOD = `obsazeny-${SUFFIX}`;

test.describe.configure({ mode: "serial" });

async function prihlasit(page: Page, code: string) {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill(code);
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}

/** Další zařízení — vlastní cookies, stejný mobil jako v configu. */
async function zarizeni(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "cs-CZ",
    baseURL: "http://localhost:5173",
  });
  return ctx.newPage();
}

async function zalozTechnika(kancelar: Page, jmeno: string) {
  const res = await kancelar.request.post("/api/users", { data: { name: jmeno, role: "technik" } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { user: { id: string; name: string; code: string } }).user;
}

async function vyplnZmenu(page: Page, soucasny: string, novy: string, znovu = novy) {
  await page.getByLabel("Současný kód").fill(soucasny);
  await page.getByLabel("Nový kód", { exact: true }).fill(novy);
  await page.getByLabel("Nový kód znovu").fill(znovu);
  await page.getByRole("button", { name: "Uložit nový kód" }).click();
}

test("technik si změní kód: staré zařízení se odhlásí, nový kód funguje, kancelář ho nevidí", async ({
  page,
  browser,
}) => {
  await prihlasit(page, "999999");
  const technik = await zalozTechnika(page, `E2E Kód ${SUFFIX}`);
  const soused = await zalozTechnika(page, `E2E Soused ${SUFFIX}`);

  const telefon = await zarizeni(browser);
  const tablet = await zarizeni(browser);
  try {
    // Soused už má vlastní kód — na ten se technik „trefí" (kolize).
    const s = await browser.newContext({ baseURL: "http://localhost:5173" });
    expect((await s.request.post("/api/login", { data: { code: soused.code } })).ok()).toBe(true);
    const sousedZmena = await s.request.put("/api/me/code", {
      data: { current: soused.code, code: OBSAZENY_KOD },
    });
    expect(sousedZmena.ok()).toBe(true);
    await s.close();

    for (const z of [telefon, tablet]) {
      await prihlasit(z, technik.code);
      await expect(z.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
    }

    // Technik: Zprávy → ⚙ Nastavení → Přihlašovací kód.
    await telefon.getByRole("button", { name: /^Zprávy/ }).first().click();
    await telefon.getByRole("button", { name: "Nastavení" }).click();
    await telefon.getByRole("link", { name: /Přihlašovací kód/ }).click();
    await expect(telefon).toHaveURL(/\/nastaveni\/kod$/);

    // Formulář pro správce hesel: username + current-password + 2× new-password.
    const form = telefon.locator("form.kod-form");
    await expect(form.locator("input").first()).toHaveAttribute("autocomplete", "username");
    await expect(form.locator("input").first()).toHaveValue("Anse");
    await expect(telefon.getByLabel("Současný kód")).toHaveAttribute("autocomplete", "current-password");
    await expect(telefon.getByLabel("Nový kód", { exact: true })).toHaveAttribute("autocomplete", "new-password");
    await expect(telefon.getByLabel("Nový kód znovu")).toHaveAttribute("autocomplete", "new-password");
    for (const pole of await form.locator("input:not(.visually-hidden)").all()) {
      await expect(pole).toHaveAttribute("type", "password");
      expect(await pole.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    }

    // Slabý a obsazený kód: stejná obecná hláška u pole.
    await vyplnZmenu(telefon, technik.code, "12345678");
    await expect(telefon.getByRole("alert")).toHaveText("Tento kód nejde použít, zvol jiný.");
    await vyplnZmenu(telefon, technik.code, OBSAZENY_KOD.toUpperCase());
    await expect(telefon.getByRole("alert")).toHaveText("Tento kód nejde použít, zvol jiný.");

    // Neshoda a špatný současný kód.
    await vyplnZmenu(telefon, technik.code, NOVY_KOD, `${NOVY_KOD}x`);
    await expect(telefon.getByRole("alert")).toHaveText("Kódy se neshodují.");
    await vyplnZmenu(telefon, "000001", NOVY_KOD);
    await expect(telefon.getByRole("alert")).toHaveText("Současný kód nesedí.");
    // 400, ne 401 — appka technika neodhlásila
    await expect(telefon).toHaveURL(/\/nastaveni\/kod$/);

    // Uložení: skutečná navigace (správce hesel nabídne aktualizaci) a potvrzení.
    await vyplnZmenu(telefon, technik.code, NOVY_KOD);
    await expect(telefon).toHaveURL(/\/nastaveni\/kod\?zmeneno=1$/);
    await expect(telefon.getByText(/^Kód je změněný\./)).toBeVisible();
    // tohle zařízení zůstalo přihlášené
    await telefon.goto("/");
    await expect(telefon.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();

    // Druhé zařízení je odhlášené; starý kód neplatí, nový ano (i jinou velikostí písmen).
    await tablet.reload();
    await expect(tablet).toHaveURL(/\/login$/);
    await tablet.getByLabel("Přihlašovací kód").fill(technik.code);
    await expect(tablet.getByRole("alert")).toHaveText("Neplatný kód.");
    await prihlasit(tablet, NOVY_KOD.toLowerCase());
    await expect(tablet.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();

    // Kancelář kód nevidí — jen že je vlastní.
    const ucty = (await (await page.request.get("/api/users")).json()) as {
      users: { id: string; code: string | null; vlastni_kod: boolean }[];
    };
    const radek = ucty.users.find((u) => u.id === technik.id)!;
    expect(radek.code).toBeNull();
    expect(radek.vlastni_kod).toBe(true);
    expect(JSON.stringify(ucty)).not.toContain(NOVY_KOD.toLowerCase());
    expect(JSON.stringify(ucty)).not.toContain(OBSAZENY_KOD);
    await page.goto("/nastaveni/ucty");
    const tr = page.getByRole("row").filter({ hasText: technik.name });
    await expect(tr.getByText("vlastní", { exact: true })).toBeVisible();

    // Reset kanceláří: vlastní kód přestane platit, technik se odhlásí.
    await tr.getByRole("button", { name: `Vygenerovat nový kód pro ${technik.name}` }).click();
    await tr.getByRole("button", { name: "Opravdu nový kód?" }).click();
    await expect(page.getByText("Nový kód platí")).toBeVisible();
    await tablet.reload();
    await expect(tablet).toHaveURL(/\/login$/);
    await tablet.getByLabel("Přihlašovací kód").fill(NOVY_KOD);
    await expect(tablet.getByRole("alert")).toHaveText("Neplatný kód.");

    // Nový 6místný kód napsaný ručně se odešle sám (po krátké pauze).
    const poResetu = (await (await page.request.get("/api/users")).json()) as {
      users: { id: string; code: string | null }[];
    };
    const sesticiferny = poResetu.users.find((u) => u.id === technik.id)!.code!;
    expect(sesticiferny).toMatch(/^\d{6}$/);
    await tablet.getByLabel("Přihlašovací kód").pressSequentially(sesticiferny, { delay: 60 });
    await expect(tablet).not.toHaveURL(/\/login(\?|$)/);
    await expect(tablet.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
  } finally {
    await page.request.patch(`/api/users/${technik.id}`, { data: { active: false } });
    await page.request.patch(`/api/users/${soused.id}`, { data: { active: false } });
    await telefon.context().close();
    await tablet.context().close();
  }
});

test("číselný vlastní kód psaný ručně se neodešle po 6. číslici", async ({ page, browser }) => {
  await prihlasit(page, "999999");
  const technik = await zalozTechnika(page, `E2E Číslice ${SUFFIX}`);
  const telefon = await zarizeni(browser);
  try {
    await prihlasit(telefon, technik.code);
    const zmena = await telefon.request.put("/api/me/code", {
      data: { current: technik.code, code: CISELNY_KOD },
    });
    expect(zmena.ok()).toBe(true);

    const jinde = await zarizeni(browser);
    try {
      await jinde.goto("/login");
      const pole = jinde.getByLabel("Přihlašovací kód");
      // Píše se jako na telefonu, číslice po číslici.
      await pole.pressSequentially(CISELNY_KOD, { delay: 120 });
      // Po 6. číslici se nic neodeslalo: celý kód je v poli a žádná chyba.
      await jinde.waitForTimeout(1200);
      await expect(jinde).toHaveURL(/\/login$/);
      await expect(pole).toHaveValue(CISELNY_KOD);
      await expect(jinde.getByRole("alert")).toHaveCount(0);
      // Delší kód se potvrdí tlačítkem.
      await jinde.getByRole("button", { name: "Přihlásit" }).click();
      await expect(jinde).not.toHaveURL(/\/login(\?|$)/);
      await expect(jinde.getByRole("navigation", { name: "Hlavní navigace" })).toBeVisible();
    } finally {
      await jinde.context().close();
    }
  } finally {
    await page.request.patch(`/api/users/${technik.id}`, { data: { active: false } });
    await telefon.context().close();
  }
});
