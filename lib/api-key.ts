// lib/api-key.ts — manajemen + enforcement API key.
//
// Penyimpanan: di dalam vault (ikut terenkripsi + ter-backup), field `apiKeys`.
// Key asli disimpan sebagai hash SHA-256 + prefix tampilan; nilai penuh hanya
// dikembalikan SEKALI saat dibuat.

import { sha256 } from "./crypto";
import type { ApiKey, ApiKeyLimits } from "./types";

export const KEY_PREFIX = "sk-srouter-";

// ── whitelist model berkualifikasi provider ─────────────────────────────────
//
// Satu nama model bisa ada di BEBERAPA provider (mis. `glm-5.3-flash` ada di
// provider "ai" DAN "Nata"). Menyimpan whitelist sebagai nama polos membuat
// pilihan ambigu: centang satu baris -> dua baris ikut tercentang, dan
// enforcement API tidak bisa membedakan keduanya.
//
// Solusi: simpan `provider/model`, dengan model polos (data lama) tetap
// didukung sebagai fallback supaya API key lama tidak mendadak rusak.

/** Kunci whitelist berkualifikasi provider. Model yang sudah berkualifikasi dilewatkan. */
export function qualifiedModel(provider: string, model: string): string {
  return `${provider}/${model}`;
}

/**
 * Cocokkan satu model+provider terhadap whitelist.
 * - `[]`            -> semua diizinkan
 * - `provider/model`-> cocok persis pada pasangan itu
 * - `model` polos   -> fallback data lama: cocok pada nama model apa pun
 */
export function modelAllowed(
  whitelist: readonly string[] | undefined,
  model: string,
  provider?: string,
): boolean {
  if (!whitelist || whitelist.length === 0) return true;

  // Provider diketahui -> nilai HANYA pasangan itu. Entri berkualifikasi milik
  // provider lain tidak boleh ikut lolos, walaupun nama modelnya sama.
  if (provider) {
    if (whitelist.includes(qualifiedModel(provider, model))) return true;
    // entri model polos (data lama) tetap berlaku untuk provider mana pun
    return whitelist.includes(model);
  }

  // Provider tidak diketahui (rute alias / multi-target) -> permissive: selama ADA
  // entri untuk model ini, jangan blokir trafik yang sah. Pemblokiran pasangan
  // yang salah terjadi pada cabang di atas saat provider sudah ditentukan.
  if (whitelist.includes(model)) return true;
  return whitelist.some((entry) => entry.endsWith(`/${model}`));
}

/** Benar bila entri whitelist menunjuk pasangan provider+model tertentu. */
export function entryMatches(entry: string, provider: string, model: string): boolean {
  if (entry === model) return true;
  return entry === qualifiedModel(provider, model);
}

// ── generate ────────────────────────────────────────────────────────────────
export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${KEY_PREFIX}${body}`;
}

export function maskKey(full: string): string {
  return `${full.slice(0, KEY_PREFIX.length + 6)}…${full.slice(-4)}`;
}

export async function hashKey(full: string): Promise<string> {
  return sha256(full);
}

// ── normalisasi limit ───────────────────────────────────────────────────────
export const TOKEN_PRESETS = [
  { label: "unlimited", value: null },
  { label: "1 ribu (1k)", value: 1_000 },
  { label: "10 ribu (10k)", value: 10_000 },
  { label: "100 ribu (100k)", value: 100_000 },
  { label: "1 juta (1m)", value: 1_000_000 },
  { label: "10 juta (10m)", value: 10_000_000 },
  { label: "100 juta (100m)", value: 100_000_000 },
  { label: "1 miliar (1b)", value: 1_000_000_000 },
] as const;

export function parseLimit(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "unlimited") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,_\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function normalizeLimits(input: Partial<ApiKeyLimits> | undefined): ApiKeyLimits {
  return {
    tokenLimit: parseLimit(input?.tokenLimit),
    rpmLimit: parseLimit(input?.rpmLimit),
    concurrentLimit: parseLimit(input?.concurrentLimit),
  };
}

export function emptyApiKey(): ApiKey {
  return {
    id: "",
    name: "",
    secret: "",
    keyHash: "",
    keyMask: "",
    enabled: true,
    models: [],
    limits: { tokenLimit: null, rpmLimit: null, concurrentLimit: null },
    tokensUsed: 0,
    requests: 0,
    expiresAt: null,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
}

// ── validasi terhadap permintaan ────────────────────────────────────────────
export type KeyCheck = { ok: true; key: ApiKey } | { ok: false; status: number; message: string };

/** Cek statis: enabled, expired, model diizinkan, token belum habis. */
export function checkKeyStatic(key: ApiKey, model: string, provider?: string): KeyCheck {
  if (!key.enabled) return { ok: false, status: 401, message: "API key dinonaktifkan" };

  if (key.expiresAt) {
    const t = Date.parse(key.expiresAt);
    if (!Number.isNaN(t) && Date.now() > t) {
      return { ok: false, status: 401, message: "API key sudah kedaluwarsa" };
    }
  }

  // whitelist model: [] = semua model yang diizinkan
  if (!modelAllowed(key.models, model, provider)) {
    const where = provider ? ` dari provider "${provider}"` : "";
    return { ok: false, status: 403, message: `Model "${model}"${where} tidak diizinkan untuk API key ini` };
  }

  const lim = key.limits?.tokenLimit ?? null;
  if (lim !== null && (key.tokensUsed || 0) >= lim) {
    return { ok: false, status: 429, message: "Batas token API key sudah tercapai" };
  }

  return { ok: true, key };
}
