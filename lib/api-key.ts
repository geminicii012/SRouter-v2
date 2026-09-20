// lib/api-key.ts — manajemen + enforcement API key.
//
// Penyimpanan: di dalam vault (ikut terenkripsi + ter-backup), field `apiKeys`.
// Key asli disimpan sebagai hash SHA-256 + prefix tampilan; nilai penuh hanya
// dikembalikan SEKALI saat dibuat.

import { sha256 } from "./crypto";
import type { ApiKey, ApiKeyLimits } from "./types";

export const KEY_PREFIX = "sk-srouter-";

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
export function checkKeyStatic(key: ApiKey, model: string): KeyCheck {
  if (!key.enabled) return { ok: false, status: 401, message: "API key dinonaktifkan" };

  if (key.expiresAt) {
    const t = Date.parse(key.expiresAt);
    if (!Number.isNaN(t) && Date.now() > t) {
      return { ok: false, status: 401, message: "API key sudah kedaluwarsa" };
    }
  }

  // whitelist model: [] = semua model yang diizinkan
  if (key.models.length > 0 && !key.models.includes(model)) {
    return { ok: false, status: 403, message: `Model "${model}" tidak diizinkan untuk API key ini` };
  }

  const lim = key.limits?.tokenLimit ?? null;
  if (lim !== null && (key.tokensUsed || 0) >= lim) {
    return { ok: false, status: 429, message: "Batas token API key sudah tercapai" };
  }

  return { ok: true, key };
}
