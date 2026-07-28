// Vloží Liberation Sans (Regular + Bold) jako base64 do server/export/font.b64.ts —
// PDF export potřebuje font s českými glyfy (standardní PDF fonty je nemají)
// a Netlify funkce nesmí záviset na souborech na disku (stejný důvod jako
// template.b64.ts). Liberation Sans = metrická náhrada Helveticy, licence OFL.
//
// Zdroj: /usr/share/fonts/truetype/liberation/ (balík fonts-liberation).
// Spouštět jen při změně fontu: npx tsx scripts/gen-font.ts
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const FONT_DIR = "/usr/share/fonts/truetype/liberation";
const outPath = fileURLToPath(new URL("../server/export/font.b64.ts", import.meta.url));

const regular = await readFile(`${FONT_DIR}/LiberationSans-Regular.ttf`);
const bold = await readFile(`${FONT_DIR}/LiberationSans-Bold.ttf`);

const header = `// GENEROVÁNO scripts/gen-font.ts — needitovat ručně.
// Liberation Sans (OFL) s českými glyfy pro PDF export montážního listu.
`;

await writeFile(
  outPath,
  `${header}export const FONT_REGULAR_B64 =\n  "${regular.toString("base64")}";\n\nexport const FONT_BOLD_B64 =\n  "${bold.toString("base64")}";\n`,
);

console.log(
  `Zapsáno ${outPath} (regular ${regular.length} B, bold ${bold.length} B).`,
);
