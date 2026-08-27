import type { SessionUser } from "../shared/types";
import {
  activeUser,
  clearSessionCookie,
  clientIp,
  readSessionCookie,
  sessionCookie,
  shouldRenew,
  signSession,
  verifySessionToken,
} from "./auth";
import { errorResponse, json, withCookie } from "./http";
import { checkCsrf, matchRoute, requireOffice, type Ctx, type Route } from "./router";
import { authRoutes } from "./routes/auth-routes";
import { contactRoutes } from "./routes/contacts";
import { itemRoutes } from "./routes/items";
import { notificationRoutes } from "./routes/notifications";
import { orderRoutes } from "./routes/orders";
import { photoRoutes } from "./routes/photos";
import { productTypeRoutes } from "./routes/product-types";
import { roomRoutes } from "./routes/rooms";
import { settingsRoutes } from "./routes/settings";
import { statsRoutes } from "./routes/stats";
import { userRoutes } from "./routes/users";
import { makeRoute } from "./router";

const routes: Route[] = [
  makeRoute("GET", "/api/health", async () => json({ ok: true, ts: new Date().toISOString() }), {
    isPublic: true,
  }),
  ...authRoutes,
  ...orderRoutes,
  ...itemRoutes,
  ...contactRoutes,
  ...photoRoutes,
  ...notificationRoutes,
  ...roomRoutes,
  ...productTypeRoutes,
  ...userRoutes,
  ...settingsRoutes,
  ...statsRoutes,
];

/** Placeholder pro public routy — handlery public rout ctx.user nečtou. */
const ANONYMOUS: SessionUser = { id: "", name: "", role: "technik" };

// Vstupní bod celého API — jediná Netlify funkce, uvnitř router.
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    checkCsrf(req);

    const matched = matchRoute(routes, req.method, path);
    if (!matched) return json({ error: "Nenalezeno." }, { status: 404 });

    let ctx: Ctx = { user: ANONYMOUS, ip: clientIp(req) };
    let renewedCookie: string | null = null;

    if (!matched.route.isPublic) {
      const token = readSessionCookie(req);
      const session = token ? await verifySessionToken(token) : null;
      if (!session) {
        return json({ error: "Přihlaste se prosím." }, { status: 401 });
      }
      // Role a jméno se berou z DB (cache 60 s) — deaktivace/změna role platí
      // do minuty i s dřív vydaným tokenem.
      const current = await activeUser(session.user.id);
      if (!current) {
        return withCookie(
          json({ error: "Přihlášení už není platné." }, { status: 401 }),
          clearSessionCookie(req),
        );
      }
      ctx = {
        user: { id: session.user.id, name: current.name, role: current.role },
        ip: clientIp(req),
      };
      if (matched.route.officeOnly) requireOffice(ctx);
      if (shouldRenew(session)) {
        renewedCookie = sessionCookie(req, await signSession(ctx.user));
      }
    }

    let res = await matched.route.handler(req, ctx, matched.params);
    if (renewedCookie) res = withCookie(res, renewedCookie);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
