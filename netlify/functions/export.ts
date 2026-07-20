import { activeUser, readSessionCookie, verifySessionToken } from "../../server/auth";
import { buildMontazniList } from "../../server/export/montazni-list";
import { errorResponse, json } from "../../server/http";

// Oddělený entrypoint (exceljs nesmí nafouknout bundle hlavní api funkce).
// Přístup: platná session — technik i admin.
export default async (req: Request): Promise<Response> => {
  try {
    const token = readSessionCookie(req);
    const session = token ? await verifySessionToken(token) : null;
    if (!session || !(await activeUser(session.user.id))) {
      return json({ error: "Přihlaste se prosím." }, { status: 401 });
    }

    const match = /\/api\/export\/montazni-list\/([0-9a-f-]{36})\/?$/.exec(
      new URL(req.url).pathname,
    );
    if (!match) return json({ error: "Nenalezeno." }, { status: 404 });

    const { buffer, filename } = await buildMontazniList(match[1]!);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
};

export const config = { path: "/api/export/*" };
