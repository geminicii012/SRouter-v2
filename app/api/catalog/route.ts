import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { searchCatalog } from "@/lib/catalog-service";
import { isModelCacheExpired } from "@/lib/model-service";
import { enforceRateLimit } from "@/lib/request";
import { loadVault } from "@/lib/vault";

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit(request, "catalog", 120, 60);
    const vault = await loadVault(secretFrom(request));
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const providerId = url.searchParams.get("provider") || "all";
    const expiredProviders = vault.providers
      .filter((provider) => provider.enabled && provider.format === "openai" && isModelCacheExpired(provider))
      .map((provider) => provider.id);
    return NextResponse.json({
      models: searchCatalog(vault, query, providerId),
      expiredProviders,
      favorites: vault.modelFavorites || [],
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : 401 });
  }
}
