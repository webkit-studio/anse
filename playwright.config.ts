import { defineConfig, devices } from "@playwright/test";

// Smoke test celého flow na mobilním viewportu proti lokálnímu Postgresu.
// Vyžaduje .env s DATABASE_URL (viz CLAUDE.md) a proběhlé migrace + seed.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    ...devices["Pixel 7"],
    locale: "cs-CZ",
    // Předinstalované Chromium v prostředí (bez stahování přes playwright install)
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:8788/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
