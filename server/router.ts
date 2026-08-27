import type { z } from "zod";
import type { SessionUser } from "../shared/types";
import { ApiError } from "./http";

export interface Ctx {
  user: SessionUser;
  ip: string;
}

export type RouteHandler = (
  req: Request,
  ctx: Ctx,
  params: Record<string, string>,
) => Promise<Response>;

export interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
  /** Bez přihlášení (login, health). */
  isPublic?: boolean;
  /** Jen role kancelář. */
  officeOnly?: boolean;
}

export function makeRoute(
  method: string,
  path: string,
  handler: RouteHandler,
  opts: { isPublic?: boolean; officeOnly?: boolean } = {},
): Route {
  const keys: string[] = [];
  const pattern = new RegExp(
    "^" +
      path.replace(/:[a-zA-Z_]+/g, (m) => {
        keys.push(m.slice(1));
        return "([^/]+)";
      }) +
      "$",
  );
  return { method, pattern, keys, handler, ...opts };
}

export function matchRoute(
  routes: Route[],
  method: string,
  path: string,
): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(m[i + 1] ?? "");
    });
    return { route, params };
  }
  return null;
}

/** Parse + validace JSON body přes zod; první chybová hláška jde uživateli. */
export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(415, "Očekávám JSON.");
  }
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw new ApiError(400, "Neplatný požadavek.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? "Neplatná data.");
  }
  return parsed.data;
}

export function requireOffice(ctx: Ctx): void {
  if (ctx.user.role !== "kancelar") {
    throw new ApiError(403, "Tuto akci může provést jen kancelář.");
  }
}

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** CSRF ochrana: Origin (pokud přišel) musí sedět na host aplikace. */
export function checkCsrf(req: Request): void {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // ne-browser klienti (curl) Origin neposílají
  const reqHost = req.headers.get("x-forwarded-host") ?? new URL(req.url).host;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, "Neplatný původ požadavku.");
  }
  if (originHost !== reqHost) {
    throw new ApiError(403, "Neplatný původ požadavku.");
  }
}
