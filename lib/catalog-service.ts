import type { CatalogModel, Provider, RouteTarget, Vault } from "./types";
import { humanizeModelName, modelKey } from "./model-service";

export function catalogForProvider(provider: Provider, favorites: Set<string>): CatalogModel[] {
  return (provider.models || []).map((model) => ({
    id: modelKey(provider.id, model),
    providerId: provider.id,
    providerName: provider.name,
    model,
    displayName: humanizeModelName(model),
    favorite: favorites.has(modelKey(provider.id, model)),
    source: "provider",
  }));
}

export function buildCatalog(vault: Vault) {
  const favorites = new Set(vault.modelFavorites || []);
  return vault.providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => catalogForProvider(provider, favorites))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.displayName.localeCompare(b.displayName));
}

export function searchCatalog(vault: Vault, query = "", providerId = "all") {
  const q = query.trim().toLowerCase();
  return buildCatalog(vault).filter((item) => {
    const providerOk = providerId === "all" || item.providerId === providerId;
    const queryOk = !q || `${item.displayName} ${item.model} ${item.providerName}`.toLowerCase().includes(q);
    return providerOk && queryOk;
  });
}

export function routeTargetsForModel(vault: Vault, modelId: string): RouteTarget[] {
  const catalog = buildCatalog(vault);
  const exact = catalog.find((item) => item.id === modelId);
  if (exact) return [{ providerId: exact.providerId, model: exact.model, priority: 1, retry: 0 }];
  return catalog
    .filter((item) => item.model === modelId)
    .map((item, index) => ({ providerId: item.providerId, model: item.model, priority: index + 1, retry: 0 }));
}
