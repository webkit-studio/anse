// Lokální API server pro vývoj a E2E — stejný handler jako Netlify funkce,
// bez Netlify CLI. Vite dev server na něj proxuje /api.
import { createServer } from "node:http";
import { handle } from "../server/handler";

const PORT = Number(process.env.API_PORT ?? 8788);

createServer(async (req, res) => {
  try {
    const url = `http://localhost:${PORT}${req.url ?? "/"}`;
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
    const response = await handle(
      new Request(url, { method, headers, body: body ? new Uint8Array(body) : undefined }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Neočekávaná chyba serveru." }));
  }
}).listen(PORT, () => {
  console.log(`API dev server běží na http://localhost:${PORT}`);
});
