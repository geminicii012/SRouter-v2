import type { ApiFormat, ModelPricing, Provider } from "./types";
import { calculateBillableCost, resolvePricing, type UsageLog } from "./usage";

export const PRICING_CATALOG_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_MS = 6 * 60 * 60 * 1000;

type CatalogEntry = { litellm_provider?: string; input_cost_per_token?: number; output_cost_per_token?: number };
export type PricingCatalog = Record<string, CatalogEntry>;
export type AutomaticPricing = ModelPricing & { source: "litellm" | "model-catalog" | "fallback-estimate" };
type ProviderIdentity = Pick<Provider, "baseUrl" | "name" | "format">;
type AutoProvider = ProviderIdentity & Pick<Provider, "pricing">;
let cached: { at: number; value: PricingCatalog } | undefined;
export const AUTO_FALLBACK_PRICING = { mode: "auto" as const, inputPerMillion: 1, outputPerMillion: 3, source: "fallback-estimate" as const };

function hostname(baseUrl: string) {
  try { return new URL(baseUrl).hostname.toLowerCase(); } catch { return ""; }
}

export function inferCatalogProvider(baseUrl: string, name: string, format: ApiFormat): string | undefined {
  const host = hostname(baseUrl), label = name.toLowerCase();
  if (host === "integrate.api.nvidia.com") return "nvidia_nim";
  if (host === "api.openai.com") return "openai";
  if (host === "api.anthropic.com" || format === "anthropic") return "anthropic";
  if (host === "generativelanguage.googleapis.com" || format === "gemini") return "gemini";
  if (host.endsWith(".openrouter.ai") || host === "openrouter.ai" || label.includes("openrouter")) return "openrouter";
  if (host.includes("groq.com") || label.includes("groq")) return "groq";
  if (host.includes("mistral.ai") || label.includes("mistral")) return "mistral";
  if (host.includes("together.xyz") || label.includes("together")) return "together_ai";
  if (host.includes("deepinfra.com") || label.includes("deepinfra")) return "deepinfra";
  return undefined;
}

const sameProvider = (actual: string | undefined, expected: string) => {
  if (!actual) return false;
  const aliases: Record<string, string[]> = { gemini: ["gemini", "vertex_ai-language-models"], together_ai: ["together_ai", "together-ai"] };
  return (aliases[actual] || [actual]).includes(expected);
};

export function automaticPricing(catalog: PricingCatalog, provider: ProviderIdentity, model: string): AutomaticPricing {
  const identity = inferCatalogProvider(provider.baseUrl, provider.name, provider.format);
  const normalized = model.replace(/^models\//, "");
  const leaf = normalized.split("/").pop() || normalized;
  const candidates = identity && identity !== "nvidia_nim" ? [`${identity}/${normalized}`, normalized, model] : [normalized, model, leaf];
  let match: CatalogEntry | undefined;
  for (const key of candidates) {
    const entry = catalog[key];
    if (entry && (!identity || identity === "nvidia_nim" || sameProvider(identity, entry.litellm_provider || identity))) { match = entry; break; }
  }
  if (!match) {
    const pair = Object.entries(catalog).find(([key, entry]) => {
      const keyLeaf = key.replace(/^models\//, "").split("/").pop();
      const modelMatches = key === normalized || key.endsWith(`/${normalized}`) || keyLeaf === leaf;
      return modelMatches && (!identity || identity === "nvidia_nim" || sameProvider(identity, entry.litellm_provider || ""));
    });
    match = pair?.[1];
  }
  if (!match || !Number.isFinite(match.input_cost_per_token) || !Number.isFinite(match.output_cost_per_token)) return AUTO_FALLBACK_PRICING;
  return { mode: "auto", inputPerMillion: match.input_cost_per_token! * 1_000_000, outputPerMillion: match.output_cost_per_token! * 1_000_000, source: identity ? "litellm" : "model-catalog" };
}

export async function loadPricingCatalog(fetcher: typeof fetch = fetch): Promise<PricingCatalog | undefined> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  try {
    const response = await fetcher(PRICING_CATALOG_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!response.ok) return undefined;
    const value = await response.json() as PricingCatalog;
    cached = { at: Date.now(), value };
    return value;
  } catch { return undefined; }
}

export async function resolveAutomaticPricing(provider: ProviderIdentity, model: string): Promise<AutomaticPricing> {
  const catalog = await loadPricingCatalog();
  return automaticPricing(catalog || {}, provider, model);
}

export async function repriceAutoUsageLogs(rows: UsageLog[], providers: AutoProvider[], resolver = resolveAutomaticPricing): Promise<UsageLog[]> {
  const byName = new Map(providers.map(provider => [provider.name, provider]));
  return Promise.all(rows.map(async row => {
    const provider = byName.get(row.provider);
    if (!provider || !row.usage || resolvePricing(provider.pricing, row.model).mode !== "auto") return row;
    return { ...row, cost: calculateBillableCost(row.usage, await resolver(provider, row.model)) };
  }));
}

export function clearPricingCatalogCache() { cached = undefined; }
