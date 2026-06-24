import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderAbout } from "./render-about.mjs";

// Build step (run via `npm run build`, set as the Pages build command):
// render README.md into static/about.html so /about always reflects the
// current README without a hand-maintained copy.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const markdown = readFileSync(join(root, "README.md"), "utf8");
writeFileSync(join(root, "static", "about.html"), renderAbout(markdown));
console.log("Built static/about.html from README.md");
