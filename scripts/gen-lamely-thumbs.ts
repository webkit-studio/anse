// Vygeneruje kulaté náhledy barev lamel z images/<kód>.jpg do public/lamely/<kód>.webp.
// Zdroj: fotky dodané klientem (JackWest), strip 1000×296 → center crop → 72×72 webp.
// Spouštět po přidání/změně fotek: npm run gen:lamely
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const srcDir = fileURLToPath(new URL("../images", import.meta.url));
const outDir = fileURLToPath(new URL("../public/lamely", import.meta.url));

await mkdir(outDir, { recursive: true });

const files = (await readdir(srcDir)).filter((f) => f.endsWith(".jpg"));
let count = 0;
const codes: string[] = [];

for (const file of files) {
  // ral-7016_original.jpg → kód 7016; jinak číslo ze jména souboru
  const base = path.basename(file, ".jpg");
  const code = base.startsWith("ral-") ? base.replace(/^ral-/, "").replace(/_.*$/, "") : base;

  const buf = await sharp(path.join(srcDir, file))
    .resize(72, 72, { fit: "cover", position: "centre" })
    .webp({ quality: 80 })
    .toBuffer();
  await writeFile(path.join(outDir, `${code}.webp`), buf);
  count++;
  codes.push(code);
}

console.log(`Vygenerováno ${count} náhledů do public/lamely/`);
console.log("Kódy:", codes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(", "));
