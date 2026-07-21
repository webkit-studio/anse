// Vygeneruje server/export/template.b64.ts z docs/MO_vzor-1.xlsx.
// Šablona se vkládá do bundle jako base64 — export funkce tak nezávisí na
// souborovém systému Lambdy (included_files je po esbuild bundlingu nespolehlivé).
// Spouštět po každé změně šablony: npm run gen:template
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../docs/MO_vzor-1.xlsx", import.meta.url));
const out = fileURLToPath(new URL("../server/export/template.b64.ts", import.meta.url));

const bytes = await readFile(src);
const b64 = bytes.toString("base64");
const content = `// AUTOGENEROVÁNO skriptem scripts/gen-template.ts — needitovat ručně.
// Šablona montážního listu (docs/MO_vzor-1.xlsx) jako base64 pro export funkci.
export const TEMPLATE_B64 =
  "${b64}";
`;
await writeFile(out, content);
console.log(`Šablona zapsána do ${out} (${b64.length} znaků base64).`);
