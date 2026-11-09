import { readFileSync } from "node:fs";
import postgres from "postgres";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// S04 #5: zaměření a montáže v kalendáři. Feed jde bez přihlášení (kalendář
// cookie nepošle), přístup drží jen token v adrese. Server tu musí ukázat:
// jen přidělené zakázky, žádné ceny, bez zrušených, hotové jen měsíc zpět,
// neplatný token = stejná 404 jako neexistující adresa, přegenerování
// zneplatní starý odkaz.

const SUFFIX = Date.now();

test.describe.configure({ mode: "serial" });

/** Přímý přístup do lokální testovací DB — jen na posunutí času v auditu. */
function db() {
  try {
    process.loadEnvFile();
  } catch {
    // .env nemusí existovat (CI)
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("E2E smí sahat jen do lokální DB.");
  }
  return postgres(url, { prepare: false, max: 1 });
}

async function prihlasit(request: APIRequestContext, code: string) {
  const res = await request.post("/api/login", { data: { code } });
  expect(res.ok()).toBe(true);
}

async function zalozZakazku(
  request: APIRequestContext,
  jmeno: string,
  opts: { measured_at?: string; measured_time?: string; kind?: "nova" | "oprava"; assignee_ids?: string[] } = {},
): Promise<string> {
  const c = await request.post("/api/contacts", { data: { name: jmeno, phone: "777 000 111", place: "Brno" } });
  expect(c.status()).toBe(201);
  const contactId = ((await c.json()) as { contact: { id: string } }).contact.id;
  const o = await request.post("/api/orders", { data: { contact_id: contactId, ...opts } });
  expect(o.status()).toBe(201);
  return ((await o.json()) as { id: string }).id;
}

async function patchZakazku(request: APIRequestContext, id: string, data: Record<string, unknown>) {
  const det = (await (await request.get(`/api/orders/${id}`)).json()) as { order: { updated_at: string } };
  const res = await request.patch(`/api/orders/${id}`, {
    data: { ...data, expected_updated_at: det.order.updated_at },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

async function mujOdkaz(request: APIRequestContext): Promise<string> {
  const res = await request.post("/api/me/calendar");
  expect(res.ok()).toBe(true);
  const { url } = (await res.json()) as { url: string };
  expect(url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  // Feed se stahuje anonymně — žádná session, jako kalendář Googlu.
  return new URL(url).pathname;
}

async function stahniFeed(request: APIRequestContext, cesta: string) {
  const res = await request.get(cesta);
  return { status: res.status(), headers: res.headers(), text: await res.text() };
}

test("feed: jen přidělené zakázky, bez cen, bez zrušených, hotové jen měsíc zpět", async ({ playwright }) => {
  const jakub = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  const marek = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  const anonym = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  await prihlasit(jakub, "111111");
  await prihlasit(marek, "999999");

  const users = (await (await marek.get("/api/users/vyber")).json()) as { users: { id: string; name: string }[] };
  const marekId = users.users.find((u) => u.name === "Marek Konderla")!.id;

  // Jakubova zakázka (technik-zakladatel se přidělí sám) se zaměřením v čase
  const jmenoA = `Kal Jakub ${SUFFIX}`;
  const a = await zalozZakazku(jakub, jmenoA, { measured_at: "2026-12-03", measured_time: "08:15" });
  await patchZakazku(jakub, a, { customer_phone: "+420 602 333 444", addr_montaz: "Údolní 5, 602 00 Brno" });
  // Kancelář zadá cenu pro zákazníka — do feedu se dostat nesmí
  await patchZakazku(marek, a, { price_customer: "73 913" });

  // Jakubova oprava bez času zaměření → celodenní, s „(oprava)"
  const jmenoOprava = `Kal Oprava ${SUFFIX}`;
  await zalozZakazku(jakub, jmenoOprava, { measured_at: "2026-12-04", kind: "oprava" });

  // Zrušená Jakubova zakázka ve feedu není
  const jmenoZrusena = `Kal Zrušená ${SUFFIX}`;
  const z = await zalozZakazku(jakub, jmenoZrusena, { measured_at: "2026-12-05" });
  const zr = await jakub.post(`/api/orders/${z}/phase`, {
    data: { to: "zruseno", expected: "k_zamereni", reason: "zákazník si to rozmyslel" },
  });
  expect(zr.ok(), await zr.text()).toBe(true);

  // Zakázka přidělená jen Markovi (kancelář) — Jakub ji ve feedu nevidí
  const jmenoB = `Kal Marek ${SUFFIX}`;
  const b = await zalozZakazku(marek, jmenoB, { measured_at: "2026-12-06", measured_time: "13:00", assignee_ids: [marekId] });
  await patchZakazku(marek, b, { price_customer: "51 707", price_montage: "6 420" });

  const feedJakub = await stahniFeed(anonym, await mujOdkaz(jakub));
  expect(feedJakub.status).toBe(200);
  expect(feedJakub.headers["content-type"]).toContain("text/calendar");
  expect(feedJakub.headers["cache-control"]).toBe("no-store");
  expect(feedJakub.headers["set-cookie"]).toBeUndefined();
  const jakubText = feedJakub.text.replace(/\r\n /g, ""); // rozložit složené řádky
  expect(jakubText).toContain(`SUMMARY:Zaměření · ${jmenoA}\r\n`);
  expect(jakubText).toContain("DTSTART;TZID=Europe/Prague:20261203T081500\r\n");
  expect(jakubText).toContain("LOCATION:Údolní 5\\, 602 00 Brno\r\n");
  expect(jakubText).toContain("Telefon: +420 602 333 444");
  expect(jakubText).toContain(`/zakazky/${a}`);
  expect(jakubText).toContain(`SUMMARY:Zaměření (oprava) · ${jmenoOprava}\r\n`);
  expect(jakubText).toContain("DTSTART;VALUE=DATE:20261204\r\n");
  expect(jakubText).not.toContain(jmenoZrusena);
  expect(jakubText).not.toContain(jmenoB);
  expect(jakubText).not.toContain("73 913");
  expect(jakubText).not.toContain("73913");

  // Kancelář: taky jen přidělené, a taky bez cen
  const marekText = (await stahniFeed(anonym, await mujOdkaz(marek))).text.replace(/\r\n /g, "");
  expect(marekText).toContain(`SUMMARY:Zaměření · ${jmenoB}\r\n`);
  expect(marekText).not.toContain(jmenoA);
  expect(marekText).not.toContain("51 707");
  expect(marekText).not.toContain("6 420");

  // Hotová zakázka: 40 dní po dokončení z feedu zmizí, 5 dní po dokončení v něm je
  const sql = db();
  try {
    await sql`update orders set phase = 'hotovo' where id = ${a}`;
    const [jakubUser] = await sql`select id from users where name = 'Jakub Svoboda'`;
    await sql`
      insert into order_events (order_id, user_id, from_phase, to_phase, created_at)
      values (${a}, ${jakubUser!.id}, 'k_fakturaci', 'hotovo', now() - interval '40 days')
    `;
    const cesta = await mujOdkaz(jakub);
    expect((await stahniFeed(anonym, cesta)).text).not.toContain(`/zakazky/${a}`);
    await sql`update order_events set created_at = now() - interval '5 days' where order_id = ${a} and to_phase = 'hotovo'`;
    expect((await stahniFeed(anonym, cesta)).text).toContain(`/zakazky/${a}`);
  } finally {
    await sql.end();
  }

  await Promise.all([jakub.dispose(), marek.dispose(), anonym.dispose()]);
});

test("přegenerování zneplatní starý odkaz; neplatný token = obyčejná 404", async ({ playwright }) => {
  const jakub = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  const anonym = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  await prihlasit(jakub, "111111");

  const stary = await mujOdkaz(jakub);
  expect((await stahniFeed(anonym, stary)).status).toBe(200);

  const novy = await mujOdkaz(jakub);
  expect(novy).not.toBe(stary);
  expect((await stahniFeed(anonym, novy)).status).toBe(200);

  const odmitnuty = await stahniFeed(anonym, stary);
  expect(odmitnuty.status).toBe(404);
  // Neplatný token nejde odlišit od neexistující adresy ani tělem odpovědi.
  const neexistuje = await anonym.get("/api/neexistuje");
  expect(odmitnuty.text).toBe(await neexistuje.text());
  expect((await stahniFeed(anonym, "/api/calendar/nesmysl.ics")).status).toBe(404);
  expect((await stahniFeed(anonym, "/api/calendar/%E0%A4%A.ics")).status).toBe(404);

  // Uložený odkaz vrací GET (každý jen svůj); bez přihlášení nic
  const ulozeny = (await (await jakub.get("/api/me/calendar")).json()) as { url: string };
  expect(new URL(ulozeny.url).pathname).toBe(novy);
  expect((await anonym.get("/api/me/calendar")).status()).toBe(401);

  await Promise.all([jakub.dispose(), anonym.dispose()]);
});

test("deaktivovaný účet: feed přestane fungovat", async ({ playwright }) => {
  const marek = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  const novacek = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  const anonym = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  await prihlasit(marek, "999999");

  const res = await marek.post("/api/users", { data: { name: `E2E Kalendář ${SUFFIX}`, role: "technik" } });
  expect(res.status()).toBe(201);
  const { user } = (await res.json()) as { user: { id: string; code: string } };
  await prihlasit(novacek, user.code);
  const cesta = await mujOdkaz(novacek);
  expect((await stahniFeed(anonym, cesta)).status).toBe(200);

  expect((await marek.patch(`/api/users/${user.id}`, { data: { active: false } })).ok()).toBe(true);
  expect((await stahniFeed(anonym, cesta)).status).toBe(404);

  await Promise.all([marek.dispose(), novacek.dispose(), anonym.dispose()]);
});

async function loginUi(page: Page, code: string) {
  await page.goto("/login");
  await page.getByLabel("Přihlašovací kód").fill(code);
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}

test("technik: Zprávy → Nastavení → Kalendář a „Přidat do kalendáře“ u termínu", async ({ page }) => {
  await loginUi(page, "111111");

  // Technik vlastní Nastavení nemá — kalendář najde u Zpráv
  await page.getByRole("button", { name: /^Zprávy/ }).click();
  await page.getByRole("button", { name: "Nastavení" }).click();
  await page.getByRole("link", { name: /Kalendář/ }).click();
  await expect(page).toHaveURL(/\/nastaveni\/kalendar$/);
  await expect(page.getByRole("heading", { name: "Kalendář", exact: true })).toBeVisible();

  // Odkaz už má z API testů — přegenerovat jde po potvrzení
  const pole = page.getByLabel("Tvůj odkaz");
  await expect(pole).toHaveValue(/\/api\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  const puvodni = await pole.inputValue();
  await page.getByRole("button", { name: "Vytvořit nový odkaz" }).click();
  await page.getByRole("button", { name: "Opravdu? Starý přestane fungovat" }).click();
  await expect(pole).not.toHaveValue(puvodni);
  await expect(page.getByText(/Starý už nefunguje/)).toBeVisible();

  // Jedna událost ke stažení přímo z detailu zakázky
  const jmeno = `Kal Detail ${SUFFIX}`;
  const id = await zalozZakazku(page.request, jmeno, { measured_at: "2026-12-10", measured_time: "10:00" });
  await page.goto(`/zakazky/${id}`);
  const odkaz = page.getByRole("link", { name: "Přidat zaměření do kalendáře" });
  await expect(odkaz).toHaveAttribute("href", `/api/orders/${id}/kalendar/zamereni.ics`);
  // montáž zatím termín nemá → tlačítko u ní není
  await expect(page.getByRole("link", { name: "Přidat termín montáže do kalendáře" })).toHaveCount(0);

  const [download] = await Promise.all([page.waitForEvent("download"), odkaz.click()]);
  expect(download.suggestedFilename()).toMatch(/^zamereni-kal-detail-\d+\.ics$/);
  const ics = readFileSync((await download.path())!, "utf8").replace(/\r\n /g, "");
  expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
  expect(ics).toContain(`UID:zamereni-${id}@anse\r\n`);
  expect(ics).toContain("DTSTART;TZID=Europe/Prague:20261210T100000\r\n");
  expect(ics).not.toContain("X-WR-CALNAME");
});

test.describe("kancelář (desktop)", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

  test("Nastavení má kartu Kalendář; technik cizí .ics nedostane", async ({ page, playwright }) => {
    await loginUi(page, "999999");
    await page.goto("/nastaveni");
    await page.getByRole("link", { name: /Kalendář/ }).click();
    await expect(page).toHaveURL(/\/nastaveni\/kalendar$/);
    await expect(page.getByRole("heading", { name: "Kalendář", exact: true })).toBeVisible();

    // zakázka jen pro kancelář → technik dostane 404, kancelář soubor
    const users = (await (await page.request.get("/api/users/vyber")).json()) as {
      users: { id: string; name: string }[];
    };
    const marekId = users.users.find((u) => u.name === "Marek Konderla")!.id;
    const id = await zalozZakazku(page.request, `Kal Cizí ${SUFFIX}`, {
      measured_at: "2026-12-11",
      assignee_ids: [marekId],
    });
    const kancelar = await page.request.get(`/api/orders/${id}/kalendar/zamereni.ics`);
    expect(kancelar.status()).toBe(200);
    expect(kancelar.headers()["content-disposition"]).toMatch(/filename="zamereni-kal-cizi-\d+\.ics"/);

    const jakub = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
    await prihlasit(jakub, "111111");
    expect((await jakub.get(`/api/orders/${id}/kalendar/zamereni.ics`)).status()).toBe(404);
    expect((await jakub.get(`/api/orders/${id}/kalendar/montaz.ics`)).status()).toBe(404);
    await jakub.dispose();
  });
});
