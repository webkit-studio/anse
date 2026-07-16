// Načtení .env pro lokální skripty (Node 20.12+ má loadEnvFile vestavěné).
// V Netlify/GitHub Actions jsou proměnné v prostředí — soubor chybět smí.
export function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // .env neexistuje — v pořádku
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Chybí env proměnná ${name} (viz .env.example).`);
    process.exit(1);
  }
  return value;
}
