import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { aggregateUsage } from "@/lib/usage";
import { repriceAutoUsageLogs } from "@/lib/pricing-catalog";
import { loadVault, logs } from "@/lib/vault";
import { enforceRateLimit } from "@/lib/request";

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit(request, "usage", 60, 60);
    const vault = await loadVault(secretFrom(request));
    const summary = aggregateUsage(await repriceAutoUsageLogs(await logs(vault.logLimit), vault.providers));
    return NextResponse.json(summary, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : 401, headers: { "cache-control": "no-store" } });
  }
}
