// lib/api-key-store.ts — operasi runtime API key (Redis).
//
// Pembagian:
//   • Definisi key (name, whitelist model, limit, expiresAt) -> di dalam vault
//     (terenkripsi + ikut backup).
//   • Counter runtime (token terpakai, requests, RPM, concurrent) -> di Redis
//     (cepat + atomik, tidak menulis vault tiap request).
//
// Catatan: lib/redis.ts hanya punya INCR (bukan INCRBY). Untuk decrement
// concurrent kita pakai perintah mentah lewat command().

import { incr, expire, get, del, command } from "./redis";
import type { ApiKey } from "./types";

const ns = `srouter:${process.env.SROUTER_VAULT_ID || "default"}:key`;
const usedKey = (id: string) => `${ns}:tokens:${id}`;
const reqKey = (id: string) => `${ns}:req:${id}`;
const rpmKey = (id: string, minute: number) => `${ns}:rpm:${id}:${minute}`;
const concKey = (id: string) => `${ns}:conc:${id}`;

export async function tokensUsed(id: string): Promise<number> {
  return Number((await get(usedKey(id))) || 0) || 0;
}

/** Tambah token terpakai (INCRBY). */
export async function addTokens(id: string, n: number): Promise<void> {
  const v = Math.floor(n);
  if (!v || v <= 0) return;
  await command("INCRBY", usedKey(id), v);
}

export async function addRequest(id: string): Promise<void> {
  await incr(reqKey(id));
}

/** RPM: hitung per menit. throw kalau lewat. */
export async function enforceRpm(key: ApiKey): Promise<void> {
  const limit = key.limits?.rpmLimit ?? null;
  if (limit === null) return;
  const minute = Math.floor(Date.now() / 60000);
  const k = rpmKey(key.id, minute);
  const n = (await incr(k)) || 1;
  if (n === 1) await expire(k, 70);
  if (n > limit) throw new Error("RPM_LIMITED");
}

/** Concurrent: naikkan counter, kembalikan fungsi rilis. */
export async function acquireSlot(key: ApiKey): Promise<() => Promise<void>> {
  const limit = key.limits?.concurrentLimit ?? null;
  if (limit === null) return async () => { /* unlimited */ };

  const k = concKey(key.id);
  const n = (await incr(k)) || 1;
  if (n === 1) await expire(k, 300);   // jaring pengaman kalau proses mati
  if (n > limit) {
    await command("DECR", k);
    throw new Error("CONCURRENT_LIMITED");
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try { await command("DECR", k); } catch { /* abaikan */ }
  };
}

export async function resetUsage(id: string): Promise<void> {
  await Promise.all([del(usedKey(id)), del(reqKey(id)), del(concKey(id))]);
}

export async function usageOf(id: string): Promise<{ tokensUsed: number; requests: number }> {
  const [t, r] = await Promise.all([get(usedKey(id)), get(reqKey(id))]);
  return { tokensUsed: Number(t || 0) || 0, requests: Number(r || 0) || 0 };
}

// ── INDEKS API KEY (Redis) ──────────────────────────────────────────────────
// hash(key) -> definisi key (JSON). Tidak ada rahasia provider di sini.
const idxKey = (h: string) => `${ns}:idx:${h}`;
const ALL_KEY = `${ns}:idx:all`;      // SET berisi semua hash

export async function saveKeyIndex(key: ApiKey, hash: string): Promise<void> {
  await command("SET", idxKey(hash), JSON.stringify(key));
  await command("SADD", ALL_KEY, hash);
}

export async function deleteKeyIndex(hash: string): Promise<void> {
  await Promise.all([
    del(idxKey(hash)),
    command("SREM", ALL_KEY, hash),
  ]);
}

export async function loadKeyByHash(full: string): Promise<ApiKey | null> {
  if (!full || !full.startsWith("sk-srouter-")) return null;
  const { sha256 } = await import("./crypto");
  const h = await sha256(full);
  const raw = await get(idxKey(h));
  if (!raw) return null;
  try {
    const k = JSON.parse(raw) as ApiKey;
    const u = await usageOf(k.id);
    return { ...k, tokensUsed: u.tokensUsed, requests: u.requests };
  } catch {
    return null;
  }
}

export async function touchKey(id: string): Promise<void> {
  try { await command("SET", `${ns}:last:${id}`, new Date().toISOString()); } catch { /* abaikan */ }
}

export async function listKeyHashes(): Promise<string[]> {
  return (await command<string[]>("SMEMBERS", ALL_KEY)) || [];
}
