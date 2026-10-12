import { readFile, writeFile } from "node:fs/promises";

const entryPath = new URL("../index.html", import.meta.url);
const templatePath = new URL("../index.template.html", import.meta.url);
const sourceRoot = new URL("../src/", import.meta.url);
const modules = ["azureCsv.js", "analyze.js", "report.js", "policy.js", "main.js"];
let bundle = "";

for (const file of modules) {
  let source = await readFile(new URL(file, sourceRoot), "utf8");
  source = source.replace(/^import .*;\s*$/gm, "").replace(/^export /gm, "");
  bundle += `\n// ---- ${file} ----\n${source}\n`;
}

const html = await readFile(templatePath, "utf8");
const marker = '<script type="module" src="src/main.js"></script>';
if (!html.includes(marker)) throw new Error("Could not find the app script marker in index.html.");
const portableHtml = html.replace(marker, `<script>\n(() => {\n${bundle}\n})();\n</script>`);
if (/(?:src|href)\s*=\s*["']https?:/i.test(portableHtml) || /@import\s+url\(["']?https?:/i.test(portableHtml) || /url\(["']?https?:/i.test(portableHtml)) {
  throw new Error("The portable build must not load remote scripts, stylesheets, fonts, or images.");
}
for (const file of modules) if (!portableHtml.includes(`// ---- ${file} ----`)) throw new Error(`Portable build is missing source module ${file}.`);
await writeFile(entryPath, portableHtml, "utf8");
console.log("Built standalone index.html for direct file:// use.");
