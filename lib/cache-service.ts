import type { Provider } from "./types";
import { isModelCacheExpired, MODEL_CACHE_TTL_MS } from "./model-service";

export function cacheState(provider: Provider, now = Date.now()) {
  const expired = isModelCacheExpired(provider, now);
  const last = provider.modelSync?.lastSync ? Date.parse(provider.modelSync.lastSync) : 0;
  const nextSyncAt = last && !Number.isNaN(last) ? new Date(last + MODEL_CACHE_TTL_MS).toISOString() : undefined;
  return { expired, nextSyncAt };
}
