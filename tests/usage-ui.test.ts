import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const page = readFileSync(join(root, "app/page.tsx"), "utf8");
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const router = readFileSync(join(root, "lib/router.ts"), "utf8");
const route = readFileSync(join(root, "app/api/usage/route.ts"), "utf8");

test("dashboard exposes token and billable cost observability without prompt storage", () => {
  assert.match(page, /Token & cost observability/);
  assert.match(page, /Input tokens/);
  assert.match(page, /Output tokens/);
  assert.match(page, /Billable cost/);
  assert.match(page, /Metadata only/);
  assert.doesNotMatch(route, /prompt|messages|responseBody/);
});

test("provider editor offers honest pricing modes including free and unknown", () => {
  for (const mode of ["free", "fixed", "custom", "unknown"]) assert.match(page, new RegExp(`value="${mode}"`));
  assert.match(page, /NVIDIA NIM atau provider gratis/);
  assert.match(page, /Input \$ \/ 1M tokens/);
  assert.match(page, /Output \$ \/ 1M tokens/);
});

test("usage dashboard remains compact and responsive on mobile", () => {
  assert.match(css, /\.usage-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.usage-grid\{grid-template-columns:1fr\}/);
  assert.match(css, /\.usage-card\{[^}]*min-height:96px/);
});

test("router observes both JSON and SSE responses while preserving byte chunks", () => {
  assert.match(router, /contentType\.includes\("text\/event-stream"\)/);
  assert.match(router, /controller\.enqueue\(value\)/);
  assert.match(router, /usageFromSsePayloads/);
  assert.match(router, /async function safeAddLog/);
  assert.match(router, /Observability must never break inference/);
  assert.match(router, /new Response\(raw, \{ status: response\.status/);
});
