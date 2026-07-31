import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { loadVault, putOAuthState } from "@/lib/vault";
import { encryptJson, randomB64 } from "@/lib/crypto";
import { assertSafeRemoteUrl } from "@/lib/security";
import { enforceRateLimit, readJson } from "@/lib/request";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, "oauth-start", 20, 600);
    const secret = secretFrom(request);
    const vault = await loadVault(secret);
    const { providerId } = await readJson(request, 4096);
    const provider = vault.providers.find((item) => item.id === providerId);
    if (!provider?.oauth) throw new Error("OAuth provider belum dikonfigurasi");
    await assertSafeRemoteUrl(provider.oauth.authorizeUrl);
    await assertSafeRemoteUrl(provider.oauth.tokenUrl);

    const state = randomB64(24);
    const seal = process.env.OAUTH_STATE_SECRET;
    if (!seal || seal.length < 32) throw new Error("OAUTH_STATE_SECRET minimal 32 karakter");
    const salt = Buffer.from(seal.padEnd(24, "0").slice(0, 24)).toString("base64");
    await putOAuthState(state, await encryptJson({ providerId, secret }, seal, salt));
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL belum diatur");
    const redirect = `${appUrl.replace(/\/$/, "")}/api/oauth/callback`;
    const url = new URL(provider.oauth.authorizeUrl);
    url.searchParams.set("client_id", provider.oauth.clientId);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", provider.oauth.scopes);
    url.searchParams.set("state", state);
    return NextResponse.json({ url: url.toString() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : 400 });
  }
}
