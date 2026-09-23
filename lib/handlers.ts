import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { secretFrom } from "./auth";
import { execute } from "./router";
import { loadVault } from "./vault";
import { enforceRateLimit, readJson } from "./request";
import { checkKeyStatic } from "./api-key";
import { addTokens, addRequest, acquireSlot, enforceRpm, loadKeyByHash, tokensUsed, touchKey } from "./api-key-store";
import type { ApiKey } from "./types";

/**
 * Nama provider yang melayani `model`, atau undefined bila ambigu.
 * Dipakai memeriksa whitelist API key yang berkualifikasi provider
 * ("provider/model") — satu nama model bisa ada di beberapa provider.
 */
function providerFor(
  vault: { routes: Record<string, { providerId: string }[]>; providers: { id: string; name: string; models: string[] }[] },
  model: string,
): string | undefined {
  const routed = vault.routes?.[model];
  const list = routed?.length
    ? routed.map((t) => vault.providers.find((pp) => pp.id === t.providerId)).filter(Boolean)
    : vault.providers.filter((pp) => (pp.models || []).includes(model));
  const only = list.filter(Boolean) as { id: string; name: string; models: string[] }[];
  return only.length === 1 ? only[0].name : undefined;
}

/**
 * Nama provider yang diizinkan oleh whitelist API key.
 * Entri berformat `provider/model` -> provider itu. Entri nama polos (data lama)
 * tidak membatasi provider, jadi kembalikan undefined (tanpa batas).
 */
function allowedProvidersFor(key: { models?: string[] }): string[] | undefined {
  const wl = key.models || [];
  if (!wl.length) return undefined;
  const names = new Set<string>();
  for (const entry of wl) {
    const i = entry.indexOf("/");
    if (i > 0) names.add(entry.slice(0, i));
    else return undefined; // ada entri polos -> jangan batasi provider
  }
  return [...names];
}

function statusFor(message: string) {
  if (message === "RATE_LIMITED" || message === "RPM_LIMITED"
      || message === "CONCURRENT_LIMITED" || message === "TOKEN_LIMIT") return 429;
  if (message === "PAYLOAD_TOO_LARGE") return 413;
  if (message === "UNAUTHORIZED" || message === "KEY_INVALID" || message === "KEY_EXPIRED") return 401;
  if (message === "MODEL_NOT_ALLOWED") return 403;
  return 502;
}

/** Ambil kandidat key dari header. */
function rawKeyFrom(request: NextRequest): string {
  const h = request.headers;
  return (h.get("x-api-key") || (h.get("authorization") || "").replace(/^Bearer\s+/i, "")).trim();
}

/** Perkiraan kasar token dari panjang teks. Dipakai kalau provider tidak kirim usage. */
function approxTokens(text: string) { return text ? Math.ceil(text.length / 4) : 0; }

/** Ambil total token dari payload JSON (mendukung bentuk {usage} dan {data:{usage}}). */
function totalFromJson(j: any): number {
  const b = j?.data ?? j;
  const u = b?.usage;
  if (!u) return 0;
  return Number(u.total_tokens) || ((Number(u.prompt_tokens) || 0) + (Number(u.completion_tokens) || 0));
}

const jsonHeaders = (ct: string, fallbackType: string) => ({
  "content-type": ct || fallbackType,
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

export async function handleJsonEndpoint(
  request: NextRequest,
  path: string,
  fallbackType = "application/json",
) {
  let release: (() => Promise<void>) | null = null;
  let matched: ApiKey | null = null;

  try {
    await enforceRateLimit(request, "inference", Number(process.env.SROUTER_RATE_LIMIT || 600), 60);

    const supplied = secretFrom(request);
    if (!supplied) throw new Error("UNAUTHORIZED");
    const body = await readJson<any>(request);

    // ── coba API key dulu (prefix khas), lalu Router Secret ────────────────
    let vault;
    const candidate = rawKeyFrom(request);
    matched = await loadKeyByHash(candidate);

    if (matched) {
      const internal = process.env.SROUTER_INTERNAL_SECRET;
      if (!internal) throw new Error("KEY_INVALID");

      // Batas token dibaca LANGSUNG dari Redis, bukan salinan vault, supaya
      // request yang baru selesai langsung terhitung di request berikutnya.
      const liveUsed = await tokensUsed(matched.id).catch(() => null);
      if (liveUsed !== null) matched = { ...matched, tokensUsed: liveUsed };

      // Vault dibutuhkan untuk menentukan provider mana yang melayani model ini,
      // supaya whitelist yang menyebut pasangan provider+model bisa ditegakkan.
      const policyVault = await loadVault(internal);
      const check = checkKeyStatic(matched, body.model, providerFor(policyVault, body.model));
      if (!check.ok) {
        if (check.status === 403) throw new Error("MODEL_NOT_ALLOWED");
        if (check.status === 429) throw new Error("TOKEN_LIMIT");
        throw new Error("KEY_INVALID");
      }

      await enforceRpm(matched);
      release = await acquireSlot(matched);
      await addRequest(matched.id);

      vault = await loadVault(internal);
    } else {
      vault = await loadVault(supplied);
    }

    const response = await execute(vault, body.model, path, body, request.signal,
      matched ? (process.env.SROUTER_INTERNAL_SECRET || supplied) : supplied,
      matched ? allowedProvidersFor(matched) : undefined);

    // Tanpa API key (Router Secret) -> teruskan apa adanya, tanpa pencatatan.
    if (!matched) {
      return new Response(response.body, {
        status: response.status,
        headers: jsonHeaders(response.headers.get("content-type") || fallbackType, fallbackType),
      });
    }

    const keyId = matched.id;
    const limit = matched.limits?.tokenLimit ?? null;
    void touchKey(keyId);

    const ct = response.headers.get("content-type") || "";
    const isStream = ct.includes("text/event-stream");

    // ── NON-STREAM: hitung token SEBELUM response dikembalikan ─────────────
    // Body JSON kecil -> aman dibaca penuh di sini. Ini menutup celah balapan
    // yang membuat output non-stream tidak terhitung.
    if (!isStream) {
      const raw = await response.text();
      let total = 0;
      try { total = totalFromJson(JSON.parse(raw)); } catch { /* bukan JSON */ }
      if (total <= 0) total = approxTokens(raw);   // fallback provider tanpa usage
      if (total > 0) { try { await addTokens(keyId, total); } catch { /* jangan ganggu respons */ } }
      return new Response(raw, {
        status: response.status,
        statusText: response.statusText,
        headers: jsonHeaders(ct, fallbackType),
      });
    }

    // ── STREAM: hitung token sambil aliran lewat, putus kalau lewat limit ──
    if (!response.body) {
      return new Response(null, { status: response.status, headers: jsonHeaders(ct, fallbackType) });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let rawLen = 0;
    let counted = 0;      // token yang sudah dicatat ke Redis
    let exact = 0;        // total_tokens dari provider (kalau ada)
    let stopped = false;

    const currentTotal = () => (exact > 0 ? exact : Math.ceil(rawLen / 4));
    const flushCount = async () => {
      const target = currentTotal();
      const delta = target - counted;
      if (delta > 0) { counted = target; try { await addTokens(keyId, delta); } catch { /* abaikan */ } }
    };

    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          await flushCount();
          controller.close();
          return;
        }
        const text = decoder.decode(value, { stream: true });
        rawLen += text.length;
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const d = t.slice(5).trim();
          if (!d || d === "[DONE]") continue;
          try {
            const tot = totalFromJson(JSON.parse(d));
            if (tot > 0) exact = Math.max(exact, tot);
          } catch { /* abaikan baris rusak */ }
        }

        // Hentikan aliran begitu ambang batas token terlampaui.
        if (limit !== null && !stopped && currentTotal() >= limit) {
          stopped = true;
          await flushCount();
          const notice = "data: " + JSON.stringify({
            error: { message: "Batas token API key tercapai. Aliran dihentikan.", type: "srouter_error" },
            choices: [{ index: 0, delta: {}, finish_reason: "length" }],
          }) + "\n\ndata: [DONE]\n\n";
          controller.enqueue(encoder.encode(notice));
          try { await reader.cancel(); } catch { /* abaikan */ }
          controller.close();
          return;
        }
        controller.enqueue(value);
      },
      async cancel(reason) {
        await flushCount();
        void reader.cancel(reason);
      },
    });

    return new Response(stream, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        "content-type": ct || "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Router error";
    return NextResponse.json(
      { error: { message, type: "srouter_error" } },
      { status: statusFor(message), headers: { "cache-control": "no-store" } },
    );
  } finally {
    if (release) { try { await release(); } catch { /* abaikan */ } }
  }
}
