import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { detectOpenAIModels } from "@/lib/model-service";
import { enforceRateLimit, readJson } from "@/lib/request";
import type { Provider } from "@/lib/types";
import { loadVault } from "@/lib/vault";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, "provider-detect", 30, 60);
    const secret = secretFrom(request);
    const body = await readJson<{ providerId?: string; provider?: Provider; token?: string }>(request, 200_000);
    let provider = body.provider;
    let token = body.token;

    if (body.providerId) {
      const vault = await loadVault(secret);
      provider = vault.providers.find((item) => item.id === body.providerId);
      token = provider?.oauth?.accessToken || provider?.keys.find((item) => item.enabled)?.value;
    }
    if (!provider) throw new Error("Provider tidak ditemukan");

    const models = await detectOpenAIModels(provider, token, request.signal);
    return NextResponse.json({ ok: true, models, count: models.length }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: message === "RATE_LIMITED" ? 429 : 400 });
  }
}
