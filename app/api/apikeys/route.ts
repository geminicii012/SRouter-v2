import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { secretFrom } from "@/lib/auth";
import { loadVault, saveVault } from "@/lib/vault";
import { generateApiKey, hashKey, maskKey, normalizeLimits, emptyApiKey } from "@/lib/api-key";
import { deleteKeyIndex, resetUsage, saveKeyIndex, usageOf, listKeyHashes } from "@/lib/api-key-store";
import type { ApiKey } from "@/lib/types";

export const dynamic = "force-dynamic";

function auth(request: NextRequest) {
  const s = secretFrom(request);
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}

export async function GET(request: NextRequest) {
  try {
    const secret = auth(request);
    const vault = await loadVault(secret);
    const keys = vault.apiKeys || [];

    // lengkapi dengan pemakaian terkini dari Redis
    const withUsage = await Promise.all(
      keys.map(async (k) => {
        const u = await usageOf(k.id);
        return { ...k, tokensUsed: u.tokensUsed, requests: u.requests };
      }),
    );

    return NextResponse.json(
      {
        keys: withUsage,
        // daftar hash yang benar-benar ada di indeks (untuk deteksi drift)
        indexed: (await listKeyHashes()).length,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: m }, { status: m === "UNAUTHORIZED" ? 401 : 400 });
  }
}

/** Buat key baru. Mengembalikan nilai PENUH sekali saja. */
export async function POST(request: NextRequest) {
  try {
    const secret = auth(request);
    const body = await request.json();
    const vault = await loadVault(secret);

    const full = generateApiKey();
    const h = await hashKey(full);

    const key: ApiKey = {
      ...emptyApiKey(),
      id: crypto.randomUUID(),
      name: String(body?.name || "API Key").slice(0, 60),
      secret: full,
      keyHash: h,
      keyMask: maskKey(full),
      enabled: body?.enabled !== false,
      models: Array.isArray(body?.models) ? body.models.filter((m: unknown) => typeof m === "string") : [],
      limits: normalizeLimits(body?.limits),
      expiresAt: body?.expiresAt || null,
      createdAt: new Date().toISOString(),
    };

    const next = { ...vault, apiKeys: [...(vault.apiKeys || []), key] };
    await saveVault(secret, next, vault.version, { skipProviderValidation: true });
    await saveKeyIndex(key, h);

    // nilai penuh HANYA di respons ini
    return NextResponse.json(
      { key: { ...key, fullKey: full } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: m }, { status: m === "UNAUTHORIZED" ? 401 : 400 });
  }
}

/** Update key (nama/models/limits/expiresAt/enabled). */
export async function PUT(request: NextRequest) {
  try {
    const secret = auth(request);
    const body = await request.json();
    const vault = await loadVault(secret);
    const keys = vault.apiKeys || [];
    const idx = keys.findIndex((k) => k.id === body?.id);
    if (idx < 0) return NextResponse.json({ error: "Key tidak ditemukan" }, { status: 404 });

    const old = keys[idx];
    const updated: ApiKey = {
      ...old,
      name: body?.name !== undefined ? String(body.name).slice(0, 60) : old.name,
      enabled: body?.enabled !== undefined ? Boolean(body.enabled) : old.enabled,
      models: Array.isArray(body?.models)
        ? body.models.filter((m: unknown) => typeof m === "string")
        : old.models,
      limits: body?.limits ? normalizeLimits(body.limits) : old.limits,
      expiresAt: body?.expiresAt !== undefined ? (body.expiresAt || null) : old.expiresAt,
    };

    const nextKeys = [...keys];
    nextKeys[idx] = updated;
    await saveVault(secret, { ...vault, apiKeys: nextKeys }, vault.version, { skipProviderValidation: true });
    await saveKeyIndex(updated, updated.keyHash);
    if (body?.resetUsage) await resetUsage(updated.id);

    return NextResponse.json({ key: updated }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: m }, { status: m === "UNAUTHORIZED" ? 401 : 400 });
  }
}

/** Hapus key. */
export async function DELETE(request: NextRequest) {
  try {
    const secret = auth(request);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id wajib" }, { status: 400 });

    const vault = await loadVault(secret);
    const keys = vault.apiKeys || [];
    const target = keys.find((k) => k.id === id);
    if (!target) return NextResponse.json({ error: "Key tidak ditemukan" }, { status: 404 });

    await saveVault(secret, { ...vault, apiKeys: keys.filter((k) => k.id !== id) }, vault.version, { skipProviderValidation: true });
    await deleteKeyIndex(target.keyHash);
    await resetUsage(id);

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const m = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: m }, { status: m === "UNAUTHORIZED" ? 401 : 400 });
  }
}
