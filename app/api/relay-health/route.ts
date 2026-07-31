import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { loadVault } from "@/lib/vault";
import { assertSafeRemoteUrl, requestSignal } from "@/lib/security";
import { enforceRateLimit, readJson } from "@/lib/request";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, "relay-health", 30, 60);
    await loadVault(secretFrom(request));
    const { url } = await readJson(request, 4096);
    const destination = await assertSafeRemoteUrl(url);
    const started = Date.now();
    const response = await fetch(destination, { redirect: "error", signal: requestSignal(request.signal, 10_000), cache: "no-store" });
    return NextResponse.json({ ok: response.ok, status: response.status, latency: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: message === "RATE_LIMITED" ? 429 : 400 });
  }
}
