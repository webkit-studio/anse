import { expect, test } from "@playwright/test";

// Celý M1 flow na mobilu: login → zakázka → položka (podmíněná pole,
// blokující pravidlo, info o ploše) → duplikace → stavy dle rolí.

const CLIENT_NAME = `E2E Novák ${Date.now()}`;

test.describe.configure({ mode: "serial" });

test("technik: založí zakázku s položkou a předá k objednání", async ({ page }) => {
  // login technika
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Přihlašovací kód").fill("111111");
  await expect(page.getByRole("link", { name: "+ Nová zakázka" })).toBeVisible();

  // nová zakázka s novým klientem
  await page.getByRole("link", { name: "+ Nová zakázka" }).click();
  await page.getByLabel("Firma / jméno a příjmení").fill(CLIENT_NAME);
  await page.getByLabel("Adresa").fill("Testovací 12, Praha");
  await page.getByRole("button", { name: "Založit zakázku" }).click();

  // detail: stav Rozpracovaná, adresa převzatá z klienta
  await expect(page.getByRole("heading", { name: CLIENT_NAME })).toBeVisible();
  await expect(page.locator(".status-badge")).toHaveText("Rozpracovaná");
  await expect(page.getByText("Testovací 12, Praha")).toBeVisible();

  // přidat produkt: místnost + typ
  await page.getByRole("link", { name: "+ Přidat produkt" }).click();
  await page.getByRole("button", { name: "Kuchyně" }).click();
  await expect(page.getByRole("button", { name: /Plissé žaluzie/ })).toBeDisabled();
  await page.getByRole("button", { name: /Okenní sítě/ }).click();

  // šířka má autofocus a numerickou klávesnici
  const sirka = page.locator("#f-sirka");
  await expect(sirka).toBeFocused();
  await expect(sirka).toHaveAttribute("inputmode", "numeric");

  // malé rozměry → info o minimální ploše (nezablokuje)
  await sirka.fill("500");
  await page.locator("#f-vyska").fill("500");
  await expect(page.getByText("Plocha je pod minimálním účtovaným rozměrem 0,8 m².")).toBeVisible();

  // podmíněné pole RAL: objeví se až s volbou RAL a přepne hlášku na 2 m²
  await expect(page.locator("#f-ral")).toHaveCount(0);
  await page.locator("#f-barva_profilu").selectOption("RAL");
  await expect(page.locator("#f-ral")).toBeVisible();
  await expect(page.getByText("V barvě RAL je minimální účtovaný rozměr 2 m².")).toBeVisible();
  await page.locator("#f-ral").fill("7035");

  await page.locator("#f-typ_uchyceni").selectOption("STANDARD");

  // ořez lemu Ano → uložení blokuje chybějící poznámka
  await page.locator("#f-orez_lemu").selectOption("Ano");
  await page.getByRole("button", { name: "Uložit položku" }).click();
  await expect(page.getByText("Uveďte do poznámky, která strana sítě se ořezává.")).toBeVisible();
  await expect(page).toHaveURL(/polozka\/nova/);

  // s poznámkou projde
  await page.locator("#f-note").fill("ořez vpravo");
  await page.getByRole("button", { name: "Uložit položku" }).click();
  await expect(page.getByRole("heading", { name: "Kuchyně" })).toBeVisible();
  await expect(page.locator(".item-card")).toHaveCount(1);
  await expect(page.locator(".item-card-summary").first()).toContainText("500 × 500 mm");

  // duplikace 1 tapem
  await page.getByRole("button", { name: "Duplikovat položku" }).first().click();
  await expect(page.locator(".item-card")).toHaveCount(2);

  // stav → K objednání; technik nevidí přechod na Objednáno
  await page.getByRole("button", { name: "K objednání →" }).click();
  await expect(page.locator(".status-badge").first()).toHaveText("K objednání");
  await expect(page.getByRole("button", { name: "Objednáno →" })).toHaveCount(0);

  // odhlásit
  await page.getByRole("button", { name: /Odhlásit/ }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("admin: najde zakázku, objedná a vidí deaktivované exporty", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill("999999");
  await expect(page.getByRole("link", { name: "+ Nová zakázka" })).toBeVisible();

  // hledání s diakritikou (novak → Novák)
  await page.goto("/zakazky?search=e2e novak");
  await page.getByRole("link", { name: new RegExp(CLIENT_NAME) }).first().click();

  // admin: K objednání → Objednáno
  await expect(page.locator(".status-badge").first()).toHaveText("K objednání");
  await page.getByRole("button", { name: "Objednáno →" }).click();
  await expect(page.locator(".status-badge").first()).toHaveText("Objednáno");

  // deaktivovaná tlačítka exportů a tisku
  await expect(page.getByRole("button", { name: "Tisk montážního listu" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export JackWest" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export Neva" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export Susy" })).toBeDisabled();
});
