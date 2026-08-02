import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("Aurora Command exposes command palette with keyboard shortcut and dialog semantics", () => {
  assert.match(page, /commandOpen/);
  assert.match(page, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(page, /role="dialog"/);
  assert.match(page, /aria-modal="true"/);
  assert.match(page, /Command palette/);
});

test("providers support progressive disclosure through an inspector", () => {
  assert.match(page, /inspectedProvider/);
  assert.match(page, /provider-inspector/);
  assert.match(page, /Inspector/);
});

test("routes render as a visual chain and provider health uses connected nodes", () => {
  assert.match(page, /route-chain/);
  assert.match(page, /route-node/);
  assert.match(page, /health-network/);
  assert.match(page, /health-connector/);
});

test("design system includes scalable tokens and a non-glass Aurora background", () => {
  assert.match(css, /--space-1:/);
  assert.match(css, /--radius-md:/);
  assert.match(css, /--motion-fast:/);
  assert.match(css, /\.aurora-field/);
  assert.match(css, /@keyframes aurora-drift/);
});

test("UI includes premium loading, empty, toast, focus, and reduced motion states", () => {
  assert.match(css, /\.skeleton/);
  assert.match(css, /\.empty-illustration/);
  assert.match(css, /\.toast/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test("responsive shell supports desktop tablet and phone navigation", () => {
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.mobile-nav/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /min-width:0/);
});

test("production visual identity uses restrained engineering colors and a routing brand mark", () => {
  assert.match(page, /brand-mark/);
  assert.match(page, /brand-node/);
  assert.match(css, /--accent:#e56a4a/);
  assert.match(css, /--accent2:#4f8cff/);
  assert.match(css, /\.brand-mark/);
  assert.doesNotMatch(css, /linear-gradient\(135deg,var\(--accent\),var\(--accent3\)\)/);
});
