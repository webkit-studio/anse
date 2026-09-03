import jwRaw from "../podklady/data/jack-west/produkty-davka-2.json";
import nevaRaw from "../podklady/data/neva/produkty.json";
import suysRaw from "../podklady/data/suys/produkty.json";
import {
  loadAll,
  type JwCatalog,
  type KonfigProduct,
  type NevaCatalog,
  type SuysCatalog,
} from "../shared/konfigurator";

// Naměřené podklady dodavatelů se bundlí přímo do funkce (esbuild JSON import)
// a normalizují jednou na start instance. Klient je NIKDY nedostává celé —
// server servíruje jeden produkt na vyžádání (GET /api/konfigurator/:key).

let cache: Map<string, KonfigProduct> | undefined;

export function konfigProducts(): Map<string, KonfigProduct> {
  if (!cache) {
    cache = loadAll(
      jwRaw as unknown as JwCatalog,
      suysRaw as unknown as SuysCatalog,
      nevaRaw as unknown as NevaCatalog,
    );
  }
  return cache;
}

export function getKonfigProduct(key: string): KonfigProduct | undefined {
  return konfigProducts().get(key);
}
