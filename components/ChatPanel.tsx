"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ChatPanel v4 — ditulis ulang dengan pola SSE yang TERBUKTI.
//
// Pelajaran dari v3 (6 percobaan gagal, bukti terukur):
//   • Transport OK: fetch + reader.read() mengalir bertahap (75 read, 50 uniq t)
//   • React TIDAK ter-render sampai stream habis
//   • ERR_ABORTED muncul -> ada penulisan DOM / re-render di tengah stream
//
// Pola baru (menghindari penyebab di atas):
//   1. TIDAK menyimpan token di React state selama stream.
//      Tulis ke <span> lewat ref (DOM langsung) — nol re-render.
//   2. setState HANYA sekali setelah stream selesai (untuk riwayat).
//   3. TIDAK menulis scrollTop di dalam effect yang dipicu msgs.
//   4. TIDAK ada setInterval/rAF selama stream.
//
// Sumber model: HANYA provider enabled.
// Endpoint: POST /v1/chat/completions (existing).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send, Trash2, Loader2, AlertTriangle, Cpu, Settings2,
  Square, Copy, RefreshCw, Download, Brain,
} from "lucide-react";
import { copyText } from "@/lib/copy";

type Locale = "id" | "en";

const L = {
  id: {
    opts: "Opsi", export: "Ekspor", clear: "Bersihkan", retry: "ulangi", stop: "stop", send: "kirim",
    copied: "tersalin", copy: "salin", optional: "opsional...", typeMsg: "ketik pesan...", msg: "Pesan",
    streaming: "streaming", wantThinking: "minta thinking", showThinking: "tampilkan thinking",
    thinkDepth: "kedalaman thinking", deepDefault: "default", deepLow: "rendah (lebih cepat)",
    thinking: "thinking", maxTokens: "max tokens", temperature: "temperature",
    modelCaps: "kapabilitas model", sysPrompt: "system prompt",
    noModels: "Tidak ada model tersedia", noModelsHint: "Aktifkan provider agar model bisa dipilih.",
    thinkingOn: "model reasoning - thinking otomatis aktif", thinkingOff: "model standar - tanpa thinking",
    std: "standar", vision: "vision", thinkingChars: "thinking", noStream: "stream tidak tersedia",
    sendFailed: "Gagal menghubungi server", copyFailed: "Gagal menyalin",
  },
  en: {
    opts: "Options", export: "Export", clear: "Clear", retry: "retry", stop: "stop", send: "send",
    copied: "copied", copy: "copy", optional: "optional...", typeMsg: "type a message...", msg: "Message",
    streaming: "streaming", wantThinking: "request thinking", showThinking: "show thinking",
    thinkDepth: "thinking depth", deepDefault: "default", deepLow: "low (faster)",
    thinking: "thinking", maxTokens: "max tokens", temperature: "temperature",
    modelCaps: "model capabilities", sysPrompt: "system prompt",
    noModels: "No models available", noModelsHint: "Enable a provider so models can be selected.",
    thinkingOn: "reasoning model - thinking is automatic", thinkingOff: "standard model - no thinking",
    std: "standard", vision: "vision", thinkingChars: "thinking", noStream: "stream unavailable",
    sendFailed: "Failed to reach the server", copyFailed: "Copy failed",
  },
};

const L_ID = L.id;

type Provider = { id: string; name: string; enabled: boolean; models: string[] };
type VaultLike = { providers: Provider[] };
type Msg = { role: "user" | "assistant"; content: string; reasoning?: string; model?: string; at: number };

type Opts = {
  stream: boolean;
  showThinking: boolean;
  includeReasoning: boolean;
  effort: "default" | "low";
  maxTokens: number;
  temperature: number;
  system: string;
};

const DEFAULTS: Opts = {
  stream: true, showThinking: true, includeReasoning: true,
  effort: "default", maxTokens: 800, temperature: 1, system: "",
};

// Terverifikasi lewat tes langsung (backend reasoning true/false):
//   true  -> z-ai/glm-5.3-flash, cline-free/muse-spark-1.3-contributor
//   false -> cline-free/deepseek-v4.1-flash, cline-free/solar-pro4, poolside/laguna-s-2.1
const REASONING_EXACT = [/glm-5/i, /muse/i, /spark/i, /qwq/i, /-r1\b/i, /think/i, /reason/i];
const REASONING_NEGATIVE = [/deepseek-v4\.1-flash/i, /solar/i, /laguna/i];
const VISION_PATTERNS = [/glm/i, /vision/i, /vl\b/i, /multimodal/i];

function capabilitiesOf(model: string) {
  const reasoning =
    !REASONING_NEGATIVE.some((re) => re.test(model)) &&
    REASONING_EXACT.some((re) => re.test(model));
  return {
    reasoning,
    vision: VISION_PATTERNS.some((re) => re.test(model)),
    supportsEffort: reasoning,
    defaultMaxTokens: reasoning ? 1600 : 800,
    note: reasoning ? L_ID.thinkingOn : L_ID.thinkingOff,
  };
}

export default function ChatPanel({ vault, secret, locale = "id" }: { vault: VaultLike; secret: string; locale?: Locale }) {
  const t = L[locale];
  const catalog = useMemo(
    () => vault.providers
      .filter((p) => p.enabled)
      .flatMap((p) => (p.models || []).map((model) => ({ model, providerId: p.id, providerName: p.name })))
      .sort((a, b) => a.model.localeCompare(b.model)),
    [vault],
  );
  const activeProviders = useMemo(() => vault.providers.filter((p) => p.enabled), [vault]);
  const offProviders = useMemo(() => vault.providers.filter((p) => !p.enabled), [vault]);

  const [model, setModel] = useState("");
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showOpts, setShowOpts] = useState(false);
  const [opts, setOpts] = useState<Opts>(DEFAULTS);
  const [copied, setCopied] = useState<number | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Node DOM untuk baris streaming — ditulis LANGSUNG, tanpa React state.
  const liveWrapRef = useRef<HTMLDivElement | null>(null);
  const liveThingRef = useRef<HTMLPreElement | null>(null);
  const liveTextRef = useRef<HTMLSpanElement | null>(null);
  const liveReasonRef = useRef<{ text: string; node: HTMLPreElement | null }>({ text: "", node: null });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("srouter-chat-opts");
      if (raw) setOpts({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* abaikan */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("srouter-chat-opts", JSON.stringify(opts)); } catch { /* abaikan */ }
  }, [opts]);

  useEffect(() => {
    if (!model && catalog.length) setModel(catalog[0].model);
    else if (model && catalog.length && !catalog.some((c) => c.model === model)) setModel(catalog[0].model);
  }, [catalog, model]);

  const cap = useMemo(() => capabilitiesOf(model), [model]);

  useEffect(() => {
    if (!model) return;
    setOpts((cur) => {
      const n = { ...cur };
      let ch = false;
      if (n.maxTokens === 800 && cap.reasoning) { n.maxTokens = 1600; ch = true; }
      if (n.maxTokens === 1600 && !cap.reasoning) { n.maxTokens = 800; ch = true; }
      if (!cap.supportsEffort && n.effort !== "default") { n.effort = "default"; ch = true; }
      if (!cap.reasoning && n.includeReasoning) { n.includeReasoning = false; ch = true; }
      return ch ? n : cur;
    });
  }, [model, cap]);

  function scrollToBottom() {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  // Bersihkan node streaming dari DOM (setelah riwayat diperbarui).
  function clearLive() {
    if (liveWrapRef.current?.parentElement) {
      liveWrapRef.current.parentElement.removeChild(liveWrapRef.current);
    }
    liveWrapRef.current = null;
    liveThingRef.current = null;
    liveTextRef.current = null;
    liveReasonRef.current = { text: "", node: null };
  }

  async function send(regen = false) {
    if (busy || !model) return;

    let base = msgs;
    if (regen) {
      while (base.length && base[base.length - 1].role === "assistant") base = base.slice(0, -1);
      if (!base.length) return;
    } else {
      const text = input.trim();
      if (!text) return;
      base = [...msgs, { role: "user", content: text, at: Date.now() }];
      setInput("");
    }

    setErr(null);
    clearLive();
    setMsgs(base);
    setBusy(true);

    const payload: Record<string, unknown> = {
      model,
      messages: [
        ...(opts.system.trim() ? [{ role: "system", content: opts.system.trim() }] : []),
        ...base.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: opts.maxTokens,
    };
    if (opts.temperature !== DEFAULTS.temperature) payload.temperature = opts.temperature;
    if (opts.includeReasoning === false) payload.include_reasoning = false;
    if (cap.supportsEffort && opts.effort === "low") payload.reasoning_effort = "low";
    if (opts.stream) payload.stream = true;

    const ac = new AbortController();
    abortRef.current = ac;

    let finalContent = "";
    let finalReasoning = "";
    let usedModel = model;

    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-router-secret": secret },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });

      if (!res.ok) {
        const raw = await res.json().catch(() => null);
        const m = raw?.error?.message || raw?.error || `HTTP ${res.status}`;
        setErr(typeof m === "string" ? m : JSON.stringify(m));
        setMsgs(base);
        return;
      }

      // ── NON-STREAM ──────────────────────────────────────────────────────
      if (!opts.stream) {
        const raw = await res.json();
        const body = raw?.data ?? raw;
        const msg = body?.choices?.[0]?.message ?? {};
        setMsgs([...base, {
          role: "assistant",
          content: msg.content || "(kosong)",
          reasoning: msg.reasoning || undefined,
          model: body?.model || model,
          at: Date.now(),
        }]);
        return;
      }

      // ── STREAM: loop DI SINI (event handler) ───────────────────────────
      // Loop di event handler tidak bisa di-cleanup React, jadi stream tidak
      // akan di-abort di tengah. (Sebelumnya di useEffect -> ERR_ABORTED.)
      const reader = res.body?.getReader();
      if (!reader) { setErr(t.noStream); setMsgs(base); return; }

      // Node streaming: dibangun & ditulis LANGSUNG ke DOM.
      // Tidak ada React state yang diubah selama stream -> tidak ada re-render.
      const wrap = document.createElement("div");
      wrap.className = "chat-line assistant chat-live";
      wrap.innerHTML =
        '<span class="chat-who">ai</span>' +
        '<details class="chat-think" hidden><summary><span class="chat-think-label"></span></summary><pre></pre></details>' +
        '<span class="chat-body"></span>';
      logRef.current?.appendChild(wrap);
      liveWrapRef.current = wrap;

      const thinkPre = wrap.querySelector("pre");
      const thinkLabel = wrap.querySelector(".chat-think-label");
      const thinkBox = wrap.querySelector("details");
      const bodyEl = wrap.querySelector(".chat-body");

      const dec = new TextDecoder();
      let buf = "";
      let content = "", reasoning = "";
      usedModel = model;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const line of parts) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const j = JSON.parse(data);
            const d = j?.choices?.[0]?.delta ?? {};
            if (j?.model) usedModel = j.model;

            if (d.reasoning) {
              reasoning += d.reasoning;
              if (opts.showThinking && thinkPre && thinkBox && thinkLabel) {
                thinkBox.hidden = false;
                thinkPre.textContent = reasoning;
                thinkLabel.textContent = `thinking (${reasoning.length} char · berjalan…)`;
              }
            }
            if (d.content) {
              content += d.content;
              if (bodyEl) bodyEl.textContent = content;
            }
            // scroll langsung ke DOM
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          } catch { /* chunk tidak lengkap */ }
        }
      }

      clearLive();
      finalContent = content;
      finalReasoning = reasoning;
    } catch (e) {
      clearLive();
      if (!(e instanceof Error && e.name === "AbortError")) {
        setErr(e instanceof Error ? e.message : t.sendFailed);
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }

    // Setelah stream selesai: simpan ke riwayat (satu re-render).
    if (finalContent || finalReasoning) {
      setMsgs([...base, {
        role: "assistant",
        content: finalContent || "(kosong)",
        reasoning: finalReasoning || undefined,
        model: usedModel,
        at: Date.now(),
      }]);
    }
  }

  function stop() { abortRef.current?.abort(); }

  async function copy(i: number) {
    const r = await copyText(msgs[i].content);
    if (r.ok) {
      setCopied(i); setTimeout(() => setCopied(null), 1600);
    } else {
      setErr(`${t.copyFailed} (${r.reason || "clipboard"}).`);
      setTimeout(() => setErr(null), 5000);
    }
  }

  function exportChat() {
    const txt = msgs.map((m) =>
      `[${m.role === "user" ? "you" : "ai"}]` +
      (m.reasoning ? `\n(thinking) ${m.reasoning}` : "") +
      `\n${m.content}\n`
    ).join("\n");
    const blob = new Blob([txt], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `srouter-chat-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!catalog.length) {
    return (
      <section className="chat-wrap">
        <div className="chat-empty">
          <AlertTriangle size={20} />
          <strong>{t.noModels}</strong>
          <p className="muted small">Aktifkan minimal satu provider yang punya model untuk mulai chat.</p>
          {offProviders.length > 0 && (
            <p className="muted small">
              {offProviders.length} provider nonaktif: {offProviders.map((p) => p.name).join(", ")}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="chat-wrap">
      <div className="chat-bar">
        <span className="chat-label"><Cpu size={13} /> model</span>
        <select className="chat-select" value={model} onChange={(e) => setModel(e.target.value)}
                disabled={busy} aria-label="Pilih model">
          {catalog.map((c) => (
            <option key={`${c.providerId}:${c.model}`} value={c.model}>
              {c.model} ({c.providerName})
            </option>
          ))}
        </select>
        <span className="chat-count">{catalog.length} model · {activeProviders.length} provider aktif</span>
        {model && (
          <span className={`chat-cap ${cap.reasoning ? "on" : ""}`} title={cap.note}>
            {cap.reasoning ? t.thinking : t.std}{cap.vision ? " / " + t.vision : ""}
          </span>
        )}
        <button className={`btn icon-btn ${showOpts ? "on" : ""}`} onClick={() => setShowOpts((v) => !v)}
                aria-label={t.opts} aria-expanded={showOpts} title={t.opts}>
          <Settings2 size={14} />
        </button>
        <button className="btn icon-btn" onClick={exportChat} disabled={!msgs.length}
                aria-label={t.export} title={t.export}>
          <Download size={14} />
        </button>
        <button className="btn icon-btn" onClick={() => { setMsgs([]); setErr(null); }}
                disabled={busy || !msgs.length} aria-label={t.clear} title={t.clear}>
          <Trash2 size={14} />
        </button>
      </div>

      {showOpts && (
        <div className="chat-opts">
          <label className="chat-opt">
            <input type="checkbox" checked={opts.stream}
                   onChange={(e) => setOpts({ ...opts, stream: e.target.checked })} />
            <span>{t.streaming}</span>
            <small className="muted">teks muncul bertahap</small>
          </label>

          {cap.reasoning ? (
            <>
              <label className="chat-opt">
                <input type="checkbox" checked={opts.includeReasoning}
                       onChange={(e) => setOpts({ ...opts, includeReasoning: e.target.checked })} />
                <span>{t.wantThinking}</span>
                <small className="muted">kirim reasoning dari model</small>
              </label>
              <label className="chat-opt">
                <input type="checkbox" checked={opts.showThinking}
                       onChange={(e) => setOpts({ ...opts, showThinking: e.target.checked })} />
                <span>{t.showThinking}</span>
                <small className="muted">blok [thinking] di atas jawaban</small>
              </label>
              {cap.supportsEffort && (
                <label className="chat-opt">
                  <span>{t.thinkDepth}</span>
                  <select value={opts.effort}
                          onChange={(e) => setOpts({ ...opts, effort: e.target.value as Opts["effort"] })}>
                    <option value="default">{t.deepDefault}</option>
                    <option value="low">{t.deepLow}</option>
                  </select>
                </label>
              )}
            </>
          ) : (
            <div className="chat-opt chat-opt-note">
              <span>{t.thinking}</span>
              <small className="muted">model ini tidak mendukung thinking — opsi disembunyikan otomatis.</small>
            </div>
          )}

          <label className="chat-opt">
            <span>{t.maxTokens}</span>
            <input type="number" min={300} max={8000} step={100} value={opts.maxTokens}
                   onChange={(e) => setOpts({ ...opts, maxTokens: Math.min(8000, Math.max(300, Number(e.target.value) || 800)) })} />
            <small className="muted">300–8000{cap.reasoning ? " · reasoning butuh lebih besar" : ""}</small>
          </label>

          <label className="chat-opt">
            <span>{t.temperature}</span>
            <input type="number" min={0} max={2} step={0.1} value={opts.temperature}
                   onChange={(e) => setOpts({ ...opts, temperature: Math.min(2, Math.max(0, Number(e.target.value) || 0)) })} />
            <small className="muted">0–2</small>
          </label>

          <div className="chat-opt chat-opt-wide chat-capinfo">
            <span>{t.modelCaps}</span>
            <div className="chat-caps"><b>{model || "-"}</b><em>{cap.note}</em></div>
          </div>

          <label className="chat-opt chat-opt-wide">
            <span>{t.sysPrompt}</span>
            <textarea rows={2} value={opts.system} placeholder={t.optional}
                      onChange={(e) => setOpts({ ...opts, system: e.target.value })} />
          </label>
        </div>
      )}

      <div className="chat-log" ref={logRef} role="log" aria-live="polite">
        {!msgs.length && !busy && (
          <div className="chat-hint"><span className="chat-dim">$ kirim pesan untuk mulai tes.</span></div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`chat-line ${m.role}`}>
            <span className="chat-who">{m.role === "user" ? "you" : "ai"}</span>
            {m.role === "assistant" && opts.showThinking && m.reasoning ? (
              <details className="chat-think">
                <summary><Brain size={12} /> {t.thinkingChars} ({m.reasoning.length} char)</summary>
                <pre>{m.reasoning}</pre>
              </details>
            ) : null}
            <span className="chat-body">{m.content}</span>
            {m.role === "assistant" && (
              <span className="chat-meta2">
                {m.model && <span className="muted">{m.model}</span>}
                {m.content && (
                  <button className="chat-mini" onClick={() => copy(i)}>
                    <Copy size={11} />{copied === i ? t.copied : t.copy}
                  </button>
                )}
              </span>
            )}
          </div>
        ))}
        {busy && !opts.stream && (
          <div className="chat-line assistant">
            <span className="chat-who">ai</span>
            <span className="chat-body chat-dim"><Loader2 size={13} className="spin" /> memproses…</span>
          </div>
        )}
      </div>

      {err && <div className="chat-err" role="alert"><AlertTriangle size={14} /> <span>{err}</span></div>}

      <div className="chat-acts">
        <button className="btn" onClick={() => void send(true)} disabled={busy || !msgs.length}>
          <RefreshCw size={13} /><span>{t.retry}</span>
        </button>
        {busy && (
          <button className="btn danger" onClick={stop}>
            <Square size={13} /><span>{t.stop}</span>
          </button>
        )}
      </div>

      <form className="chat-input-row" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <span className="chat-prompt">$</span>
        <input className="chat-input" value={input} onChange={(e) => setInput(e.target.value)}
               placeholder={t.typeMsg} disabled={busy} aria-label={t.msg} autoComplete="off" />
        <button className="btn primary chat-send" type="submit" disabled={busy || !input.trim()}>
          {busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
          <span>{t.send}</span>
        </button>
      </form>
    </section>
  );
}
