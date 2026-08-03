export type PricingMode = "auto" | "free" | "fixed" | "custom" | "unknown";
export type ModelPricing = { mode: PricingMode; inputPerMillion?: number; outputPerMillion?: number };
export type ProviderPricing = { default: ModelPricing; models?: Record<string, ModelPricing> };
export type TokenUsage = { inputTokens: number; outputTokens: number; totalTokens: number; source: "provider" | "estimated" };
export type CostEstimate = { mode: PricingMode; usd: number | null };
export type UsageLog = { at: string; provider: string; model: string; status: number; latency: number; usage?: TokenUsage; cost?: CostEstimate; error?: string };

const tokenCount = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : 0;
const price = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
export function estimateTextTokens(text: string) { return text ? Math.ceil(text.length / 4) : 0; }
export function textFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFrom).join(" ");
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (item.content) return textFrom(item.content);
  if (item.messages) return textFrom(item.messages);
  if (item.input) return textFrom(item.input);
  if (item.output) return textFrom(item.output);
  if (item.choices) return textFrom(item.choices);
  if (item.message) return textFrom(item.message);
  if (item.delta) return textFrom(item.delta);
  if (item.candidates) return textFrom(item.candidates);
  if (item.parts) return textFrom(item.parts);
  return "";
}

export function extractUsage(json: any, fallback?: { inputText?: string; outputText?: string }): TokenUsage {
  const source = json?.usage || json?.usageMetadata || json?.response?.usage || {};
  const input = tokenCount(source.prompt_tokens ?? source.input_tokens ?? source.promptTokenCount ?? source.inputTokens);
  const output = tokenCount(source.completion_tokens ?? source.output_tokens ?? source.candidatesTokenCount ?? source.outputTokens);
  const total = tokenCount(source.total_tokens ?? source.totalTokenCount ?? source.totalTokens) || input + output;
  if (input || output || total) return { inputTokens: input, outputTokens: output, totalTokens: total, source: "provider" };
  const estimatedInput = estimateTextTokens(fallback?.inputText || "");
  const estimatedOutput = estimateTextTokens(fallback?.outputText || "");
  return { inputTokens: estimatedInput, outputTokens: estimatedOutput, totalTokens: estimatedInput + estimatedOutput, source: "estimated" };
}

export function resolvePricing(pricing: ProviderPricing | undefined, model: string): ModelPricing {
  return pricing?.models?.[model] || pricing?.default || { mode: "unknown" };
}
export function calculateBillableCost(usage: Pick<TokenUsage, "inputTokens" | "outputTokens">, pricing: ModelPricing): CostEstimate {
  if (pricing.mode === "free") return { mode: "free", usd: 0 };
  if (pricing.mode === "unknown") return { mode: "unknown", usd: null };
  const usd = usage.inputTokens / 1_000_000 * price(pricing.inputPerMillion) + usage.outputTokens / 1_000_000 * price(pricing.outputPerMillion);
  return { mode: pricing.mode, usd: Math.round(usd * 1e8) / 1e8 };
}

const emptyBucket = () => ({ requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, billableUsd: 0, unknownCostRequests: 0, estimatedUsageRequests: 0 });
type Bucket = ReturnType<typeof emptyBucket>;
function add(bucket: Bucket, row: UsageLog) {
  bucket.requests++;
  if (row.usage) {
    bucket.inputTokens += row.usage.inputTokens;
    bucket.outputTokens += row.usage.outputTokens;
    bucket.totalTokens += row.usage.totalTokens;
    if (row.usage.source === "estimated") bucket.estimatedUsageRequests++;
  }
  if (row.cost?.usd === null) bucket.unknownCostRequests++;
  else bucket.billableUsd += row.cost?.usd || 0;
  bucket.billableUsd = Math.round(bucket.billableUsd * 1e8) / 1e8;
}
export function aggregateUsage(rows: UsageLog[], now = new Date()) {
  const todayKey = now.toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const today = emptyBucket(), month = emptyBucket();
  const providers = new Map<string, Bucket>(), models = new Map<string, Bucket>();
  for (const row of rows) {
    if (!row.usage) continue;
    const day = row.at.slice(0, 10);
    if (day.startsWith(monthKey)) {
      add(month, row);
      const provider = providers.get(row.provider) || emptyBucket(); add(provider, row); providers.set(row.provider, provider);
      const model = models.get(row.model) || emptyBucket(); add(model, row); models.set(row.model, model);
    }
    if (day === todayKey) add(today, row);
  }
  const list = (map: Map<string, Bucket>) => Array.from(map.entries()).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.totalTokens - a.totalTokens);
  return { today, month, byProvider: list(providers), byModel: list(models) };
}

export function usageFromSsePayloads(payloads: any[], fallback: { inputText: string; outputText: string }) {
  for (let i = payloads.length - 1; i >= 0; i--) {
    const usage = extractUsage(payloads[i]);
    if (usage.source === "provider") return usage;
  }
  return extractUsage({}, fallback);
}
