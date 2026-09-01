/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, cpSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAVODY_DIR = fileURLToPath(new URL("./navody", import.meta.url));
const NAVODY_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

/**
 * Návody dodavatele (manifesty + výkresy, ~27 MB) se servírují staticky:
 * v dev přímo z navody/, při buildu se kopírují do dist/navody (Netlify je
 * pak obslouží před SPA fallbackem). Do public/ nepatří — je to obsah, ne UI.
 */
function navodyStatic(): Plugin {
  return {
    name: "navody-static",
    configureServer(server) {
      server.middlewares.use("/navody", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0]!);
        const file = path.normalize(path.join(NAVODY_DIR, rel));
        const ext = path.extname(file);
        if (!file.startsWith(NAVODY_DIR) || !NAVODY_TYPES[ext] || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        res.setHeader("content-type", NAVODY_TYPES[ext]!);
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(NAVODY_DIR)) {
        cpSync(NAVODY_DIR, path.join("dist", "navody"), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), navodyStatic()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // lokální vývoj: API běží přes `npm run dev:api` na 8788.
      // changeOrigin: false zachovává Host hlavičku (localhost:5173),
      // aby seděl CSRF Origin check v server/router.ts.
      "/api": { target: "http://localhost:8788", changeOrigin: false },
      // export montážního listu obsluhuje stejný dev API server (oddělená funkce)
      "/export": { target: "http://localhost:8788", changeOrigin: false },
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
  },
});
