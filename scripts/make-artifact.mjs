// Builds a single-file bundle and writes it as an HTML fragment (title, style, root, script)
// for hosts that wrap the page in their own document skeleton.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

execSync("npx vite build --config vite.single.config.ts", { stdio: "inherit" });
const html = readFileSync("dist-single/index.html", "utf8");
const title = /<title>(.*?)<\/title>/s.exec(html)?.[1] ?? "Strike Lab";
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const out = `<title>${title}</title>\n<style>${styles}</style>\n<div id="root"></div>\n${scripts.map((s) => `<script type="module">${s}</script>`).join("\n")}\n`;
writeFileSync("dist-single/fragment.html", out);
console.log(`wrote dist-single/fragment.html (${(out.length / 1024).toFixed(0)} KB)`);
