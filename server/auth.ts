import { SignJWT, jwtVerify } from "jose";
import type { Role, SessionUser } from "../shared/types";
import { sql } from "./db";
import { ApiError } from "./http";

const COOKIE_NAME = "anse_session";
const SESSION_DAYS = 7;
/** Klouzavá obnova: nový token, když zbývá méně než polovina platnosti. */
const RENEW_BELOW_S = (SESSION_DAYS * 24 * 3600) / 2;

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new ApiError(500, "Server není nakonfigurován (JWT_SECRET).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role })
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
}

export async function verifySessionToken(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.name !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return {
      user: { id: payload.sub, name: payload.name, role: payload.role as Role },
      exp: payload.exp ?? 0,
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
  return `${COOKIE_NAME}=${token}; Max-Age=${SESSION_DAYS * 24 * 3600}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSessionCookie(req: Request): string {
  const secure = isHttps(req) ? "; Secure" : "";
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function shouldRenew(session: VerifiedSession): boolean {
  return session.exp - Date.now() / 1000 < RENEW_BELOW_S;
}

// ---------------------------------------------------------------------------
// Aktivnost uživatelů — cache 60 s. Deaktivovaný uživatel vypadne do minuty
// i s platným tokenem.
// ---------------------------------------------------------------------------

interface CachedUser {
  role: Role;
  name: string;
  /** Čte se z cache, ne z tokenu — po změně adresy by v tokenu zůstala stará. */
  email: string;
  active: boolean;
}

let usersCache: { at: number; byId: Map<string, CachedUser> } | null = null;

export async function activeUser(id: string): Promise<CachedUser | null> {
  if (!usersCache || Date.now() - usersCache.at > 60_000) {
    const rows = await sql()`select id, name, role, email, active from users`;
    usersCache = {
      at: Date.now(),
      byId: new Map(
        rows.map((r) => [
          r.id as string,
          { role: r.role, name: r.name, email: String(r.email ?? ""), active: r.active },
        ]),
      ),
    };
  }
  const user = usersCache.byId.get(id);
  return user && user.active ? user : null;
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

  const [user] = await db`
    select id, name, role from users where code = ${code} and active = true
  `;

  await db`insert into login_attempts (ip, success) values (${ip}, ${Boolean(user)})`;

  if (!user) {
    throw new ApiError(401, "Neplatný kód.");
  }

  const sessionUser: SessionUser = { id: user.id, name: user.name, role: user.role };
  return { user: sessionUser, token: await signSession(sessionUser) };
}
