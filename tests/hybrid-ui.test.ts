import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const page = readFileSync(join(root, "app/page.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");

test("9Router hybrid shell keeps the complete operational navigation", () => {
  assert.match(page, /brand-mark/);
  assert.match(page, /nav-backdrop/);
  assert.match(page, /mobile-menu/);
  assert.match(page, /ProviderInspector/);
  assert.match(page, /HealthNetwork/);
  assert.match(page, /Detect Models/);
  assert.match(page, /OAuth 2\.0 resmi/);
});

test("9Router hybrid uses warm coral tokens and restrained grid treatment", () => {
  assert.match(css, /--accent:#e56a4a/i);
  assert.match(css, /--bg:#fdfaf6/i);
  assert.match(css, /--bg:#1a1a1a/i);
  assert.match(css, /\.shell:after/);
  assert.match(css, /brand-mark/);
});

test("responsive shell covers tablet phone and narrow phone without losing topology scrolling", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /@media\(max-width:340px\)/);
  assert.match(css, /\.health-network\{[^}]*overflow-x:auto/);
  assert.match(css, /\.health-network::-webkit-scrollbar\{[^}]*display:none/);
  assert.doesNotMatch(css, /\.health-network\{[^}]*overflow-x:hidden/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("dialogs and API key textarea remain usable across mobile and desktop modes", () => {
  assert.match(css, /text-size-adjust:100%/);
  assert.match(css, /\.field textarea[^}]*font:13px/);
  assert.match(css, /max-height:calc\(100dvh/);
  assert.match(page, /document\.body\.style\.overflow = "hidden"/);
});
