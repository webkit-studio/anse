import { SignJWT, decodeJwt } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";

// L01 #6: přihlášení na 90 dní a jeho odvolání přes users.session_version.
// DB nahrazuje malá simulace tabulky users — testuje se skutečný handler,
// routy a auth, jen bez Postgresu.

interface FakeUser {
  id: string;
  name: string;
  role: "technik" | "kancelar";
  email: string;
  code: string;
  active: boolean;
  session_version: number;
}

const db = vi.hoisted(() => {
  const state = {
    users: new Map<string, FakeUser>(),
    /** Simulace produkce před migrací 018: sloupec session_version neexistuje. */
    missingColumn: false,
    queries: [] as string[],
    /** login_attempts — sdílený limit přihlášení a změny kódu (S05). */
    attempts: [] as { ip: string; success: boolean }[],
  };

  type Fragment = { text: string; values: unknown[] };
  const isFragment = (v: unknown): v is Fragment =>
    typeof v === "object" && v !== null && "text" in v && "values" in v;

  function row(u: FakeUser, withVersion: boolean) {
    const { session_version, ...rest } = u;
    return { ...rest, created_at: "2026-01-01", phone: "", ...(withVersion ? { session_version } : {}) };
  }

  async function run(text: string, values: unknown[]): Promise<unknown[]> {
    state.queries.push(text);
    if (state.missingColumn && text.includes("session_version") && !text.includes("0 as session_version")) {
      throw Object.assign(new Error('column "session_version" does not exist'), { code: "42703" });
    }
    if (text.includes("from login_attempts")) {
      const failures = state.attempts.filter((a) => !a.success);
      return [{ ip_failures: failures.filter((a) => a.ip === values[0]).length, global_failures: failures.length }];
    }
    if (text.includes("insert into login_attempts")) {
      state.attempts.push({ ip: values[0] as string, success: values[1] as boolean });
      return [];
    }
    if (text === "select code from users where id = $ and active") {
      const u = state.users.get(values[0] as string);
      return u && u.active ? [{ code: u.code }] : [];
    }
    if (text.startsWith("update users set code = $, session_version = session_version + 1 where id = $ and code = $")) {
      const [code, id, stored] = values as string[];
      const u = state.users.get(id!);
      if (!u || u.code !== stored) return [];
      if ([...state.users.values()].some((x) => x.id !== id && x.code === code)) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "users_code_key"'), {
          code: "23505",
          detail: `Key (code)=(${code}) already exists.`,
        });
      }
      u.code = code!;
      u.session_version += 1;
      return [{ session_version: u.session_version }];
    }
    if (text.includes("select 1 from users where code")) return [];
    if (/select id, name, role, (0 as )?session_version from users where code/.test(text)) {
      const u = [...state.users.values()].find((x) => x.code === values[0] && x.active);
      return u ? [{ id: u.id, name: u.name, role: u.role, session_version: state.missingColumn ? 0 : u.session_version }] : [];
    }
    if (text.includes("from users") && text.startsWith("select id, name, role, email, active")) {
      return [...state.users.values()].map((u) => ({
        ...row(u, false),
        session_version: state.missingColumn ? 0 : u.session_version,
      }));
    }
    if (text.startsWith("update users set")) {
      const id = values[values.length - 1] as string;
      const u = state.users.get(id);
      if (!u) return [];
      // patch z db(patch) nese hodnoty v pořadí klíčů
      const m = /update users set (.*?) where/s.exec(text)!;
      const keys = [...m[1]!.matchAll(/(\w+) = \$/g)].map((x) => x[1]!);
      keys.forEach((k, i) => ((u as unknown as Record<string, unknown>)[k] = values[i]));
      if (text.includes("session_version = session_version + 1")) u.session_version += 1;
      return [row(u, true)];
    }
    throw new Error(`Neočekávaný dotaz v testu: ${text}`);
  }

  function render(v: unknown, values: unknown[]): string {
    if (isFragment(v)) {
      values.push(...v.values);
      return v.text;
    }
    if (typeof v === "object" && v !== null && "__unsafe" in v) return String((v as { __unsafe: string }).__unsafe);
    values.push(v);
    return "$";
  }

  function fake(first: TemplateStringsArray | Record<string, unknown>, ...rest: unknown[]) {
    // db(patch) — objekt sloupců pro UPDATE
    if (!Array.isArray(first)) {
      const obj = first as Record<string, unknown>;
      return { text: Object.keys(obj).map((k) => `${k} = $`).join(", "), values: Object.values(obj) };
    }
    const values: unknown[] = [];
    const strings = first as TemplateStringsArray;
    let text = "";
    strings.forEach((s, i) => {
      text += s;
      if (i < rest.length) text += render(rest[i], values);
    });
    text = text.replace(/\s+/g, " ").trim();
    return {
      text,
      values,
      then: (ok: (r: unknown[]) => unknown, fail: (e: unknown) => unknown) => run(text, values).then(ok, fail),
    };
  }
  fake.unsafe = (s: string) => ({ __unsafe: s });

  return { state, fake };
});

vi.mock("./db", () => ({ sql: () => db.fake }));

process.env.JWT_SECRET = "test-secret-test-secret-test-secret-1234";

const { handle } = await import("./handler");
const auth = await import("./auth");

const TECHNIK = "11111111-1111-1111-1111-111111111111";
const KANCELAR = "22222222-2222-2222-2222-222222222222";
const DAY = 24 * 3600;

function seed() {
  db.state.users = new Map([
    [TECHNIK, { id: TECHNIK, name: "Jakub", role: "technik", email: "", code: "482913", active: true, session_version: 0 }],
    [KANCELAR, { id: KANCELAR, name: "Marek", role: "kancelar", email: "", code: "730164", active: true, session_version: 0 }],
  ]);
}

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET);

/** Token, jaký vydával server před L01 — bez verze přihlášení. */
async function oldToken(id: string, name: string, role: string, exp = "7d") {
  return new SignJWT({ name, role }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt().setExpirationTime(exp).sign(secret());
}

async function tokenFor(id: string, sv: number) {
  const u = db.state.users.get(id)!;
  return auth.signSession({ id, name: u.name, role: u.role }, sv);
}

function req(path: string, token: string, method = "GET") {
  return new Request(`http://localhost${path}`, { method, headers: { cookie: `anse_session=${token}` } });
}

function cookieToken(res: Response): string | null {
  const m = /anse_session=([^;]*)/.exec(res.headers.get("set-cookie") ?? "");
  return m ? m[1]! : null;
}

beforeEach(() => {
  seed();
  db.state.missingColumn = false;
  db.state.queries = [];
  db.state.attempts = [];
  auth.invalidateUsersCache();
});

describe("platnost přihlášení", () => {
  it("session cookie i JWT platí 90 dní", async () => {
    const token = await tokenFor(TECHNIK, 0);
    const { iat, exp } = decodeJwt(token);
    expect(exp! - iat!).toBe(90 * DAY);
    const cookie = auth.sessionCookie(new Request("https://anse.test/api/login"), token);
    expect(cookie).toContain(`Max-Age=${90 * DAY};`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("klouzavá obnova až ve druhé polovině platnosti a nese verzi z tokenu", async () => {
    const now = Date.now() / 1000;
    const base = { user: { id: TECHNIK, name: "Jakub", role: "technik" as const }, sv: 0 };
    expect(auth.shouldRenew({ ...base, exp: now + 46 * DAY })).toBe(false);
    expect(auth.shouldRenew({ ...base, exp: now + 44 * DAY })).toBe(true);

    db.state.users.get(TECHNIK)!.session_version = 3;
    const nearExpiry = await new SignJWT({ name: "Jakub", role: "technik", sv: 3 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(TECHNIK)
      .setIssuedAt()
      .setExpirationTime("10d")
      .sign(secret());
    const res = await handle(req("/api/me", nearExpiry));
    expect(res.status).toBe(200);
    const renewed = cookieToken(res)!;
    expect(decodeJwt(renewed).sv).toBe(3);
    expect(decodeJwt(renewed).exp! - Date.now() / 1000).toBeGreaterThan(89 * DAY);
  });
});

describe("odvolání přihlášení", () => {
  it("starý cookie bez verze funguje (verze 0) — nasazení nikoho neodhlásí", async () => {
    const token = await oldToken(TECHNIK, "Jakub", "technik");
    expect((await auth.verifySessionToken(token))?.sv).toBe(0);
    const res = await handle(req("/api/me", token));
    expect(res.status).toBe(200);
  });

  it("reset kódu kanceláří: starý cookie technika → 401 a smazaná cookie", async () => {
    const technik = await oldToken(TECHNIK, "Jakub", "technik");
    const kancelar = await tokenFor(KANCELAR, 0);
    expect((await handle(req("/api/me", technik))).status).toBe(200);

    const reset = await handle(req(`/api/users/${TECHNIK}/code`, kancelar, "POST"));
    expect(reset.status).toBe(200);
    const body = (await reset.json()) as { user: Record<string, unknown> };
    expect(body.user.code).toMatch(/^\d{6}$/);
    expect(body.user.code).not.toBe("482913");
    expect(body.user).not.toHaveProperty("session_version");
    // reset cizího kódu nemění cookie kanceláře
    expect(reset.headers.get("set-cookie")).toBeNull();

    const after = await handle(req("/api/me", technik));
    expect(after.status).toBe(401);
    // cookie se nemaže — request na cestě by jinak smazal i nově vydaný
    expect(after.headers.get("set-cookie")).toBeNull();
    // kancelář dál přihlášená
    expect((await handle(req("/api/me", kancelar))).status).toBe(200);
  });

  it("po resetu se technik novým kódem přihlásí a nový token platí", async () => {
    const kancelar = await tokenFor(KANCELAR, 0);
    const reset = await handle(req(`/api/users/${TECHNIK}/code`, kancelar, "POST"));
    const { user } = (await reset.json()) as { user: { code: string } };
    const { token } = await auth.login(new Request("http://localhost/api/login"), user.code);
    expect(decodeJwt(token).sv).toBe(1);
    expect((await handle(req("/api/me", token))).status).toBe(200);
  });

  it("kancelář si resetuje vlastní kód: ostatní zařízení odhlásí, tohle zůstane", async () => {
    const tentoTelefon = await tokenFor(KANCELAR, 0);
    const jinyPocitac = await tokenFor(KANCELAR, 0);
    const reset = await handle(req(`/api/users/${KANCELAR}/code`, tentoTelefon, "POST"));
    expect(reset.status).toBe(200);
    const novy = cookieToken(reset)!;
    expect(decodeJwt(novy).sv).toBe(1);
    expect((await handle(req("/api/me", novy))).status).toBe(200);
    expect((await handle(req("/api/me", jinyPocitac))).status).toBe(401);
  });

  it("vlastní reset s tokenem ve druhé polovině platnosti: obnova nepřepíše novou verzi", async () => {
    const stary = await new SignJWT({ name: "Marek", role: "kancelar", sv: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(KANCELAR)
      .setIssuedAt()
      .setExpirationTime("10d")
      .sign(secret());
    const reset = await handle(req(`/api/users/${KANCELAR}/code`, stary, "POST"));
    expect(reset.status).toBe(200);
    const cookies = reset.headers.getSetCookie().filter((c) => c.startsWith("anse_session="));
    expect(cookies).toHaveLength(1);
    const novy = cookieToken(reset)!;
    expect(decodeJwt(novy).sv).toBe(1);
    expect((await handle(req("/api/me", novy))).status).toBe(200);
  });

  it("změna kódu přes úpravu účtu odhlásí taky", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    const kancelar = await tokenFor(KANCELAR, 0);
    const patch = new Request(`http://localhost/api/users/${TECHNIK}`, {
      method: "PATCH",
      headers: { cookie: `anse_session=${kancelar}`, "content-type": "application/json" },
      body: JSON.stringify({ code: "918273" }),
    });
    expect((await handle(patch)).status).toBe(200);
    expect((await handle(req("/api/me", technik))).status).toBe(401);
  });

  it("deaktivace odhlásí a znovuzapnutí staré přihlášení neoživí", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    const kancelar = await tokenFor(KANCELAR, 0);
    const patch = (active: boolean) =>
      new Request(`http://localhost/api/users/${TECHNIK}`, {
        method: "PATCH",
        headers: { cookie: `anse_session=${kancelar}`, "content-type": "application/json" },
        body: JSON.stringify({ active }),
      });
    expect((await handle(patch(false))).status).toBe(200);
    expect((await handle(req("/api/me", technik))).status).toBe(401);
    expect((await handle(patch(true))).status).toBe(200);
    expect((await handle(req("/api/me", technik))).status).toBe(401);
  });

  it("úprava telefonu ani role přihlášení neodvolá", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    const kancelar = await tokenFor(KANCELAR, 0);
    const patch = new Request(`http://localhost/api/users/${TECHNIK}`, {
      method: "PATCH",
      headers: { cookie: `anse_session=${kancelar}`, "content-type": "application/json" },
      body: JSON.stringify({ phone: "606 111 222" }),
    });
    expect((await handle(patch)).status).toBe(200);
    expect(db.state.users.get(TECHNIK)!.session_version).toBe(0);
    expect((await handle(req("/api/me", technik))).status).toBe(200);
  });

  it("token s vyšší verzí než v cache: cache se dočte a verze musí sedět", async () => {
    expect((await handle(req("/api/me", await tokenFor(TECHNIK, 0)))).status).toBe(200); // naplní cache s verzí 0
    db.state.users.get(TECHNIK)!.session_version = 1; // reset proběhl na jiné instanci
    // přihlásil se novým kódem jinde → token s verzí 1, cache tu ještě drží 0
    expect((await handle(req("/api/me", await tokenFor(TECHNIK, 1)))).status).toBe(200);
    // starý token po dočtení cache neplatí
    expect((await handle(req("/api/me", await tokenFor(TECHNIK, 0)))).status).toBe(401);
  });

  it("token z budoucnosti (DB obnovená ze zálohy s nižší verzí) neplatí", async () => {
    db.state.users.get(TECHNIK)!.session_version = 1;
    expect((await handle(req("/api/me", await tokenFor(TECHNIK, 2)))).status).toBe(401);
  });

  it("nesmyslná verze v tokenu neprojde", async () => {
    for (const sv of ["1", -1, 1.5]) {
      const token = await new SignJWT({ name: "Jakub", role: "technik", sv })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(TECHNIK)
        .setExpirationTime("1d")
        .sign(secret());
      expect(await auth.verifySessionToken(token)).toBeNull();
    }
  });
});

describe("bez migrace 018", () => {
  it("přihlášení i /api/me fungují, verze je 0", async () => {
    db.state.missingColumn = true;
    const { token, user } = await auth.login(new Request("http://localhost/api/login"), "482913");
    expect(user.name).toBe("Jakub");
    expect(decodeJwt(token).sv).toBe(0);
    expect((await handle(req("/api/me", token))).status).toBe(200);
    expect((await handle(req("/api/me", await oldToken(TECHNIK, "Jakub", "technik")))).status).toBe(200);
    // opravdu šlo o záložní dotaz bez sloupce
    expect(db.state.queries.some((q) => q.includes("0 as session_version"))).toBe(true);
  });

  it("špatný kód dál vrací 401 a pokus se zapíše", async () => {
    db.state.missingColumn = true;
    await expect(auth.login(new Request("http://localhost/api/login"), "000001")).rejects.toMatchObject({ status: 401 });
    expect(db.state.queries.some((q) => q.includes("insert into login_attempts"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// S05 #7: vlastní přihlašovací kód
// ---------------------------------------------------------------------------

function zmenaKodu(token: string, body: { current: string; code: string }) {
  return new Request("http://localhost/api/me/code", {
    method: "PUT",
    headers: { cookie: `anse_session=${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function prihlaseni(code: string) {
  return new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

const neuspechy = () => db.state.attempts.filter((a) => !a.success).length;

describe("vlastní kód", () => {
  it("změna odhlásí ostatní zařízení, tohle zůstane, nový kód platí a starý ne", async () => {
    const telefon = await tokenFor(TECHNIK, 0);
    const tablet = await tokenFor(TECHNIK, 0);

    const res = await handle(zmenaKodu(telefon, { current: "482913", code: "Moje-Brana-77" }));
    expect(res.status).toBe(200);
    // kód se nikdy nevrací
    expect(await res.json()).toEqual({ ok: true });
    expect(db.state.users.get(TECHNIK)!.code).toBe("moje-brana-77");

    const novy = cookieToken(res)!;
    expect(decodeJwt(novy).sv).toBe(1);
    expect((await handle(req("/api/me", novy))).status).toBe(200);
    expect((await handle(req("/api/me", tablet))).status).toBe(401);
    expect((await handle(req("/api/me", telefon))).status).toBe(401);

    // přihlášení novým kódem bez ohledu na velikost písmen, starým ne
    expect((await handle(prihlaseni("MOJE-brana-77"))).status).toBe(200);
    const stary = await handle(prihlaseni("482913"));
    expect(stary.status).toBe(401);
    expect(await stary.json()).toEqual({ error: "Neplatný kód." });
  });

  it("slabý i obsazený kód → stejná obecná hláška; oba se počítají do pokusů", async () => {
    db.state.users.get(KANCELAR)!.code = "obsazeny-kod-9";
    const technik = await tokenFor(TECHNIK, 0);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const obsazeny = await handle(zmenaKodu(technik, { current: "482913", code: "Obsazeny-Kod-9" }));
    const slaby = await handle(zmenaKodu(technik, { current: "482913", code: "12345678" }));
    expect(obsazeny.status).toBe(400);
    expect(slaby.status).toBe(obsazeny.status);
    const a = await obsazeny.json();
    const b = await slaby.json();
    expect(a).toEqual({ error: "Tento kód nejde použít, zvol jiný.", pole: "code" });
    expect(b).toEqual(a);

    expect(neuspechy()).toBe(2);
    // kolize v DB nese kód v `detail` — do logu nesmí
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
    // nic se nezměnilo a nikoho to neodhlásilo
    expect(db.state.users.get(TECHNIK)!.code).toBe("482913");
    expect(db.state.users.get(TECHNIK)!.session_version).toBe(0);
    expect((await handle(req("/api/me", technik))).status).toBe(200);
  });

  it("bez správného současného kódu změna neprojde (400, ne 401 — appka se neodhlásí)", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    const res = await handle(zmenaKodu(technik, { current: "730164", code: "moje-brana-77" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Současný kód nesedí.", pole: "current" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(neuspechy()).toBe(1);
    expect(db.state.users.get(TECHNIK)!.code).toBe("482913");
    expect(db.state.users.get(KANCELAR)!.code).toBe("730164");
  });

  it("chyby tvaru jdou k poli a do pokusů se nepočítají", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    const kratky = await handle(zmenaKodu(technik, { current: "482913", code: "abc12" }));
    expect(await kratky.json()).toEqual({ error: "Kód musí mít aspoň 8 znaků.", pole: "code" });
    const prazdny = await handle(zmenaKodu(technik, { current: " ", code: "moje-brana-77" }));
    expect(await prazdny.json()).toEqual({ error: "Zadej současný kód.", pole: "current" });
    const stejny = await handle(zmenaKodu(technik, { current: "482913", code: "482913xx" }));
    expect(stejny.status).toBe(200);
    const zpet = await handle(zmenaKodu(cookieToken(stejny)!, { current: "482913XX", code: "482913xx" }));
    expect(await zpet.json()).toEqual({ error: "Nový kód je stejný jako současný.", pole: "code" });
    expect(neuspechy()).toBe(0);
  });

  it("limit pokusů je společný s přihlášením — oběma směry", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    // 8 neplatných přihlášení z téže IP → změna kódu i se správným kódem 429
    for (let i = 0; i < 8; i++) {
      expect((await handle(prihlaseni(`10000${i}`))).status).toBe(401);
    }
    const zablokovano = await handle(zmenaKodu(technik, { current: "482913", code: "moje-brana-77" }));
    expect(zablokovano.status).toBe(429);
    expect(db.state.users.get(TECHNIK)!.code).toBe("482913");

    // a obráceně: hádání současného kódu zablokuje přihlášení
    db.state.attempts = [];
    for (let i = 0; i < 8; i++) {
      await handle(zmenaKodu(technik, { current: `20000${i}`, code: "moje-brana-77" }));
    }
    expect(neuspechy()).toBe(8);
    expect((await handle(prihlaseni("482913"))).status).toBe(429);
  });

  it("neplatný tvar kódu při přihlášení se do pokusů nepočítá", async () => {
    const res = await handle(prihlaseni("1234567"));
    expect(res.status).toBe(400);
    expect(neuspechy()).toBe(0);
  });

  it("kancelář resetuje vlastní kód technika: odhlásí ho a vlastní kód přestane platit", async () => {
    const technik = await tokenFor(TECHNIK, 0);
    const zmena = await handle(zmenaKodu(technik, { current: "482913", code: "moje-brana-77" }));
    const technikNovy = cookieToken(zmena)!;

    const kancelar = await tokenFor(KANCELAR, 0);
    const reset = await handle(req(`/api/users/${TECHNIK}/code`, kancelar, "POST"));
    expect(reset.status).toBe(200);
    const { user } = (await reset.json()) as { user: { code: string } };
    expect(user.code).toMatch(/^\d{6}$/);

    expect((await handle(req("/api/me", technikNovy))).status).toBe(401);
    expect((await handle(prihlaseni("moje-brana-77"))).status).toBe(401);
    expect((await handle(prihlaseni(user.code))).status).toBe(200);
  });
});
