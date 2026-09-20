import { NextResponse } from "next/server";
import { backend } from "@/lib/redis";

/**
 * Health check. Mendukung dua backend: Cloudflare DO (utama) atau Upstash.
 * "storeUrl"/"storeToken" = backend yang benar-benar aktif di lib/redis.ts.
 */
export async function GET() {
  const storeUrl = Boolean(process.env.SROUTER_STORE_URL);
  const storeToken = Boolean(process.env.SROUTER_STORE_TOKEN);
  const upstashUrl = Boolean(process.env.UPSTASH_REDIS_REST_URL);
  const upstashToken = Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

  const checks = {
    backend,
    storeUrl: backend === "cloudflare-do" ? storeUrl : upstashUrl,
    storeToken: backend === "cloudflare-do" ? storeToken : upstashToken,
    appUrl: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    internalSecret: Boolean(process.env.SROUTER_INTERNAL_SECRET),
    oauthStateSecret: Boolean(process.env.OAUTH_STATE_SECRET && process.env.OAUTH_STATE_SECRET.length >= 32),
  };
  const ready = checks.storeUrl && checks.storeToken && checks.internalSecret;

  return NextResponse.json(
    { ok: ready, service: "SRouter", version: "1.0.0", checks, timestamp: new Date().toISOString() },
    { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
