/**
 * lib/redis.ts — klien store untuk SRouter.
 *
 * Mendukung DUA backend dengan protokol REST yang SAMA:
 *   1. Cloudflare Durable Objects (utama) — SROUTER_STORE_URL + SROUTER_STORE_TOKEN
 *   2. Upstash Redis (cadangan)          — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *
 * Pemilihan otomatis: kalau SROUTER_STORE_URL diisi, pakai DO. Kalau tidak,
 * jatuh ke Upstash. Ini membuat perpindahan balik jadi mudah tanpa ubah kode.
 *
 * Protokol: POST body ["PERINTAH", ...args] -> { result: ... }
 */

const storeUrl = process.env.SROUTER_STORE_URL;
const storeToken = process.env.SROUTER_STORE_TOKEN;
const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const url = storeUrl || upstashUrl;
const token = storeUrl ? storeToken : upstashToken;

/** Nama backend aktif — dipakai untuk pesan error yang jelas. */
export const backend = storeUrl ? "cloudflare-do" : upstashUrl ? "upstash" : "none";

// Cloudflare memblokir User-Agent default Python/Node fetch dengan error 1010.
// Kirim UA eksplisit supaya request dari mana pun lolos.
const USER_AGENT = "srouter/1.0";

export async function command<T = unknown>(...args: (string | number)[]): Promise<T | null> {
  if (!url || !token) {
    throw new Error(
      backend === "none"
        ? "Store belum dikonfigurasi (SROUTER_STORE_URL atau UPSTASH_REDIS_REST_URL)"
        : "Store token kosong",
    );
  }
  const x = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!x.ok) throw new Error(`Store ${x.status}`);
  const j = (await x.json()) as { result?: T; error?: string };
  if (j.error) throw new Error(j.error);
  return (j.result ?? null) as T | null;
}

export const get = (k: string) => command<string>("GET", k);
export const set = (k: string, v: string) => command("SET", k, v);
export const setex = (k: string, s: number, v: string) => command("SETEX", k, s, v);
export const del = (k: string) => command("DEL", k);
export const incr = (k: string) => command<number>("INCR", k);
export const hincrby = (k: string, f: string, n: number) => command<number>("HINCRBY", k, f, n);
export const expire = (k: string, s: number) => command("EXPIRE", k, s);
export const lpush = (k: string, v: string) => command("LPUSH", k, v);
export const ltrim = (k: string, a: number, b: number) => command("LTRIM", k, a, b);
export const lrange = (k: string, a: number, b: number) => command<string[]>("LRANGE", k, a, b);
export const hset = (k: string, f: string, v: string) => command("HSET", k, f, v);
export const hgetall = (k: string) => command<string[]>("HGETALL", k);

/**
 * CAS (compare-and-set) — pengganti Lua/EVAL.
 *
 * Redis memakai EVAL untuk dua hal di SRouter: setup pertama (harus belum ada)
 * dan saveVault (optimistic locking). Durable Object single-threaded, jadi
 * operasi ini atomik tanpa Lua.
 *
 *   expected = "__NONE__" -> kunci harus belum ada
 *   expected = "<nilai>"  -> kunci harus == nilai itu
 */
export const cas = (
  checkKey: string,
  expected: string,
  pairs: [string, string][],
) => command<number>("CAS", checkKey, expected, ...pairs.flat());

/**
 * evalScript — kompatibilitas mundur untuk backend Upstash (yang punya Lua).
 * Di DO Store ini TIDAK didukung; pemanggil harus pakai `cas()`.
 */
export const evalScript = <T = unknown>(
  script: string,
  keys: string[],
  args: (string | number)[],
) => command<T>("EVAL", script, keys.length, ...keys, ...args);

/** Apakah backend saat ini mendukung Lua (EVAL). */
export const supportsLua = backend === "upstash";
