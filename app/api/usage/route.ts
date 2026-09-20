import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { aggregateUsage } from "@/lib/usage";
import { repriceAutoUsageLogs } from "@/lib/pricing-catalog";
import { loadVault, logs, readUsageBucket } from "@/lib/vault";
import { enforceRateLimit } from "@/lib/request";

/** Ubah hasil HGETALL jadi bentuk bucket yang sama dengan aggregateUsage. */
function bucketFromMap(map: Record<string, number>) {
  const n = (k: string) => Number(map[k]) || 0;
  return {
    requests: n("requests"),
    inputTokens: n("inputTokens"),
    outputTokens: n("outputTokens"),
    totalTokens: n("totalTokens"),
    billableUsd: Math.round(n("billableMicroUsd")) / 1e6,
    unknownCostRequests: n("unknownCostRequests"),
    estimatedUsageRequests: n("estimatedUsageRequests"),
  };
}

function pad(n: number) { return String(n).padStart(2, "0"); }

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit(request, "usage", 60, 60);
    const vault = await loadVault(secretFrom(request));

    // Riwayat detail (dipangkas LTRIM) -> dipakai untuk rincian per provider/model.
    const detail = aggregateUsage(await repriceAutoUsageLogs(await logs(vault.logLimit), vault.providers));

    // Angka AKUMULATIF dari counter (tidak pernah turun walau log dipangkas).
    // Memakai waktu lokal server supaya cocok dengan label "hari ini"/"bulan ini".
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const monthKey = todayKey.slice(0, 7);
    const [todayMap, monthMap] = await Promise.all([
      readUsageBucket(todayKey).catch(() => ({})),
      readUsageBucket(monthKey).catch(() => ({})),
    ]);
    const todayCounter = bucketFromMap(todayMap);
    const monthCounter = bucketFromMap(monthMap);

    // Counter baru berlaku sejak fitur ini dipasang. Kalau masih nol sementara
    // log sudah punya data, pakai agregasi log sebagai fallback supaya tampilan
    // tidak mendadak kosong.
    const useCounterMonth = monthCounter.requests > 0;
    const useCounterToday = todayCounter.requests > 0;

    return NextResponse.json(
      {
        ...detail,
        today: useCounterToday ? todayCounter : detail.today,
        month: useCounterMonth ? monthCounter : detail.month,
        // Flag supaya UI bisa membedakan "angka akumulatif" vs "dari log".
        counterActive: useCounterMonth,
        counterSince: useCounterMonth ? monthKey : null,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json(
      { error: message },
      { status: message === "RATE_LIMITED" ? 429 : 401, headers: { "cache-control": "no-store" } }
    );
  }
}
