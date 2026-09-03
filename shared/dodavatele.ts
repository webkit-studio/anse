// Dodavatelé stínicí techniky, jejichž konfigurátory aplikace zrcadlí.
//
// Klíč je prefix v `konfig_key` (např. „suys:C-SC_01" → „suys"). Web je
// domovská stránka výrobce; kancelář z ní ověřuje, co technik naměřil, a
// technik si z ní bere podklady, které v návodech nejsou. Adresy jsou ověřené
// (vracejí 200), ne odhadnuté — u Nevy pozor, česká mutace na /cs neexistuje,
// kořen je dvojjazyčný.

export type DodavatelKlic = "jackwest" | "suys" | "neva";

export interface Dodavatel {
  nazev: string;
  web: string;
}

export const DODAVATELE: Record<DodavatelKlic, Dodavatel> = {
  jackwest: { nazev: "Jack West", web: "https://www.jackwest.cz" },
  suys: { nazev: "SUYS", web: "https://www.suys.cz/cs" },
  neva: { nazev: "Neva", web: "https://www.neva.eu" },
};

/** Dodavatel podle `konfig_key` („suys:C-SC_01" → SUYS). */
export function dodavatelZKlice(konfigKey?: string | null): Dodavatel | undefined {
  if (!konfigKey) return undefined;
  const prefix = konfigKey.split(":")[0] as DodavatelKlic;
  return DODAVATELE[prefix];
}
