import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { loadVault } from "@/lib/vault";
import { assertSafeRemoteUrl, requestSignal } from "@/lib/security";
import { enforceRateLimit, readJson } from "@/lib/request";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, "provider-test", 30, 60);
    const vault = await loadVault(secretFrom(request));
    const { providerId } = await readJson(request, 4096);
    const provider = vault.providers.find((item) => item.id === providerId);
    if (!provider) throw new Error("Provider tidak ditemukan");
    const key = provider.oauth?.accessToken || provider.keys.find((item) => item.enabled)?.value;
    if (!key) throw new Error("Kredensial tidak tersedia");

    const started = Date.now();
    let url = `${provider.baseUrl.replace(/\/$/, "")}/models`;
    let headers: Record<string, string> = { authorization: `Bearer ${key}`, ...provider.headers };
    if (provider.format === "anthropic") headers = { "x-api-key": key, "anthropic-version": "2023-06-01", ...provider.headers };
    if (provider.format === "gemini") url += `?key=${encodeURIComponent(key)}`;
    await assertSafeRemoteUrl(url);
    const response = await fetch(url, { headers, redirect: "error", signal: requestSignal(request.signal, 15_000) });
    return NextResponse.json({ ok: response.ok, status: response.status, latency: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: message === "RATE_LIMITED" ? 429 : 400 });
  }
}
