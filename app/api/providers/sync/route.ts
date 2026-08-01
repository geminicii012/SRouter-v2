import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { enforceRateLimit, readJson } from "@/lib/request";
import { syncVaultModels } from "@/lib/sync-service";
import { loadVault, saveVault } from "@/lib/vault";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, "provider-sync", 30, 60);
    const secret = secretFrom(request);
    const { providerId, force } = await readJson<{ providerId?: string; force?: boolean }>(request, 4096);
    const vault = await loadVault(secret);
    const synced = await syncVaultModels(vault, { providerId, force, signal: request.signal });
    const changed = JSON.stringify(vault.providers) !== JSON.stringify(synced.vault.providers);
    const next = changed ? await saveVault(secret, synced.vault, vault.version) : vault;
    return NextResponse.json({ vault: next, results: synced.results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : message === "VERSION_CONFLICT" ? 409 : 400 });
  }
}
