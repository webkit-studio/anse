// Levný rate-limit v paměti instance funkce (S04, kalendář). Počítá jen
// neúspěchy (neplatný token) per IP. Na Netlify žije jen v teplé instanci —
// je to pojistka navíc, ne hlavní ochrana: token má 256 bitů a hádat ho
// nejde ani bez limitu. Přihlášení má vlastní limit v DB (server/auth.ts).

export interface LimitPokusu {
  /** Je IP právě zablokovaná? */
  blokovano(ip: string): boolean;
  /** Zapíše neúspěch. */
  neuspech(ip: string): void;
}

export function limitPokusu(max: number, oknoMs: number, now: () => number = Date.now): LimitPokusu {
  const pokusy = new Map<string, { n: number; od: number }>();

  function aktualni(ip: string) {
    const p = pokusy.get(ip);
    if (p && now() - p.od > oknoMs) {
      pokusy.delete(ip);
      return undefined;
    }
    return p;
  }

  return {
    blokovano(ip) {
      return (aktualni(ip)?.n ?? 0) >= max;
    },
    neuspech(ip) {
      const p = aktualni(ip);
      if (p) {
        p.n += 1;
        return;
      }
      // Pojistka proti nafouknutí paměti při skenu z mnoha adres.
      if (pokusy.size >= 10_000) pokusy.clear();
      pokusy.set(ip, { n: 1, od: now() });
    },
  };
}
