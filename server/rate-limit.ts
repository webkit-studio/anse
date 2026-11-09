// Levný rate-limit v paměti instance funkce (S04, kalendář). Počítá jen
// neúspěchy (neplatný token) per IP, a to RŮZNÉ klíče: hádání zkouší pořád
// nové tokeny, kdežto staré předplatné po přegenerování odkazu ťuká pořád
// stejným — a z IP Googlu nebo za NAT operátora nesmí zablokovat platné
// kalendáře ostatních. Na Netlify žije jen v teplé instanci — je to pojistka
// navíc, ne hlavní ochrana: token má 256 bitů a hádat ho nejde ani bez limitu.
// Přihlášení má vlastní limit v DB (server/auth.ts).

export interface LimitPokusu {
  /** Je IP právě zablokovaná? */
  blokovano(ip: string): boolean;
  /** Zapíše neúspěch; `klic` = co se zkoušelo (stejný klíč se počítá jednou). */
  neuspech(ip: string, klic: string): void;
}

export function limitPokusu(max: number, oknoMs: number, now: () => number = Date.now): LimitPokusu {
  const pokusy = new Map<string, { klice: Set<string>; od: number }>();

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
      return (aktualni(ip)?.klice.size ?? 0) >= max;
    },
    neuspech(ip, klic) {
      const k = klic.slice(0, 64);
      const p = aktualni(ip);
      if (p) {
        if (p.klice.size < max) p.klice.add(k);
        return;
      }
      // Pojistka proti nafouknutí paměti při skenu z mnoha adres.
      if (pokusy.size >= 10_000) pokusy.clear();
      pokusy.set(ip, { klice: new Set([k]), od: now() });
    },
  };
}
