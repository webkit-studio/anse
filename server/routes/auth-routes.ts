import { loginBody } from "../../shared/api-contracts";
import { activeUser, clearSessionCookie, login, sessionCookie } from "../auth";
import { json } from "../http";
import { makeRoute, parseBody, type Route } from "../router";

export const authRoutes: Route[] = [
  makeRoute(
    "POST",
    "/api/login",
    async (req) => {
      const body = await parseBody(req, loginBody);
      const { user, token } = await login(req, body.code);
      return json({ user }, { headers: { "set-cookie": sessionCookie(req, token) } });
    },
    { isPublic: true },
  ),

  makeRoute(
    "POST",
    "/api/logout",
    async (req) => json({ ok: true }, { headers: { "set-cookie": clearSessionCookie(req) } }),
    { isPublic: true },
  ),

  makeRoute("GET", "/api/me", async (_req, ctx) => {
    // Adresa se dobírá k session z cache uživatelů — v tokenu není, aby po
    // změně v Účtech nesvítila v Notifikacích ta stará.
    const u = await activeUser(ctx.user.id);
    return json({ user: { ...ctx.user, email: u?.email ?? "" } });
  }),
];
