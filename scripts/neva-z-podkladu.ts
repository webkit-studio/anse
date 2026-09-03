/* Převod dodaného podkladu Nevy (markdown tabulky) na strojově čitelný katalog.
 *
 * Neva jako jediná nemá naměřené závislosti — podklad je výpis polí a číselníků
 * z Infor CPQ. Skript proto vyrábí produkty BEZ pravidel; až přijdou naměřená,
 * doplní se sem. Spouštět: npx tsx scripts/neva-z-podkladu.ts <cesta-k-md>
 */
import { readFileSync, writeFileSync } from "node:fs";

const zdroj = process.argv[2];
if (!zdroj) throw new Error("Chybí cesta k podkladu (.md).");

/** Sekce formuláře podle prefixu klíče — podklad je nenese, konfigurátor ano. */
const SEKCE: [RegExp, string][] = [
  [/^PAK_/, "Lamely"],
  [/^SP_/, "Spodní profil"],
  [/^OVL_/, "Ovládání"],
  [/^VP_|^STF_VP_/, "Vodicí profily"],
  [/^HP_/, "Horní profil"],
  [/^KP_/, "Krycí plech"],
  [/^SIT_/, "Síť"],
  [/^ZAL_/, "Základní údaje"],
];

function sekce(code: string): string {
  for (const [re, nazev] of SEKCE) if (re.test(code)) return nazev;
  return "Ostatní";
}

function cislo(s: string): number | null {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

interface Pole {
  code: string;
  label: string;
  section: string;
  input: "select" | "text" | "number";
  required: boolean;
  min: number | null;
  max: number | null;
  options: { value: string; label: string }[];
  /** Číselník je v podkladu jen popsaný (213 hodnot RAL), ne vypsaný. */
  tbd: boolean;
}

const text = readFileSync(zdroj, "utf8");
const produkty: { code: string; name: string; fields: Pole[] }[] = [];
let aktualni: (typeof produkty)[number] | null = null;

for (const radek of text.split("\n")) {
  const nadpis = /^##\s+([^·|]+?)\s*(?:·.*)?$/.exec(radek.trim());
  if (nadpis && !/TL;DR|Na co si/i.test(nadpis[1]!)) {
    const name = nadpis[1]!.trim();
    // kód z názvu: „Fasádní systém" → FASADNI_SYSTEM
    const code = name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    aktualni = { code, name, fields: [] };
    produkty.push(aktualni);
    continue;
  }
  if (!aktualni || !radek.startsWith("|")) continue;

  const bunky = radek.split("|").slice(1, -1).map((b) => b.trim());
  if (bunky.length < 6) continue;
  const [klic, label, typ, povinne, rozsah, moznosti] = bunky as [string, string, string, string, string, string];
  const code = klic.replace(/`/g, "").trim();
  if (!code || code === "Klíč" || /^-+$/.test(code)) continue;
  // „KP_typ_IN (obrázek)" není pole, je to náhled v konfigurátoru
  if (/[()]/.test(code)) continue;

  const [minRaw, maxRaw] = rozsah.split(/[–-]/).map((x) => x.trim());
  const min = rozsah === "–" ? null : cislo(minRaw ?? "");
  const max = rozsah === "–" ? null : cislo(maxRaw ?? "");

  const tbd = /«/.test(moznosti);
  const options =
    moznosti === "–" || tbd
      ? []
      : moznosti
          .split("/")
          .map((o) => o.trim())
          .filter(Boolean)
          .map((o) => ({ value: o, label: o }));

  // Rozměry jsou v podkladu text s číselnými limity — u nás číslo, ať platí
  // validace a naskočí numerická klávesnice.
  const input: Pole["input"] =
    options.length > 0 ? "select" : min !== null || max !== null ? "number" : typ === "select" ? "select" : "text";

  aktualni.fields.push({
    code,
    label,
    section: sekce(code),
    input,
    required: povinne === "ano" && !tbd,
    min,
    max,
    options,
    tbd,
  });
}

const katalog = {
  source: "Infor CPQ (cpqks.eu1.inforcloudsuite.com) — podklad z 11. 8. 2026",
  generated: new Date().toISOString().slice(0, 10),
  // Pravidla závislostí zatím nejsou naměřená; produkty jsou proto bez nich.
  products: produkty.filter((p) => p.fields.length > 0),
};

const cil = "podklady/data/neva/produkty.json";
writeFileSync(cil, JSON.stringify(katalog, null, 2) + "\n");
console.log(
  `${cil}: ${katalog.products.length} produktů, ${katalog.products.reduce((n, p) => n + p.fields.length, 0)} polí`,
);
for (const p of katalog.products) {
  const tbd = p.fields.filter((f) => f.tbd).length;
  console.log(`  ${p.code} (${p.name}): ${p.fields.length} polí${tbd ? `, ${tbd} bez číselníku` : ""}`);
}
