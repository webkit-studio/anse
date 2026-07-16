import { json, errorResponse } from "./http";

// Vstupní bod celého API — jediná funkce, uvnitř router.
// Routy resource po resource přibývají v server/routes/.
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (req.method === "GET" && path === "/api/health") {
      return json({ ok: true, ts: new Date().toISOString() });
    }

    return json({ error: "Nenalezeno" }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}
