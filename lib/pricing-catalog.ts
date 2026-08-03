import type { ApiFormat, ModelPricing, Provider } from "./types";

export const PRICING_CATALOG_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const CACHE_MS = 6 * 60 * 60 * 1000;

type CatalogEntry = { litellm_provider?: string; input_cost_per_token?: number; output_cost_per_token?: number };
export type PricingCatalog = Record<string, CatalogEntry>;
export type AutomaticPricing = ModelPricing & { source: "provider-rule" | "litellm" | "unmatched" | "catalog-unavailable" };
type ProviderIdentity = Pick<Provider, "baseUrl" | "name" | "format">;
let cached: { at: number; value: PricingCatalog } | undefined;

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
  if (identity === "nvidia_nim") return { mode: "free", source: "provider-rule" };
  if (!identity) return { mode: "unknown", source: "unmatched" };

  const normalized = model.replace(/^models\//, "");
  const candidates = [`${identity}/${normalized}`, normalized, model];
  let match: CatalogEntry | undefined;
  for (const key of candidates) {
    const entry = catalog[key];
    if (entry && sameProvider(identity, entry.litellm_provider || identity)) { match = entry; break; }
  }
  if (!match) {
    const pair = Object.entries(catalog).find(([key, entry]) => (key.endsWith(`/${normalized}`) || key === normalized) && sameProvider(identity, entry.litellm_provider || ""));
    match = pair?.[1];
  }
  if (!match || !Number.isFinite(match.input_cost_per_token) || !Number.isFinite(match.output_cost_per_token)) return { mode: "unknown", source: "unmatched" };
  return { mode: "auto", inputPerMillion: match.input_cost_per_token! * 1_000_000, outputPerMillion: match.output_cost_per_token! * 1_000_000, source: "litellm" };
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
  const identity = inferCatalogProvider(provider.baseUrl, provider.name, provider.format);
  if (identity === "nvidia_nim") return { mode: "free", source: "provider-rule" };
  const catalog = await loadPricingCatalog();
  return catalog ? automaticPricing(catalog, provider, model) : { mode: "unknown", source: "catalog-unavailable" };
}

export function clearPricingCatalogCache() { cached = undefined; }
