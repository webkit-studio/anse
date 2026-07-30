import { activeUser, readSessionCookie, verifySessionToken } from "../../server/auth";
import { buildMontazniListPdf } from "../../server/export/montazni-list-pdf";
import { errorResponse, json } from "../../server/http";

// Oddělený entrypoint (pdf-lib + embedovaný font nesmí nafouknout bundle hlavní
// api funkce). PDF montážního listu: jen admin — finální dokument s podpisem;
// kompletnost dat (čísla, faktura, podpis) hlídá builder.
export default async (req: Request): Promise<Response> => {
  try {
    const token = readSessionCookie(req);
    const session = token ? await verifySessionToken(token) : null;
    const user = session ? await activeUser(session.user.id) : null;
    if (!session || !user) {
      return json({ error: "Přihlaste se prosím." }, { status: 401 });
    }

    const pdf = /\/export\/montazni-list-pdf\/([0-9a-f-]{36})\/?$/.exec(new URL(req.url).pathname);
    if (pdf) {
      if (user.role !== "admin") {
        return json({ error: "PDF montážního listu může exportovat jen administrátor." }, { status: 403 });
      }
      const { buffer, filename } = await buildMontazniListPdf(pdf[1]!);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`,
          "cache-control": "no-store",
        },
      });
    }

    return json({ error: "Nenalezeno." }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
};

// Disjunktní prefix mimo /api/* — jinak by request chytala i hlavní api funkce
// (dvě funkce na překrývající se cestě = nejednoznačné routování → 404 → „unable to download").
export const config = { path: "/export/*" };
