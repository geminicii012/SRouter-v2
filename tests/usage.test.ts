import assert from "node:assert/strict";
import test from "node:test";
import { aggregateUsage, calculateBillableCost, estimateTextTokens, extractUsage, resolvePricing } from "../lib/usage";

test("free pricing records tokens but always bills zero", () => {
  const pricing = resolvePricing({ default: { mode: "free" } }, "meta/llama");
  assert.deepEqual(calculateBillableCost({ inputTokens: 1200, outputTokens: 300 }, pricing), { mode: "free", usd: 0 });
});

test("fixed and custom pricing calculate input and output independently", () => {
  assert.deepEqual(calculateBillableCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, { mode: "fixed", inputPerMillion: 2, outputPerMillion: 6 }), { mode: "fixed", usd: 5 });
  assert.deepEqual(calculateBillableCost({ inputTokens: 2000, outputTokens: 1000 }, { mode: "custom", inputPerMillion: 0.5, outputPerMillion: 1.25 }), { mode: "custom", usd: 0.00225 });
});

test("unknown pricing never invents a dollar estimate", () => {
  assert.deepEqual(calculateBillableCost({ inputTokens: 10, outputTokens: 20 }, { mode: "unknown" }), { mode: "unknown", usd: null });
});

test("model pricing overrides provider default", () => {
  const pricing = resolvePricing({ default: { mode: "unknown" }, models: { "free-model": { mode: "free" }, paid: { mode: "fixed", inputPerMillion: 1, outputPerMillion: 3 } } }, "paid");
  assert.equal(pricing.mode, "fixed");
  assert.equal(pricing.outputPerMillion, 3);
});

test("usage normalizes OpenAI, Responses, Anthropic, and Gemini shapes", () => {
  assert.deepEqual(extractUsage({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { inputTokens: 10, outputTokens: 5, totalTokens: 15, source: "provider" });
  assert.deepEqual(extractUsage({ usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 } }), { inputTokens: 8, outputTokens: 4, totalTokens: 12, source: "provider" });
  assert.deepEqual(extractUsage({ usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 2, totalTokenCount: 9 } }), { inputTokens: 7, outputTokens: 2, totalTokens: 9, source: "provider" });
});

test("fallback estimation is deterministic and clearly marked estimated", () => {
  assert.equal(estimateTextTokens("12345678"), 2);
  assert.deepEqual(extractUsage({}, { inputText: "12345678", outputText: "1234" }), { inputTokens: 2, outputTokens: 1, totalTokens: 3, source: "estimated" });
});

test("aggregation separates today, month, provider and model without prompt content", () => {
  const rows = [
    { at: "2026-08-02T10:00:00.000Z", provider: "NVIDIA", model: "free", status: 200, latency: 10, usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, source: "provider" as const }, cost: { mode: "free" as const, usd: 0 } },
    { at: "2026-08-01T10:00:00.000Z", provider: "Paid", model: "pro", status: 200, latency: 20, usage: { inputTokens: 200, outputTokens: 100, totalTokens: 300, source: "estimated" as const }, cost: { mode: "fixed" as const, usd: 0.02 } },
  ];
  const summary = aggregateUsage(rows, new Date("2026-08-02T12:00:00.000Z"));
  assert.equal(summary.today.totalTokens, 150);
  assert.equal(summary.month.totalTokens, 450);
  assert.equal(summary.month.billableUsd, 0.02);
  assert.equal(summary.byProvider.length, 2);
  assert.equal(JSON.stringify(summary).includes("prompt"), false);
});

test("aggregation handles empty and unknown-cost logs", () => {
  const empty = aggregateUsage([], new Date("2026-08-02T12:00:00.000Z"));
  assert.equal(empty.month.requests, 0);
  const unknown = aggregateUsage([{ at: "2026-08-02T10:00:00.000Z", provider: "X", model: "m", status: 200, latency: 1, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, source: "provider" as const }, cost: { mode: "unknown" as const, usd: null } }], new Date("2026-08-02T12:00:00.000Z"));
  assert.equal(unknown.month.unknownCostRequests, 1);
});
