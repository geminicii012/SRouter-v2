import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { enforceRateLimit, readJson } from "@/lib/request";
import { loadVault, saveVault } from "@/lib/vault";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, "catalog-favorite", 120, 60);
    const secret = secretFrom(request);
    const { modelId, favorite } = await readJson<{ modelId: string; favorite: boolean }>(request, 4096);
    if (!modelId || typeof modelId !== "string") throw new Error("Model tidak valid");
    const vault = await loadVault(secret);
    const current = new Set(vault.modelFavorites || []);
    if (favorite) current.add(modelId);
    else current.delete(modelId);
    const next = await saveVault(secret, { ...vault, modelFavorites: [...current] }, vault.version);
    return NextResponse.json({ vault: next, favorites: next.modelFavorites || [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : message === "VERSION_CONFLICT" ? 409 : 400 });
  }
}
