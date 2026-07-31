import { NextRequest, NextResponse } from "next/server";
import { loadVault, saveVault, takeOAuthState } from "@/lib/vault";
import { decryptJson } from "@/lib/crypto";
import { assertSafeRemoteUrl } from "@/lib/security";
import { enforceRateLimit } from "@/lib/request";

export async function GET(request: NextRequest) {
  try {
    await enforceRateLimit(request, "oauth-callback", 20, 600);
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    if (!code || !state || state.length > 512 || code.length > 4096) throw new Error("OAuth callback tidak valid");
    const raw = await takeOAuthState(state);
    const seal = process.env.OAUTH_STATE_SECRET;
    if (!raw || !seal || seal.length < 32) throw new Error("OAuth state kedaluwarsa");
    const salt = Buffer.from(seal.padEnd(24, "0").slice(0, 24)).toString("base64");
    const context = await decryptJson<{ providerId: string; secret: string }>(raw, seal, salt);
    const vault = await loadVault(context.secret);
    const provider = vault.providers.find((item) => item.id === context.providerId);
    if (!provider?.oauth) throw new Error("Provider OAuth tidak ditemukan");
    await assertSafeRemoteUrl(provider.oauth.tokenUrl);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL belum diatur");
    const redirect = `${appUrl.replace(/\/$/, "")}/api/oauth/callback`;
    const response = await fetch(provider.oauth.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect, client_id: provider.oauth.clientId, client_secret: provider.oauth.clientSecret }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error_description || json.error || "Token exchange gagal");
    provider.oauth.accessToken = json.access_token;
    provider.oauth.refreshToken = json.refresh_token || provider.oauth.refreshToken;
    provider.oauth.tokenType = json.token_type || "Bearer";
    provider.oauth.expiresAt = json.expires_in ? Date.now() + json.expires_in * 1000 : undefined;
    await saveVault(context.secret, vault, vault.version);
    return NextResponse.redirect(new URL("/?oauth=success", appUrl));
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ error: message }, { status: message === "RATE_LIMITED" ? 429 : 400 });
  }
}
