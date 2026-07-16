/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
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
    },
  },
  test: {
    environment: "node",
    include: ["shared/**/*.test.ts", "server/**/*.test.ts"],
  },
});
