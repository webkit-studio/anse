import { expect, test, type Page } from "@playwright/test";

// Kolo 2 flow: dashboard bez hledání → nová zakázka (technik: jen místo +
// poznámka) → typ produktu → fullscreen formulář s místností → duplikace →
// EDITACE KOPIE (regrese na 409) → přesun místnosti → K objednání → admin
// objedná → statistiky.

const CLIENT_NAME = `E2E Novák ${Date.now()}`;

test.describe.configure({ mode: "serial" });

/** Výběr v našem SelectSheet: tap na trigger → tap na možnost. */
async function pickSheet(page: Page, triggerId: string, optionLabel: string | RegExp) {
  await page.locator(`#${triggerId}`).click();
  await page.locator(".sheet-option", { hasText: optionLabel }).first().click();
}

test("technik: zakázka → produkt → duplikace → editace kopie → přesun → k objednání", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Přihlašovací kód").fill("111111");

  // dashboard: 2 dlaždice, bez vyhledávání
  await expect(page.getByRole("link", { name: "+ Nová zakázka" })).toBeVisible();
  await expect(page.getByText("Rozpracované")).toBeVisible();
  await expect(page.getByText("K objednání")).toBeVisible();
  await expect(page.locator("input[type=search]")).toHaveCount(0);

  // nová zakázka — technik nevidí čísla montáže/zakázky ani termín dodání
  await page.getByRole("link", { name: "+ Nová zakázka" }).click();
  await expect(page.locator("#o-montage")).toHaveCount(0);
  await expect(page.locator("#o-delivery")).toHaveCount(0);
  await page.getByLabel("Firma / jméno a příjmení").fill(CLIENT_NAME);
  await page.locator("#c-phone").fill("777123456");
  await page.getByLabel("Adresa").fill("Testovací 12, Praha");
  await page.getByRole("button", { name: "Založit zakázku" }).click();

  await expect(page.getByRole("heading", { name: CLIENT_NAME })).toBeVisible();
  await expect(page.locator(".status-badge")).toHaveText("Rozpracovaná");
  // telefon se uložil s předvolbou a mezerami
  await expect(page.getByText("+420 777 123 456")).toBeVisible();

  // přidat produkt: nejdřív jen typ (fullscreen s návratem na zakázku)
  await page.getByRole("link", { name: "+ Přidat produkt" }).click();
  await expect(page.getByRole("link", { name: "← Zakázka" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Plissé žaluzie/ })).toBeDisabled();
  await page.getByRole("button", { name: /Okenní sítě/ }).click();

  // formulář: místnost jako první volba
  await pickSheet(page, "room-select", "Kuchyně");

  const sirka = page.locator("#f-sirka");
  await expect(sirka).toHaveAttribute("inputmode", "numeric");
  await sirka.fill("500");
  await page.locator("#f-vyska").fill("500");
  await expect(page.getByText("Plocha je pod minimálním účtovaným rozměrem 0,8 m².")).toBeVisible();

  // žádné defaulty: síťovina i barva se musí zvolit; podmíněné RAL pole
  await expect(page.locator("#f-ral")).toHaveCount(0);
  await pickSheet(page, "f-barva_profilu", "RAL");
  await expect(page.locator("#f-ral")).toBeVisible();
  await expect(page.getByText("V barvě RAL je minimální účtovaný rozměr 2 m².")).toBeVisible();
  await page.locator("#f-ral").fill("7035");
  await pickSheet(page, "f-sitovina", "Standard");
  await pickSheet(page, "f-barva_sitoviny", "Šedá");
  await pickSheet(page, "f-typ_uchyceni", /^STANDARD$/);

  // ořez lemu Ano → blokující poznámka
  await pickSheet(page, "f-orez_lemu", /^Ano$/);
  await page.getByRole("button", { name: "Uložit položku" }).click();
  await expect(page.getByText("Uveďte do poznámky, která strana sítě se ořezává.")).toBeVisible();
  await page.locator("#f-note").fill("ořez vpravo");
  await page.getByRole("button", { name: "Uložit položku" }).click();

  // zpět na zakázce: sekce Výpis produktů + karta v Kuchyni
  await expect(page.getByRole("heading", { name: "Výpis produktů" })).toBeVisible();
  await expect(page.locator(".item-card")).toHaveCount(1);

  // duplikace
  await page.getByRole("button", { name: "Duplikovat položku" }).click();
  await expect(page.locator(".item-card")).toHaveCount(2);

  // REGRESE 409: editace duplikované položky musí projít
  await page.locator(".item-card").nth(1).getByRole("link", { name: "Upravit položku" }).click();
  await page.locator("#f-vyska").fill("600");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("heading", { name: "Výpis produktů" })).toBeVisible();
  await expect(page.getByText("Položku mezitím upravil někdo jiný.")).toHaveCount(0);
  await expect(page.getByText("500 × 600 mm")).toBeVisible();

  // přesun kopie do jiné místnosti (předvolba Ložnice)
  await page.locator(".item-card").nth(1).getByRole("link", { name: "Upravit položku" }).click();
  await pickSheet(page, "room-select", "Ložnice");
  await page.getByRole("button", { name: "Uložit změny" }).click();
  await expect(page.getByRole("heading", { name: "Ložnice" })).toBeVisible();

  // odeslat k objednání — dvojtap potvrzení, jen vpřed
  await page.getByRole("button", { name: "Odeslat k objednání" }).click();
  await page.getByRole("button", { name: "Potvrdit — nejde vrátit zpět" }).click();
  await expect(page.locator(".status-badge").first()).toHaveText("K objednání");
  await expect(page.getByRole("button", { name: "Odeslat k objednání" })).toHaveCount(0);

  await page.getByRole("button", { name: /Odhlásit/ }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("admin: objedná, vidí počty kusů, exporty a statistiky", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill("999999");
  await expect(page.getByRole("link", { name: "+ Nová zakázka" })).toBeVisible();

  // seznam bez filtrů, jen hledání
  await page.getByRole("link", { name: "Seznam zakázek" }).click();
  await expect(page.locator(".chip")).toHaveCount(0);
  await page.getByLabel("Hledat v zakázkách").fill("e2e novak");
  await page.getByRole("link", { name: new RegExp(CLIENT_NAME) }).first().click();

  // počet kusů + deaktivované exporty hned pod hlavičkou
  await expect(page.getByText(/kusy \(ks = počet položek\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Tisk montážního listu" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export JackWest" })).toBeDisabled();

  // objednat (dvojtap)
  await page.getByRole("button", { name: "Označit jako objednáno" }).click();
  await page.getByRole("button", { name: "Potvrdit — nejde vrátit zpět" }).click();
  await expect(page.locator(".status-badge").first()).toHaveText("Objednáno");

  // statistiky: aspoň 1 vyměřeno a 1 objednáno v aktuálním měsíci
  await page.goto("/statistiky");
  const zalozeno = page.locator(".stats-total").first().locator(".stats-total-num");
  const objednano = page.locator(".stats-total").nth(1).locator(".stats-total-num");
  await expect
    .poll(async () => Number(await zalozeno.textContent()), { timeout: 10_000 })
    .toBeGreaterThan(0);
  expect(Number(await objednano.textContent())).toBeGreaterThan(0);
});
