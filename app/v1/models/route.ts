import { NextRequest, NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { buildCatalog } from "@/lib/catalog-service";
import { loadVault } from "@/lib/vault";
import { enforceRateLimit } from "@/lib/request";
import { loadKeyByHash } from "@/lib/api-key-store";

function keyStatus(key: { enabled: boolean; expiresAt: string | null }): number | null {
  if (!key.enabled) return 401;
  if (key.expiresAt) {
    const t = Date.parse(key.expiresAt);
    if (!Number.isNaN(t) && Date.now() > t) return 401;
  }
  return null;
}

export async function GET(r: NextRequest) {
  try {
    await enforceRateLimit(r, "models", 120, 60);

    const supplied = secretFrom(r);
    if (!supplied) return NextResponse.json({ error: { message: "UNAUTHORIZED" } }, { status: 401 });

    // Router Secret valid -> vault; dipakai juga untuk baca katalog.
    const vault = await loadVault(process.env.SROUTER_INTERNAL_SECRET || supplied);
    let models = buildCatalog(vault);
    let allowAliases = true;

    // API key (prefix khas) -> validasi + filter katalog sesuai whitelist.
    const match = await loadKeyByHash(supplied);
    if (match) {
      const bad = keyStatus(match);
      if (bad) return NextResponse.json({ error: { message: "KEY_INVALID" } }, { status: bad });
      const wl = match.models || [];
      if (wl.length > 0) {
        models = models.filter((m) => wl.includes(m.model));
        allowAliases = false;
      }
    } else {
      // Jalur Router Secret: pastikan secret-nya memang sah.
      await loadVault(supplied);
    }

    const ids = new Map<string, string>();
    if (allowAliases) for (const alias of Object.keys(vault.routes)) ids.set(alias, "srouter");
    for (const item of models) if (!ids.has(item.model)) ids.set(item.model, item.providerName);

    return NextResponse.json(
      { object: "list", data: [...ids].map(([id, owned_by]) => ({ id, object: "model", owned_by })) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return NextResponse.json(
      { error: { message: m } },
      { status: m === "RATE_LIMITED" ? 429 : 401 },
    );
  }
}
