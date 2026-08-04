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
  await expect(page.getByText("povinný údaj")).toBeVisible(); // legenda hvězdiček
  await expect(page.locator("#o-montage")).toHaveCount(0);
  await expect(page.locator("#o-delivery")).toHaveCount(0);

  // technik ve výběru „Stávající" nemá úpravy ani mazání zákazníků (jen admin)
  await page.getByRole("tab", { name: "Stávající" }).click();
  await expect(page.getByLabel("Vyhledat zákazníka")).toBeVisible();
  await expect(page.getByRole("button", { name: /Smazat zákazníka/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Nový zákazník" }).click();
  await page.getByLabel("Firma / jméno a příjmení").fill(CLIENT_NAME);
  await page.locator("#c-phone").fill("777123456");
  await page.getByLabel("Adresa").fill("Testovací 12, Praha");

  // adresa i e-mail jsou povinné — bez e-mailu se zakázka nezaloží
  await page.getByRole("button", { name: "Založit zakázku" }).click();
  await expect(page.getByText("Vyplňte e-mail.")).toBeVisible();
  await page.getByLabel("E-mail").fill("novak@example.com");

  // místo montáže je defaultně shodné s adresou zákazníka (pole skryté)
  await expect(page.locator("#o-address")).toHaveCount(0);
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

  // regrese: obsah na plnou šířku viewportu (auto-margin bug ve flexu)
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.querySelector(".page")!.getBoundingClientRect().width,
  }));
  expect(widths.page).toBeGreaterThanOrEqual(widths.viewport - 1);

  // formulář: legenda povinných polí + místnost jako první volba
  await expect(page.getByText("povinný údaj")).toBeVisible();
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

  // podpis zákazníka: fullscreen pad → tah prstem → uložit → malý štítek
  await page.getByRole("button", { name: /^Podepsat/ }).click();
  await expect(page.getByRole("dialog", { name: "Podpis zákazníka" })).toBeVisible();
  await expect(page.getByText("Otočte telefon na šířku")).toBeVisible(); // mobilní viewport = na výšku
  await expect(page.getByRole("button", { name: "Uložit podpis" })).toBeDisabled();
  const sigBox = (await page.locator(".signature-canvas").boundingBox())!;
  await page.mouse.move(sigBox.x + 30, sigBox.y + sigBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sigBox.x + 110, sigBox.y + sigBox.height / 2 - 40, { steps: 6 });
  await page.mouse.move(sigBox.x + 190, sigBox.y + sigBox.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Uložit podpis" }).click();
  await expect(page.getByText("✓ Podepsáno")).toBeVisible();

  // technik nemá mazání zakázky (jen admin)
  await expect(page.getByRole("button", { name: /Smazat zakázku/ })).toHaveCount(0);

  // připraveno k objednání — dvojtap potvrzení, jen vpřed
  await page.getByRole("button", { name: "Připraveno k objednání" }).click();
  await page.getByRole("button", { name: "Potvrdit — nejde vrátit zpět" }).click();
  await expect(page.locator(".status-badge").first()).toHaveText("K objednání");
  await expect(page.getByRole("button", { name: "Připraveno k objednání" })).toHaveCount(0);

  await page.getByRole("button", { name: /Odhlásit/ }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("admin: objedná, vidí počty kusů, exporty a statistiky", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill("999999");
  await expect(page.getByRole("link", { name: "+ Nová zakázka" })).toBeVisible();

  // seznam: taby Vše / Rozpracované / K objednání (Vše default) + hledání
  await page.getByRole("link", { name: "Zakázky" }).click();
  await expect(page.getByRole("tab", { name: "Vše" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Rozpracované" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "K objednání" })).toBeVisible();
  await page.getByLabel("Hledat v zakázkách").fill("e2e novak");
  // štítek podpisu je vidět už v seznamu (zakázka podepsaná z technik testu)
  const card = page.getByRole("link", { name: new RegExp(CLIENT_NAME) }).first();
  await expect(card).toContainText("✓ Podepsáno");
  await card.click();

  // rámeček exportů (počet kusů + deaktivovaní výrobci) je na spodu stránky
  await expect(page.getByText(/kusy \(ks = počet položek\)/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Export JackWest" })).toBeDisabled();
  const boxY = await page
    .locator(".admin-actions")
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  const listY = await page
    .locator(".room-section")
    .first()
    .evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  expect(boxY).toBeGreaterThan(listY);

  // xlsx export je odstraněný — žádné tlačítko, routa 404
  const orderId = page.url().split("/zakazky/")[1]!;
  await expect(page.getByRole("button", { name: /xlsx/ })).toHaveCount(0);
  expect((await page.request.get(`/export/montazni-list/${orderId}`)).status()).toBe(404);

  // PDF export: zamčený, dokud chybí exportní údaje (podpis už je z technik testu)
  const pdfButton = page.getByRole("button", { name: /Export PDF/ });
  await expect(pdfButton).toBeDisabled();
  await expect(
    page.getByText(/Doplňte nejdřív: číslo montáže, číslo zakázky, číslo faktury, termín dodání/),
  ).toBeVisible();

  // REGRESE (hlášeno z produkce): povinná pole karty zákazníka se hlídají
  // PŘED odesláním — dřív prošel PATCH zakázky, karta spadla na validaci
  // a druhý pokus o uložení skončil falešným 409 „upravil někdo jiný".
  await page.getByRole("button", { name: "Upravit ✎" }).click();
  await page.locator("#c-address").fill("");
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(page.getByText("Vyplňte adresu.")).toBeVisible();
  await page.locator("#c-address").fill("Testovací 12, Praha");
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(page.locator("#c-address")).toHaveCount(0); // editor se zavřel, žádný 409

  // údaje pro export: samostatný formulář pod PDF tlačítkem; uložit jde i rozpracované
  await page.getByRole("button", { name: "Údaje pro export ✎" }).click();
  await page.locator("#x-montage").fill("E2E-MON-1");
  await page.locator("#x-number").fill("E2E-ZAK-1");
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(page.locator("#x-montage")).toHaveCount(0);
  await expect(pdfButton).toBeDisabled(); // pořád nekompletní
  await expect(page.getByText(/Doplňte nejdřív: číslo faktury, termín dodání/)).toBeVisible();

  await page.getByRole("button", { name: "Údaje pro export ✎" }).click();
  await page.locator("#x-invoice").fill("E2E-FA-1");
  await page.locator("#x-delivery").fill("2026-08-20");
  await page.locator("#x-price-ex").fill("10 000 Kč");
  await page.locator("#x-price-vat").fill("2 100 Kč");
  await page.locator("#x-price-montage").fill("1 500 Kč");
  await page.locator("#x-price-total").fill("13 600 Kč");
  await page.locator("#x-price-deposit").fill("9 520 Kč");
  await page.locator("#x-price-balance").fill("4 080 Kč");
  await page.locator("#x-montage-by").fill("Jakub Svoboda");
  await page.getByRole("button", { name: "Uložit" }).click();
  await expect(pdfButton).toBeEnabled();

  const pdfRes = await page.request.get(`/export/montazni-list-pdf/${orderId}`);
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toBe("application/pdf");
  expect((await pdfRes.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // objednat (dvojtap)
  await page.getByRole("button", { name: "Označit jako objednáno" }).click();
  await page.getByRole("button", { name: "Potvrdit — nejde vrátit zpět" }).click();
  await expect(page.locator(".status-badge").first()).toHaveText("Objednáno");

  // statistiky: jen měsíc (žádný týden), „Podle uživatelů", nenulové počty
  await page.goto("/statistiky");
  await expect(page.getByRole("tab", { name: "Týden" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Podle uživatelů" })).toBeVisible();
  await expect(page.getByText(/Vyměřeno = založení/)).toHaveCount(0);
  const zalozeno = page.locator(".stats-total").first().locator(".stats-total-num");
  const objednano = page.locator(".stats-total").nth(1).locator(".stats-total-num");
  await expect
    .poll(async () => Number(await zalozeno.textContent()), { timeout: 10_000 })
    .toBeGreaterThan(0);
  expect(Number(await objednano.textContent())).toBeGreaterThan(0);

  // admin smaže zakázku (dvojtap) → návrat na seznam, zakázka pryč
  await page.goto(`/zakazky/${orderId}`);
  await page.getByRole("button", { name: /Smazat zakázku/ }).click();
  await page.getByRole("button", { name: /Opravdu smazat/ }).click();
  await expect(page).toHaveURL(/\/zakazky$/);
  await page.getByLabel("Hledat v zakázkách").fill(CLIENT_NAME);
  await expect(page.getByRole("link", { name: new RegExp(CLIENT_NAME) })).toHaveCount(0);

  // správa zákazníků ve výběru Stávající (jen admin): tužka otevře editaci,
  // koš (dvojtap) archivuje — zákazník zmizí ze seznamu, zakázky ho drží dál
  await page.goto("/zakazky/nova");
  await page.getByRole("tab", { name: "Stávající" }).click();
  await page.getByLabel("Vyhledat zákazníka").fill(CLIENT_NAME);
  const clientRow = page.locator(".picker-row", { hasText: CLIENT_NAME });
  await expect(clientRow).toHaveCount(1);

  await clientRow.getByRole("button", { name: /Upravit zákazníka/ }).click();
  await expect(page.getByRole("dialog", { name: /Upravit zákazníka/ })).toBeVisible();
  await page.locator(".client-edit-sheet .sheet-close").click();

  await clientRow.getByRole("button", { name: /Smazat zákazníka/ }).click();
  await clientRow.getByRole("button", { name: "Opravdu?" }).click();
  await expect(page.locator(".picker-row", { hasText: CLIENT_NAME })).toHaveCount(0);
});
