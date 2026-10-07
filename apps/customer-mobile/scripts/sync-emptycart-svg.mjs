import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const svgPath = path.join(root, "assets", "emptycart.svg");
const outPath = path.join(root, "src", "assets", "emptycart-xml.ts");

const xml = fs.readFileSync(svgPath, "utf8");
const header =
  "/** Kept in sync with assets/emptycart.svg — run `npm run sync-emptycart-svg` after editing the SVG. */\n";
const body = `export const EMPTY_CART_SVG_XML = ${JSON.stringify(xml)};\n`;
fs.writeFileSync(outPath, header + body, "utf8");
console.log("Wrote", path.relative(root, outPath));
