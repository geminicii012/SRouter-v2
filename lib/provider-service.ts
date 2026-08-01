import type { Provider } from "./types";

export function providerCredential(provider: Provider) {
  return provider.oauth?.accessToken || provider.keys.find((item) => item.enabled)?.value || "";
}

export function providerStatus(provider: Provider) {
  if (!provider.enabled) return "disabled";
  if (provider.modelSync?.status === "error") return "sync_error";
  if (provider.models?.length) return "ready";
  return "needs_models";
}

export function providerSummary(provider: Provider) {
  return {
    id: provider.id,
    name: provider.name,
    status: providerStatus(provider),
    modelsCount: provider.models?.length || 0,
    lastSync: provider.modelSync?.lastSync,
    syncStatus: provider.modelSync?.status || "idle",
    syncError: provider.modelSync?.error,
  };
}
