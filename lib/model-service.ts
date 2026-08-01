import type { Provider } from "./types";
import { assertSafeRemoteUrl, requestSignal } from "./security";

export const MODEL_CACHE_TTL_MS = 15 * 60 * 1000;

export function normalizeModelIds(input: unknown) {
  const data = Array.isArray((input as { data?: unknown }).data) ? (input as { data: unknown[] }).data : [];
  return [...new Set(data
    .map((item) => typeof item === "string" ? item : (item as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim()))].sort((a, b) => a.localeCompare(b));
}

export function modelKey(providerId: string, model: string) {
  return `${providerId}:${model}`;
}

export function humanizeModelName(model: string) {
  const raw = model.split("/").pop() || model;
  const compact = raw
    .replace(/[-_]+/g, " ")
    .replace(/\b(gpt|glm|qwen|llama|mistral|nemotron|deepseek|gemini|claude|sonnet|haiku|opus)\b/gi, (x) => {
      const upper = x.toUpperCase();
      if (["GPT", "GLM"].includes(upper)) return upper;
      return x[0].toUpperCase() + x.slice(1).toLowerCase();
    })
    .replace(/\b(\d+)(b|m)\b/gi, (_, n, unit) => `${n}${unit.toUpperCase()}`);
  return compact.replace(/\s+/g, " ").trim() || model;
}

export function isModelCacheExpired(provider: Provider, now = Date.now()) {
  const last = provider.modelSync?.lastSync ? Date.parse(provider.modelSync.lastSync) : 0;
  return !last || Number.isNaN(last) || now - last >= MODEL_CACHE_TTL_MS;
}

export async function detectOpenAIModels(provider: Provider, token?: string, signal?: AbortSignal) {
  if (provider.format !== "openai") {
    throw new Error("Auto detect hanya tersedia untuk provider OpenAI-compatible");
  }
  const key = token || provider.oauth?.accessToken || provider.keys.find((item) => item.enabled)?.value;
  if (!key) throw new Error("API key provider tidak tersedia");

  const url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
  await assertSafeRemoteUrl(url);
  const response = await fetch(url, {
    method: "GET",
    headers: { authorization: `Bearer ${key}`, accept: "application/json", ...provider.headers },
    redirect: "error",
    signal: requestSignal(signal, Math.min(provider.timeoutMs || 30_000, 60_000)),
  });
  const text = await response.text();
  if (!response.ok) {
    const message = text || `HTTP ${response.status}`;
    throw new Error(`Detect models gagal: ${message}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Detect models gagal: response bukan JSON");
  }
  const models = normalizeModelIds(json);
  if (!models.length) throw new Error("Detect models gagal: endpoint tidak mengembalikan daftar model");
  return models;
}
