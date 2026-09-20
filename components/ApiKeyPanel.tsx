"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ApiKeyPanel — CRUD API key dengan whitelist model, token limit, masa aktif,
// RPM, dan concurrent.
//
// Model yang bisa dipilih: HANYA dari provider yang AKTIF.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  Key, Plus, Trash2, Pencil, Copy, Check, X, Loader2,
  AlertTriangle, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { copyText } from "@/lib/copy";

type Locale = "id" | "en";

const L = {
  id: {
    unlimited: "tanpa batas", reload: "Muat ulang", createKey: "buat key", keyCreated: "API key dibuat",
    saveNow: "Simpan sekarang — tidak bisa dilihat lagi", copy: "Salin", copied: "Tersalin",
    noKeys: "Belum ada API key", noKeysHint: "Buat key untuk memberi akses terbatas ke endpoint /v1.",
    noModels: "Tidak ada model tersedia", noModelsHint: "Aktifkan provider dulu agar model bisa dipilih.",
    token: "token", rpm: "rpm", concurrent: "concurrent", expired: "kedaluwarsa", lastUsed: "pakai terakhir",
    edit: "edit", remove: "hapus", name: "nama", nameHint: "mis. bot-riset",
    allowedModels: "model yang diizinkan", allowedHint: "Kosongkan untuk mengizinkan semua model.",
    tokenLimit: "batas token", rpmLimit: "batas rpm", concLimit: "batas concurrent",
    expires: "masa aktif", active: "aktif", create: "Buat", save: "Simpan", cancel: "Batal",
    showKey: "Tampilkan key", hideKey: "Sembunyikan key", copyKey: "Salin API key", keyNotStored: "Key tidak tersimpan",
    confirmRemove: "Hapus API key ini?", savingLabel: "menyimpan", loadingLabel: "memuat", custom: "kustom",
    selectAll: "pilih semua", clearAll: "kosongkan", noExpiry: "tanpa kedaluwarsa",
  },
  en: {
    unlimited: "unlimited", reload: "Reload", createKey: "create key", keyCreated: "API key created",
    saveNow: "Save now - it cannot be viewed again", copy: "Copy", copied: "Copied",
    noKeys: "No API keys yet", noKeysHint: "Create a key to grant scoped access to the /v1 endpoint.",
    noModels: "No models available", noModelsHint: "Enable a provider first so models can be selected.",
    token: "token", rpm: "rpm", concurrent: "concurrent", expired: "expires", lastUsed: "last used",
    edit: "edit", remove: "delete", name: "name", nameHint: "e.g. research-bot",
    allowedModels: "allowed models", allowedHint: "Leave empty to allow every model.",
    tokenLimit: "token limit", rpmLimit: "rpm limit", concLimit: "concurrent limit",
    expires: "validity", active: "active", create: "Create", save: "Save", cancel: "Cancel",
    showKey: "Show key", hideKey: "Hide key", copyKey: "Copy API key", keyNotStored: "Key not stored",
    confirmRemove: "Delete this API key?", savingLabel: "saving", loadingLabel: "loading", custom: "custom",
    selectAll: "select all", clearAll: "clear all", noExpiry: "no expiry",
  },
};

type Provider = { id: string; name: string; enabled: boolean; models: string[] };
type VaultLike = { providers: Provider[] };

type Limits = { tokenLimit: number | null; rpmLimit: number | null; concurrentLimit: number | null };
type ApiKeyRow = {
  id: string; name: string; keyMask: string; secret?: string; enabled: boolean;
  models: string[]; limits: Limits; tokensUsed: number; requests: number;
  expiresAt: string | null; createdAt: string; lastUsedAt: string | null;
};

const TOKEN_PRESETS: { label: string; value: number | null }[] = [
  { label: "unlimited", value: null },
  { label: "1k", value: 1_000 },
  { label: "10k", value: 10_000 },
  { label: "100k", value: 100_000 },
  { label: "1m", value: 1_000_000 },
  { label: "10m", value: 10_000_000 },
  { label: "100m", value: 100_000_000 },
  { label: "1b", value: 1_000_000_000 },
];

const RPM_PRESETS: { label: string; value: number | null }[] = [
  { label: "unlimited", value: null },
  { label: "5", value: 5 }, { label: "10", value: 10 },
  { label: "30", value: 30 }, { label: "60", value: 60 },
  { label: "120", value: 120 }, { label: "300", value: 300 },
];

const CONC_PRESETS: { label: string; value: number | null }[] = [
  { label: "unlimited", value: null },
  { label: "1", value: 1 }, { label: "2", value: 2 },
  { label: "3", value: 3 }, { label: "5", value: 5 }, { label: "10", value: 10 },
];

function fmtNum(n: number | null, unlimitedWord = "unlimited"): string {
  if (n === null) return unlimitedWord;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n % 1e9 ? 1 : 0)}b`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}m`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}k`;
  return String(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function expired(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() > Date.parse(iso);
}

export default function ApiKeyPanel({ vault, secret, locale = "id" }: { vault: VaultLike; secret: string; locale?: Locale }) {
  const t = L[locale];
  // model dari provider yang AKTIF saja
  const activeModels = useMemo(
    () => vault.providers
      .filter((p) => p.enabled)
      .flatMap((p) => (p.models || []).map((m) => ({ model: m, provider: p.name })))
      .sort((a, b) => a.model.localeCompare(b.model)),
    [vault],
  );
  const activeProviders = vault.providers.filter((p) => p.enabled);

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | { mode: "create" | "edit"; row?: ApiKeyRow }>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const H = { "content-type": "application/json", "x-router-secret": secret };

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/apikeys", { headers: H });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setKeys(j.keys || []);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "gagal memuat");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  async function save(form: { name: string; models: string[]; limits: Limits; expiresAt: string | null; enabled: boolean }, id?: string) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/apikeys", {
        method: id ? "PUT" : "POST",
        headers: H,
        body: JSON.stringify(id ? { id, ...form } : form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (!id && j?.key?.fullKey) setNewKey(j.key.fullKey);
      setModal(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Hapus API key ini?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/apikeys?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: H });
      if (!r.ok) throw new Error((await r.json())?.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "gagal menghapus");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(row: ApiKeyRow) {
    setBusy(true);
    try {
      await fetch("/api/apikeys", {
        method: "PUT", headers: H,
        body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function resetUsage(row: ApiKeyRow) {
    if (!confirm(`Reset pemakaian "${row.name}"?`)) return;
    setBusy(true);
    try {
      await fetch("/api/apikeys", {
        method: "PUT", headers: H,
        body: JSON.stringify({ id: row.id, resetUsage: true }),
      });
      await load();
    } finally { setBusy(false); }
  }

  async function copy(text: string, tag: string) {
    setCopyNote(null);
    const r = await copyText(text);
    if (r.ok) {
      setCopied(tag);
      setCopyNote("tersalin ke clipboard.");
      setTimeout(() => { setCopied(null); setCopyNote(null); }, 1800);
    } else {
      // JANGAN PERNAH diam: user harus tahu kenapa tidak terjadi apa-apa.
      setCopied(null);
      setCopyNote(
        `Gagal menyalin — ${r.reason || "clipboard diblokir browser"}. ` +
        `Buka key lewat HTTPS agar tombol salin bekerja, atau salin manual dari kotak.`
      );
      // pesan gagal tidak auto-hilang, biar sempat dibaca
    }
  }

  if (!activeModels.length) {
    return (
      <section className="apik-wrap">
        <div className="apik-empty">
          <AlertTriangle size={20} />
          <strong>{t.noModels}</strong>
          <p className="muted small">Aktifkan minimal satu provider yang punya model.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="apik-wrap">
      {/* bar atas */}
      <div className="apik-bar">
        <span className="apik-count">
          {keys.length} key / {activeModels.length} model / {activeProviders.length} provider
        </span>
        <button className="btn icon-btn" onClick={() => void load()} disabled={busy || loading} title={t.reload}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
        <button className="btn primary" onClick={() => setModal({ mode: "create" })} disabled={busy}>
          <Plus size={14} /><span>{t.createKey}</span>
        </button>
      </div>

      {err && <div className="apik-err"><AlertTriangle size={14} /> <span>{err}</span></div>}
      {copyNote && <div className="apik-warnbox"><AlertTriangle size={13} /> <span>{copyNote}</span></div>}

      {/* key baru — tampilkan sekali */}
      {newKey && (
        <div className="apik-newbox">
          <div className="apik-newhead">
            <Check size={14} /> <strong>{t.keyCreated}</strong>
            <button className="btn icon-btn" onClick={() => setNewKey(null)} aria-label="Tutup"><X size={13} /></button>
          </div>
          <p className="muted small">Simpan sekarang — nilai penuh tidak bisa ditampilkan lagi.</p>
          <div className="apik-newkey">
            <code>{showKey ? newKey : `${newKey.slice(0, 14)}${"•".repeat(20)}`}</code>
            <button className="btn icon-btn" onClick={() => setShowKey((v) => !v)} aria-label="Tampilkan">
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button className="btn icon-btn" onClick={() => copy(newKey, "new")} aria-label="Salin key">
              {copied === "new" ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* tabel */}
      {loading ? (
        <div className="apik-loading"><Loader2 size={16} className="spin" /> memuat…</div>
      ) : keys.length === 0 ? (
        <div className="apik-empty">
          <Key size={20} />
          <strong>{t.noKeys}</strong>
          <p className="muted small">Buat key pertama untuk mengakses API dengan batasan.</p>
        </div>
      ) : (
        <div className="apik-list">
          {keys.map((k) => {
            const exp = expired(k.expiresAt);
            const quota = k.limits.tokenLimit;
            const pct = quota ? Math.min(100, Math.round((k.tokensUsed / quota) * 100)) : 0;
            return (
              <article key={k.id} className={`apik-row ${k.enabled && !exp ? "" : "off"}`}>
                <div className="apik-rowhead">
                  <strong className="apik-name">{k.name}</strong>
                  <span className={`apik-badge ${k.enabled && !exp ? "on" : "off"}`}>
                    {exp ? "kedaluwarsa" : k.enabled ? "aktif" : "nonaktif"}
                  </span>
                  <code className="apik-mask">{k.keyMask}</code>
                  <button className="btn icon-btn apik-copy" onClick={() => copy(k.secret || "", k.id)}
                          disabled={!k.secret} aria-label="Salin API key"
                          title={k.secret ? t.copyKey : t.keyNotStored}>
                    {copied === k.id ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                  {copied === k.id && <span className="apik-ok">✓</span>}
                </div>

                <div className="apik-meta">
                  <span>
                    model:{" "}
                    {k.models.length === 0
                      ? <em className="muted">semua model ({activeModels.length})</em>
                      : <b>{k.models.length}</b>}
                  </span>
                  <span>token: <b>{fmtNum(k.tokensUsed)}</b>{quota ? ` / ${fmtNum(quota)}` : ""}</span>
                  <span>rpm: <b>{fmtNum(k.limits.rpmLimit)}</b></span>
                  <span>concurrent: <b>{fmtNum(k.limits.concurrentLimit)}</b></span>
                  <span>{t.expired}: <b>{fmtDate(k.expiresAt)}</b></span>
                  <span>{t.lastUsed}: <b>{fmtDate(k.lastUsedAt)}</b></span>
                </div>

                {quota !== null && (
                  <div className="apik-progress" title={`${k.tokensUsed} / ${quota}`}>
                    <div style={{ width: `${pct}%` }} />
                    <span>{pct}%</span>
                  </div>
                )}

                <div className="apik-actions">
                  <button className="btn" onClick={() => toggleEnabled(k)} disabled={busy}>
                    {k.enabled ? "nonaktifkan" : "aktifkan"}
                  </button>
                  <button className="btn" onClick={() => setModal({ mode: "edit", row: k })} disabled={busy}>
                    <Pencil size={12} /><span>{t.edit}</span>
                  </button>
                  <button className="btn" onClick={() => void resetUsage(k)} disabled={busy}>reset</button>
                  <button className="btn danger" onClick={() => void remove(k.id)} disabled={busy}>
                    <Trash2 size={12} /><span>{t.remove}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modal && (
        <KeyDialog
          mode={modal.mode}
          row={modal.row}
          models={activeModels}
          busy={busy}
          t={t}
          onClose={() => setModal(null)}
          onSave={save}
        />
      )}
    </section>
  );
}

// ── dialog buat/edit ────────────────────────────────────────────────────────
function KeyDialog({
  mode, row, models, busy, t, onClose, onSave,
}: {
  mode: "create" | "edit";
  row?: ApiKeyRow;
  models: { model: string; provider: string }[];
  busy: boolean;
  t: typeof L["id"];
  onClose: () => void;
  onSave: (f: { name: string; models: string[]; limits: Limits; expiresAt: string | null; enabled: boolean }, id?: string) => void;
}) {
  const [name, setName] = useState(row?.name || "");
  const [selected, setSelected] = useState<string[]>(row?.models || []);
  const [tokenLimit, setTokenLimit] = useState<string>(row?.limits.tokenLimit != null ? String(row.limits.tokenLimit) : "");
  const [rpmLimit, setRpmLimit] = useState<string>(row?.limits.rpmLimit != null ? String(row.limits.rpmLimit) : "");
  const [concLimit, setConcLimit] = useState<string>(row?.limits.concurrentLimit != null ? String(row.limits.concurrentLimit) : "");
  const [expiresAt, setExpiresAt] = useState<string>(row?.expiresAt ? row.expiresAt.slice(0, 10) : "");
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [q, setQ] = useState("");

  const shown = models.filter(
    (m) => !q || m.model.toLowerCase().includes(q.toLowerCase()) || m.provider.toLowerCase().includes(q.toLowerCase()),
  );
  const allOn = selected.length === 0;

  function toggleModel(m: string) {
    setSelected((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]);
  }

  const parse = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = Number(v.replace(/[,_\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="dialog apik-dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === "create" ? "[ BUAT API KEY ]" : "[ EDIT API KEY ]"}</h2>

        <div className="apik-form">
          <label className="apik-field">
            <span>{t.name}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.nameHint} />
          </label>

          {/* model whitelist */}
          <div className="apik-field">
            <span>{t.allowedModels}</span>
            <p className="muted small">
              {allOn
                ? `semua model provider aktif (${models.length})`
                : `${selected.length} dari ${models.length} model dipilih`}
            </p>
            <div className="apik-modelactions">
              <button className="btn" onClick={() => setSelected([])} type="button">semua</button>
              <button className="btn" onClick={() => setSelected(models.map((m) => m.model))} type="button">pilih semua</button>
              <input className="apik-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="cari model…" />
            </div>
            <div className="apik-modellist">
              {shown.map((m) => (
                <label key={`${m.provider}:${m.model}`} className="apik-modelrow">
                  <input type="checkbox" checked={selected.includes(m.model)} onChange={() => toggleModel(m.model)} />
                  <span className="apik-modelname">{m.model}</span>
                  <span className="tag">{m.provider}</span>
                </label>
              ))}
              {!shown.length && <p className="muted small">tidak ada model cocok.</p>}
            </div>
          </div>

          {/* limit */}
          <div className="apik-grid2">
            <label className="apik-field">
              <span>{t.tokenLimit}</span>
              <div className="apik-presets">
                {TOKEN_PRESETS.map((p) => (
                  <button key={p.label} type="button"
                          className={`apik-chip ${(p.value === null && !tokenLimit) || String(p.value) === tokenLimit ? "on" : ""}`}
                          onClick={() => setTokenLimit(p.value === null ? "" : String(p.value))}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={tokenLimit} onChange={(e) => setTokenLimit(e.target.value)} placeholder={t.custom} />
            </label>

            <label className="apik-field">
              <span>{t.rpmLimit}</span>
              <div className="apik-presets">
                {RPM_PRESETS.map((p) => (
                  <button key={p.label} type="button"
                          className={`apik-chip ${(p.value === null && !rpmLimit) || String(p.value) === rpmLimit ? "on" : ""}`}
                          onClick={() => setRpmLimit(p.value === null ? "" : String(p.value))}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={rpmLimit} onChange={(e) => setRpmLimit(e.target.value)} placeholder={t.custom} />
            </label>

            <label className="apik-field">
              <span>{t.concLimit}</span>
              <div className="apik-presets">
                {CONC_PRESETS.map((p) => (
                  <button key={p.label} type="button"
                          className={`apik-chip ${(p.value === null && !concLimit) || String(p.value) === concLimit ? "on" : ""}`}
                          onClick={() => setConcLimit(p.value === null ? "" : String(p.value))}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={concLimit} onChange={(e) => setConcLimit(e.target.value)} placeholder={t.custom} />
            </label>

            <label className="apik-field">
              <span>{t.expires}</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              <small className="muted">kosong = selamanya</small>
            </label>
          </div>

          <label className="apik-field apik-inline">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>{t.active}</span>
          </label>
        </div>

        <div className="dialog-actions">
          <button className="btn" onClick={onClose} type="button">batal</button>
          <button className="btn primary" disabled={busy || !name.trim()} type="button"
                  onClick={() => onSave({
                    name: name.trim(),
                    models: selected,
                    limits: { tokenLimit: parse(tokenLimit), rpmLimit: parse(rpmLimit), concurrentLimit: parse(concLimit) },
                    expiresAt: expiresAt ? new Date(expiresAt + "T23:59:59").toISOString() : null,
                    enabled,
                  }, row?.id)}>
            {busy ? <Loader2 size={13} className="spin" /> : null}
            {mode === "create" ? "buat" : "simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
