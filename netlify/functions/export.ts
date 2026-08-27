import { activeUser, readSessionCookie, verifySessionToken } from "../../server/auth";
import { buildDodavatelXml } from "../../server/export/dodavatel-xml";
import { buildMontazniListPdf } from "../../server/export/montazni-list-pdf";
import { errorResponse, json } from "../../server/http";

// Oddělený entrypoint (pdf-lib + embedovaný font nesmí nafouknout bundle hlavní
// api funkce). Montážní list i export pro dodavatele dělá jen kancelář;
// kompletnost dat (faktura, podpis) hlídá builder.
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
      if (user.role !== "kancelar") {
        return json({ error: "Montážní list může vystavit jen kancelář." }, { status: 403 });
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

    const xml = /\/export\/dodavatel-xml\/([0-9a-f-]{36})\/?$/.exec(new URL(req.url).pathname);
    if (xml) {
      if (user.role !== "kancelar") {
        return json({ error: "Export pro dodavatele může udělat jen kancelář." }, { status: 403 });
      }
      const { xml: body, filename } = await buildDodavatelXml(xml[1]!);
      return new Response(body, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
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
