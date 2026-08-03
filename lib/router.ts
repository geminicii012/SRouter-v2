import OpenAI from "openai";
import type { Provider, ProviderKey, RouteTarget, Vault } from "./types";
import { addLog, isCooling, nextCounter, saveVault, setCooldown } from "./vault";
import { assertSafeRemoteUrl, requestSignal } from "./security";
import { calculateBillableCost, extractUsage, resolvePricing, textFrom, usageFromSsePayloads } from "./usage";

const retryable = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const base = (value: string) => value.replace(/\/$/, "");
type Credential = { token: string; keyId?: string };
type RawOpenAIClient = OpenAI & {
  post(path: string, options: { body: any; signal?: AbortSignal }): {
    asResponse(): Promise<Response>;
  };
};

async function credential(provider: Provider, vault?: Vault, secret?: string): Promise<Credential> {
  if (provider.oauth?.accessToken && (!provider.oauth.expiresAt || provider.oauth.expiresAt > Date.now() + 30_000)) {
    return { token: provider.oauth.accessToken };
  }

  if (provider.oauth?.refreshToken) {
    await assertSafeRemoteUrl(provider.oauth.tokenUrl);
    const response = await fetch(provider.oauth.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: provider.oauth.refreshToken,
        client_id: provider.oauth.clientId,
        client_secret: provider.oauth.clientSecret,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const json = await response.json();
      provider.oauth.accessToken = json.access_token;
      provider.oauth.refreshToken = json.refresh_token || provider.oauth.refreshToken;
      provider.oauth.expiresAt = json.expires_in ? Date.now() + json.expires_in * 1000 : undefined;
      if (vault && secret) {
        try {
          const saved = await saveVault(secret, vault, vault.version);
          vault.version = saved.version;
        } catch {
          // Another request may have refreshed first; the current token remains usable.
        }
      }
      return { token: provider.oauth.accessToken! };
    }
  }

  const active: ProviderKey[] = [];
  for (const key of provider.keys) if (key.enabled && !(await isCooling(key.id))) active.push(key);
  if (!active.length) throw new Error("Tidak ada kredensial aktif");
  const chosen = active[((await nextCounter(provider.id)) - 1) % active.length];
  return { token: chosen.value, keyId: chosen.id };
}

function relayOrder(provider: Provider, upstream: string) {
  const relays = (provider.relays || [])
    .filter((relay) => relay.enabled)
    .map((relay) => ({ url: relay.url, target: upstream, secret: relay.secret, label: relay.name }));
  if (provider.relayMode === "only") return relays;
  if (provider.relayMode === "prefer") return [...relays, { url: upstream, label: "direct" }];
  return [{ url: upstream, label: "direct" }, ...relays];
}

async function fetchVia(provider: Provider, upstream: string, init: RequestInit) {
  await assertSafeRemoteUrl(upstream);
  let last = "Upstream gagal";
  const destinations = relayOrder(provider, upstream);
  if (!destinations.length) throw new Error("Tidak ada relay aktif");

  for (const destination of destinations) {
    try {
      await assertSafeRemoteUrl(destination.url);
      const headers = new Headers(init.headers);
      if ("target" in destination && destination.target) {
        headers.set("x-srouter-target", destination.target);
        headers.set("x-srouter-relay-secret", destination.secret || "");
      }

      const response = await fetch(destination.url, {
        ...init,
        headers,
        redirect: "error",
        signal: requestSignal(init.signal || undefined, provider.timeoutMs || 120_000),
      });

      if (response.ok || !retryable.has(response.status)) {
        return response;
      }
      last = `${destination.label}: HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : "Network error";
    }
  }
  throw new Error(last);
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function fetchUrl(input: FetchInput) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function fetchInit(input: FetchInput, init: FetchInit): RequestInit {
  if (typeof input === "string" || input instanceof URL) return init || {};
  return { method: input.method, headers: input.headers, body: input.body, ...init };
}

function openAIFetch(provider: Provider): typeof fetch {
  return ((input: FetchInput, init?: FetchInit) => {
    return fetchVia(provider, fetchUrl(input), fetchInit(input, init));
  }) as typeof fetch;
}

function headersFromError(headers: unknown) {
  const result = new Headers();
  if (headers instanceof Headers) {
    headers.forEach((value, key) => result.set(key, value));
  } else if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") result.set(key, value);
    }
  }
  if (!result.has("content-type")) result.set("content-type", "application/json");
  return result;
}

function responseFromOpenAIError(error: unknown) {
  const candidate = error as { status?: unknown; headers?: unknown; error?: unknown; message?: string };
  if (typeof candidate.status !== "number") return undefined;
  const payload = candidate.error ?? { message: candidate.message || "Upstream error" };
  const body = typeof payload === "string" ? payload : JSON.stringify({ error: payload });
  return new Response(body, { status: candidate.status, headers: headersFromError(candidate.headers) });
}

async function openAIResponse(provider: Provider, token: string, path: string, body: any, model: string, signal?: AbortSignal) {
  const client = new OpenAI({
    apiKey: token,
    baseURL: base(provider.baseUrl),
    defaultHeaders: provider.headers,
    fetch: openAIFetch(provider),
    maxRetries: 0,
    timeout: provider.timeoutMs || 120_000,
  }) as RawOpenAIClient;

  try {
    return await client.post(path, { body: { ...body, model }, signal }).asResponse();
  } catch (error) {
    const response = responseFromOpenAIError(error);
    if (response) return response;
    throw error;
  }
}

export function anthropicBody(body: any, model: string) {
  const system = body.messages?.filter((m: any) => m.role === "system").map((m: any) => m.content).join("\n");
  return {
    model,
    max_tokens: body.max_tokens || 4096,
    messages: (body.messages || []).filter((m: any) => m.role !== "system"),
    system: system || undefined,
    temperature: body.temperature,
    stream: false,
  };
}

export function anthropicToOpenAI(json: any, model: string) {
  const text = (json.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("");
  return {
    id: json.id || crypto.randomUUID(), object: "chat.completion", created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: json.stop_reason || "stop" }],
    usage: { prompt_tokens: json.usage?.input_tokens || 0, completion_tokens: json.usage?.output_tokens || 0, total_tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0) },
  };
}

function geminiPart(content: any) {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [{ text: JSON.stringify(content) }];
  return content.map((item: any) => {
    if (item.type === "text") return { text: item.text };
    if (item.type === "image_url" && item.image_url?.url?.startsWith("data:")) {
      const match = item.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    }
    return { text: JSON.stringify(item) };
  });
}

export function geminiBody(body: any) {
  const system = (body.messages || []).filter((m: any) => m.role === "system").map((m: any) => m.content).join("\n");
  return {
    contents: (body.messages || []).filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: geminiPart(m.content) })),
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: { temperature: body.temperature, maxOutputTokens: body.max_tokens },
  };
}

export function geminiToOpenAI(json: any, model: string) {
  const text = json.candidates?.[0]?.content?.parts?.map((x: any) => x.text || "").join("") || "";
  return {
    id: crypto.randomUUID(), object: "chat.completion", created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: json.usageMetadata?.promptTokenCount || 0, completion_tokens: json.usageMetadata?.candidatesTokenCount || 0, total_tokens: json.usageMetadata?.totalTokenCount || 0 },
  };
}

function jsonResponse(json: any) { return Response.json(json); }
function syntheticSSE(json: any) {
  const chunk = { id: json.id, object: "chat.completion.chunk", created: json.created, model: json.model, choices: [{ index: 0, delta: { role: "assistant", content: json.choices?.[0]?.message?.content || "" }, finish_reason: null }] };
  const end = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } });
}

function usageLog(provider: Provider, model: string, status: number, latency: number, usage: ReturnType<typeof extractUsage>) {
  return { at: new Date().toISOString(), provider: provider.name, model, status, latency, usage, cost: calculateBillableCost(usage, resolvePricing(provider.pricing, model)) };
}
async function safeAddLog(entry: unknown, limit: number) {
  try { await addLog(entry, limit); } catch { /* Observability must never break inference. */ }
}

async function observedOpenAIResponse(response: Response, provider: Provider, model: string, body: any, started: number, vault: Vault) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    if (!response.body) return response;
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "", outputText = ""; const payloads: any[] = [];
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          const usage = usageFromSsePayloads(payloads, { inputText: textFrom(body), outputText });
          if (vault.logging) await safeAddLog(usageLog(provider, model, response.status, Date.now() - started, usage), vault.logLimit);
          controller.close(); return;
        }
        const text = decoder.decode(value, { stream: true }); buffer += text;
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) if (line.startsWith("data:") && line.slice(5).trim() !== "[DONE]") try { const json = JSON.parse(line.slice(5).trim()); payloads.push(json); outputText += textFrom(json); } catch { /* Preserve malformed upstream data unchanged. */ }
        controller.enqueue(value);
      },
      cancel(reason) { void reader.cancel(reason); },
    });
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const raw = await response.text();
  let usage;
  try { const json = JSON.parse(raw); usage = extractUsage(json, { inputText: textFrom(body), outputText: textFrom(json) }); }
  catch { usage = extractUsage({}, { inputText: textFrom(body), outputText: raw }); }
  if (vault.logging) await safeAddLog(usageLog(provider, model, response.status, Date.now() - started, usage), vault.logLimit);
  return new Response(raw, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export async function execute(vault: Vault, requested: string, path: string, body: any, signal?: AbortSignal, secret?: string) {
  if (!requested || typeof requested !== "string" || requested.length > 200) throw new Error("Model tidak valid");
  const direct = vault.providers.flatMap((provider) => provider.models.map((model) => ({ providerId: provider.id, model }))).filter((x) => x.model === requested);
  const targets = (vault.routes[requested] || direct) as RouteTarget[];
  if (!targets.length) throw new Error(`Route/model ${requested} tidak ditemukan`);
  let last = "Semua provider gagal";

  for (const target of targets) {
    const provider = vault.providers.find((x) => x.id === target.providerId && x.enabled);
    if (!provider) continue;
    const started = Date.now();
    let selected: Credential | undefined;
    try {
      selected = await credential(provider, vault, secret);
      let response: Response;
      if (provider.format === "anthropic" && path === "/chat/completions") {
        response = await fetchVia(provider, `${base(provider.baseUrl)}/messages`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": selected.token, "anthropic-version": "2023-06-01", ...provider.headers }, body: JSON.stringify(anthropicBody(body, target.model)), signal });
        if (response.ok) {
          const result = anthropicToOpenAI(await response.json(), target.model);
          if (vault.logging) { const usage = extractUsage(result, { inputText: textFrom(body), outputText: textFrom(result) }); await safeAddLog(usageLog(provider, target.model, 200, Date.now() - started, usage), vault.logLimit); }
          return body.stream ? syntheticSSE(result) : jsonResponse(result);
        }
      } else if (provider.format === "gemini" && path === "/chat/completions") {
        response = await fetchVia(provider, `${base(provider.baseUrl)}/models/${encodeURIComponent(target.model)}:generateContent?key=${encodeURIComponent(selected.token)}`, { method: "POST", headers: { "content-type": "application/json", ...provider.headers }, body: JSON.stringify(geminiBody(body)), signal });
        if (response.ok) {
          const result = geminiToOpenAI(await response.json(), target.model);
          if (vault.logging) { const usage = extractUsage(result, { inputText: textFrom(body), outputText: textFrom(result) }); await safeAddLog(usageLog(provider, target.model, 200, Date.now() - started, usage), vault.logLimit); }
          return body.stream ? syntheticSSE(result) : jsonResponse(result);
        }
      } else if (provider.format === "openai") {
        response = await openAIResponse(provider, selected.token, path, body, target.model, signal);
        if (response.ok) {
          return observedOpenAIResponse(response, provider, target.model, body, started, vault);
        }
      } else {
        throw new Error(`Format ${provider.format} tidak mendukung ${path}`);
      }
      const errorText = await response.text();
      last = `${provider.name}: HTTP ${response.status} - ${errorText}`;
      if (response.status === 429 && selected.keyId) await setCooldown(selected.keyId, Number(response.headers.get("retry-after")) || 60);
      if (vault.logging) await addLog({ at: new Date().toISOString(), provider: provider.name, model: target.model, status: response.status, error: last, latency: Date.now() - started }, vault.logLimit);
    } catch (error) {
      last = `${provider.name}: ${error instanceof Error ? error.message : "error"}`;
      if (vault.logging) await addLog({ at: new Date().toISOString(), provider: provider.name, model: target.model, status: 0, error: last, latency: Date.now() - started }, vault.logLimit);
    }
  }
  throw new Error(last);
}

export async function executeMultipart(vault: Vault, requested: string, path: string, form: FormData, signal?: AbortSignal, secret?: string) {
  const targets = (vault.routes[requested] || vault.providers.flatMap((p) => p.models.includes(requested) ? [{ providerId: p.id, model: requested }] : [])) as RouteTarget[];
  for (const target of targets) {
    const provider = vault.providers.find((x) => x.id === target.providerId && x.enabled);
    if (!provider || provider.format !== "openai") continue;
    try {
      const selected = await credential(provider, vault, secret);
      const copy = new FormData();
      for (const [key, value] of form.entries()) copy.append(key, value);
      copy.set("model", target.model);
      const response = await fetchVia(provider, `${base(provider.baseUrl)}${path}`, { method: "POST", headers: { authorization: `Bearer ${selected.token}`, ...provider.headers }, body: copy, signal });
      if (response.ok) return response;
      if (response.status === 429 && selected.keyId) await setCooldown(selected.keyId, Number(response.headers.get("retry-after")) || 60);
    } catch { /* Try the next target. */ }
  }
  throw new Error("Semua provider transcription gagal");
}
