import { SignJWT, jwtVerify } from "jose";
import type { Role, SessionUser } from "../shared/types";
import { sql } from "./db";
import { ApiError } from "./http";

const COOKIE_NAME = "anse_session";
/** L01 #6: technik se přihlásí jednou a dlouho to nemusí řešit. Bezpečnost
 *  drží odvolání přes session_version (reset kódu, deaktivace), ne krátká
 *  platnost. */
export const SESSION_DAYS = 90;
const SESSION_S = SESSION_DAYS * 24 * 3600;
/** Klouzavá obnova: nový token, když zbývá méně než polovina platnosti. */
const RENEW_BELOW_S = SESSION_S / 2;

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError(500, "Server není nakonfigurován (JWT_SECRET).");
  }
  return new TextEncoder().encode(secret);
}

/**
 * `sv` = verze přihlášení uživatele (users.session_version) v okamžiku vydání.
 * Reset kódu nebo deaktivace verzi v DB zvýší a starší tokeny přestanou platit.
 */
export async function signSession(user: SessionUser, sessionVersion: number): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export interface VerifiedSession {
  user: SessionUser;
  /** Unix sekundy expirace — pro klouzavou obnovu. */
  exp: number;
  /** Verze přihlášení z tokenu. Token vydaný před L01 ji nemá → 0. */
  sv: number;
}

export async function verifySessionToken(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.role !== "string") {
      return null;
    }
    // Chybějící sv = token z doby před L01 (platí jako verze 0, nasazení nikoho
    // neodhlásí). Přítomné, ale nesmyslné sv neprojde.
    const sv = payload.sv ?? 0;
    if (typeof sv !== "number" || !Number.isInteger(sv) || sv < 0) return null;
    return {
      user: { id: payload.sub, name: payload.name, role: payload.role as Role },
      exp: payload.exp ?? 0,
      sv,
    };
  } catch {
    return null;
  }
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

function isHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export function sessionCookie(req: Request, token: string): string {
  const secure = isHttps(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_S}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSessionCookie(req: Request): string {
  const secure = isHttps(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function shouldRenew(session: VerifiedSession): boolean {
  return session.exp - Date.now() / 1000 < RENEW_BELOW_S;
}

// ---------------------------------------------------------------------------
// Aktivnost uživatelů — cache 60 s. Deaktivovaný uživatel i odvolané přihlášení
// (reset kódu) vypadnou do minuty i s platným tokenem; na instanci, která změnu
// provedla, hned (invalidateUsersCache).
// ---------------------------------------------------------------------------

export interface CachedUser {
  role: Role;
  name: string;
  /** Čte se z cache, ne z tokenu — po změně adresy by v tokenu zůstala stará. */
  email: string;
  active: boolean;
  /** users.session_version — tokeny s nižší verzí neplatí. */
  sessionVersion: number;
}

/** Postgres „undefined_column": migrace ještě nedoběhla. */
function isMissingColumn(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "42703";
}

/**
 * Dotaz se session_version, a když sloupec ještě není (kód v produkci před
 * migrací 018, pipeline krok 3), stejný dotaz bez něj — verze je pak 0.
 * Přihlášení tak na novém schématu nestojí.
 */
async function withSessionVersion<T>(
  query: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await query();
  } catch (err) {
    if (isMissingColumn(err)) return fallback();
    throw err;
  }
}

let usersCache: { at: number; byId: Map<string, CachedUser> } | null = null;

export async function activeUser(id: string): Promise<CachedUser | null> {
  if (!usersCache || Date.now() - usersCache.at > 60_000) {
    const db = sql();
    const rows = await withSessionVersion(
      () => db`select id, name, role, email, active, session_version from users`,
      () => db`select id, name, role, email, active, 0 as session_version from users`,
    );
    usersCache = {
      at: Date.now(),
      byId: new Map(
        rows.map((r) => [
          r.id as string,
          {
            role: r.role,
            name: r.name,
            email: String(r.email ?? ""),
            active: r.active,
            sessionVersion: Number(r.session_version ?? 0),
          },
        ]),
      ),
    };
  }
  const user = usersCache.byId.get(id);
  return user && user.active ? user : null;
}

/**
 * Uživatel k ověřenému tokenu: aktivní a token nese aktuální verzi přihlášení.
 * Starší verze = přihlášení odvolané resetem kódu nebo deaktivací → null.
 * Vyšší verze než v cache = cache je pozadu (přihlásil se po resetu, změnu
 * provedla jiná instance) → platí; vyšší verzi než v DB server nevydá.
 */
export async function sessionUser(session: VerifiedSession): Promise<CachedUser | null> {
  const user = await activeUser(session.user.id);
  if (!user || session.sv < user.sessionVersion) return null;
  return user;
}

export function invalidateUsersCache(): void {
  usersCache = null;
}

// ---------------------------------------------------------------------------
// Login s rate-limitem: per IP + globální pojistka (6místný prostor kódů).
// ---------------------------------------------------------------------------

const IP_WINDOW_MIN = 10;
const IP_MAX_FAILURES = 8;
const GLOBAL_MAX_FAILURES = 25;

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export async function login(req: Request, code: string): Promise<{ user: SessionUser; token: string }> {
  const db = sql();
  const ip = clientIp(req);

  const [limits] = await db`
    select
      count(*) filter (where ip = ${ip}) as ip_failures,
      count(*) as global_failures
    from login_attempts
    where success = false and attempted_at > now() - make_interval(mins => ${IP_WINDOW_MIN})
  `;
  if (Number(limits!.global_failures) >= GLOBAL_MAX_FAILURES) {
    throw new ApiError(429, "Přihlašování je dočasně uzamčené. Zkus to za 15 minut.");
  }
  if (Number(limits!.ip_failures) >= IP_MAX_FAILURES) {
    throw new ApiError(429, "Příliš mnoho pokusů. Zkus to za chvíli.");
  }

  // Verze se čte čerstvá z DB, ne z cache: po resetu kódu na jiné instanci by
  // token se starou verzí z cache hned po přihlášení zase vypadl.
  const [user] = await withSessionVersion(
    () => db`
      select id, name, role, session_version from users where code = ${code} and active = true
    `,
    () => db`
      select id, name, role, 0 as session_version from users where code = ${code} and active = true
    `,
  );

  await db`insert into login_attempts (ip, success) values (${ip}, ${Boolean(user)})`;

  if (!user) {
    throw new ApiError(401, "Neplatný kód.");
  }

  const loggedIn: SessionUser = { id: user.id, name: user.name, role: user.role };
  return { user: loggedIn, token: await signSession(loggedIn, Number(user.session_version ?? 0)) };
}
