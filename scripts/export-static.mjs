import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const outputRoot = new URL("../dist/client/", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("static-export", `${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const response = await worker.fetch(
  new Request("https://static-export.local/", { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`Static render failed with ${response.status}`);

const rawBasePath = process.env.PAGES_BASE_PATH || "/";
const basePath = `/${rawBasePath.split("/").filter(Boolean).join("/")}${rawBasePath === "/" ? "" : "/"}`;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

function rewriteForPages(source) {
  let output = source;
  if (basePath !== "/") {
    output = output.replace(
      /(["'\(=])\/(assets\/|castle-arena\.png|og\.png|favicon\.svg|file\.svg|globe\.svg|window\.svg)/g,
      `$1${basePath}$2`,
    );
  }
  if (siteUrl) output = output.replaceAll("http://localhost:3000", siteUrl);
  return output;
}

const html = rewriteForPages(await response.text());
if (!html.includes("Castle Knockout color-match playable demo")) throw new Error("Playable surface missing from static output");
if (basePath !== "/" && !html.includes(`${basePath}assets/`)) throw new Error("GitHub Pages asset base was not applied");

await writeFile(new URL("index.html", outputRoot), html);
await writeFile(new URL("404.html", outputRoot), html);
await writeFile(new URL(".nojekyll", outputRoot), "");

async function rewriteBuiltAssets(directoryUrl) {
  for (const entry of await readdir(directoryUrl, { withFileTypes: true })) {
    const childUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl);
    if (entry.isDirectory()) {
      await rewriteBuiltAssets(childUrl);
      continue;
    }
    if (![".css", ".js", ".html"].includes(extname(entry.name))) continue;
    const source = await readFile(childUrl, "utf8");
    const rewritten = rewriteForPages(source);
    if (rewritten !== source) await writeFile(childUrl, rewritten);
  }
}

await rewriteBuiltAssets(outputRoot);
console.log(`Static GitHub Pages bundle ready at ${join(outputRoot.pathname, "index.html")}`);
