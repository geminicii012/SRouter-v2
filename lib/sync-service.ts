import type { Provider, Vault } from "./types";
import { cacheState } from "./cache-service";
import { detectOpenAIModels } from "./model-service";
import { providerCredential } from "./provider-service";

export type SyncResult = {
  providerId: string;
  providerName: string;
  status: "success" | "error" | "skipped";
  modelsCount: number;
  error?: string;
  lastSync?: string;
};

function withSync(provider: Provider, models: string[], status: "success" | "error", error?: string): Provider {
  const lastSync = new Date().toISOString();
  const nextSyncAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  return {
    ...provider,
    models: status === "success" ? models : provider.models,
    modelSync: {
      lastSync,
      nextSyncAt,
      status,
      error,
      modelsCount: status === "success" ? models.length : provider.models.length,
    },
  };
}

export async function syncProviderModels(provider: Provider, options: { force?: boolean; signal?: AbortSignal } = {}) {
  const state = cacheState(provider);
  if (!options.force && !state.expired) {
    return {
      provider,
      result: {
        providerId: provider.id,
        providerName: provider.name,
        status: "skipped",
        modelsCount: provider.models.length,
        lastSync: provider.modelSync?.lastSync,
      } satisfies SyncResult,
    };
  }

  try {
    const models = await detectOpenAIModels(provider, providerCredential(provider), options.signal);
    const next = withSync(provider, models, "success");
    return {
      provider: next,
      result: {
        providerId: provider.id,
        providerName: provider.name,
        status: "success",
        modelsCount: models.length,
        lastSync: next.modelSync?.lastSync,
      } satisfies SyncResult,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Detect models gagal";
    const next = withSync(provider, provider.models, "error", message);
    return {
      provider: next,
      result: {
        providerId: provider.id,
        providerName: provider.name,
        status: "error",
        modelsCount: provider.models.length,
        error: message,
        lastSync: next.modelSync?.lastSync,
      } satisfies SyncResult,
    };
  }
}

export async function syncVaultModels(vault: Vault, options: { providerId?: string; force?: boolean; signal?: AbortSignal } = {}) {
  const results: SyncResult[] = [];
  const providers: Provider[] = [];

  for (const provider of vault.providers) {
    if (options.providerId && provider.id !== options.providerId) {
      providers.push(provider);
      continue;
    }
    if (provider.format !== "openai" || !provider.enabled) {
      providers.push(provider);
      continue;
    }
    const synced = await syncProviderModels(provider, options);
    providers.push(synced.provider);
    results.push(synced.result);
  }

  return { vault: { ...vault, providers }, results };
}
