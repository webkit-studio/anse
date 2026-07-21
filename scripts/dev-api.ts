// Lokální API server pro vývoj a E2E — stejný handler jako Netlify funkce,
// bez Netlify CLI. Vite dev server na něj proxuje /api.
import { createServer } from "node:http";
import { handle } from "../server/handler";
import exportHandler from "../netlify/functions/export";
import { loadEnv } from "./lib/env";

loadEnv();

const PORT = Number(process.env.API_PORT ?? 8788);

createServer(async (req, res) => {
  try {
    // Host z hlavičky (vite proxy ho zachovává) — jinak by neseděl CSRF Origin check
    const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url ?? "/"}`;
    const method = req.method ?? "GET";
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    let body: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      body = Buffer.concat(chunks);
    }
    const request = new Request(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : undefined,
    });
    // /export/* obsluhuje oddělená funkce (jako na Netlify)
    const response = new URL(url).pathname.startsWith("/export/")
      ? await exportHandler(request)
      : await handle(request);
    // set-cookie nesmí projít přes entries() — víc cookies by se slepilo čárkou
    const outHeaders: Record<string, string | string[]> = {};
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") outHeaders[key] = value;
    });
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length > 0) outHeaders["set-cookie"] = setCookies;
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Neočekávaná chyba serveru." }));
  }
}).listen(PORT, () => {
  console.log(`API dev server běží na http://localhost:${PORT}`);
});
