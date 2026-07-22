import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Castle Knockout playable surface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Castle Knockout — Playable H5 Demo<\/title>/i);
  assert.match(html, /aria-label="Castle Knockout playable demo"/i);
  assert.match(html, /<canvas[^>]*width="430"[^>]*height="760"/i);
  assert.match(html, /PRESS &amp; HOLD/i);
  assert.match(html, /7 shots remaining/i);
  assert.match(html, /og:image[^>]*content="http:\/\/localhost:3000\/og\.png"/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the gameplay, CTA, and original art assets", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /https:\/\/www\.taptap\.cn\/moment\/791302421241397589/);
  assert.match(page, /onPointerDown=\{beginCharge\}/);
  assert.match(page, /onPointerUp=\{releaseCharge\}/);
  assert.doesNotMatch(page, /onPointerMove|aimX|aimY/);
  assert.match(page, /chargeStarted/);
  assert.match(page, /Math\.sin\(Math\.PI \* ball\.progress\)/);
  assert.match(page, /515 - power \* 275/);
  assert.match(page, /DEPTH HIT/);
  assert.match(page, /TOTAL BREACH!/);
  assert.match(page, /brick\.z \+= brick\.vz/);
  assert.match(page, /500 \/ \(500 \+ brick\.z\)/);
  assert.match(layout, /openGraph:/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await Promise.all([
    access(new URL("../public/castle-arena.png", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});
