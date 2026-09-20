
// ─────────────────────────────────────────────────────────────────────────────
// LoginTerminal — layar unlock / setup SRouter, tema terminal.
//
// Perilaku SENGAJA dikembalikan ke bentuk asli:
//   • Tombol label selalu `[ lanjutkan ]` — TIDAK berubah jadi "[ butuh 16
//     karakter ]". Tidak ada logika label dinamis.
//   • Hanya menampilkan `panjang: N` — TIDAK ada tambahan "— siap" / "— kurang N".
//   • Enter selalu memanggil onUnlock (seperti aslinya), tanpa gate panjang.
//   • Tombol disabled HANYA saat `busy === "unlock"` — sama seperti aslinya.
//
// Yang dipertahankan: tema terminal (header, panel dashed, prompt $, [show]/[hide]).
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useState } from "react";

type LoginTerminalProps = {
  mode: "unlock" | "setup";
  secret: string;
  setSecret: (v: string) => void;
  onUnlock: (isNew: boolean) => void;
  busy?: string | null;
  error?: string | null;
  title: string;
  help?: string;
  continueLabel?: string;
};

export default function LoginTerminal({
  mode,
  secret,
  setSecret,
  onUnlock,
  busy = null,
  error = null,
  title,
  help,
  continueLabel,
}: LoginTerminalProps) {
  const [reveal, setReveal] = useState(false);
  const isNew = mode === "setup";

  return (
    <main className="term-shell term-shell-static" role="main">
      <div className="term-scanline" aria-hidden="true" />

      <div className="term-stack">
        <header className="term-head">
          <span className="term-logo" aria-hidden="true" />
          <span className="term-spinner" aria-hidden="true" />
          <span className="term-title">
            {isNew ? "INITIAL SETUP" : "AUTHENTICATION REQUIRED"}
          </span>
        </header>

        <section className="term-box term-login">
          <div className="term-log term-log-sm">
            <div className="term-line">
              <span className="term-ts">[srouter]</span>
              <span className="term-msg">{title.toLowerCase()}</span>
            </div>
            <div className="term-line">
              <span className="term-ts">[info]</span>
              <span className="term-dim">{help}</span>
            </div>
          </div>

          <form
            className="term-form"
            onSubmit={(e) => {
              e.preventDefault();
              onUnlock(isNew);
            }}
          >
            <label className="term-label" htmlFor="router-secret">
              router secret
            </label>

            <div className="term-inputrow">
              <span className="term-promptmark">$</span>
              <input
                id="router-secret"
                className="term-input"
                type={reveal ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onUnlock(isNew)}
                placeholder="at least 16 characters"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="term-reveal"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "hide secret" : "show secret"}
              >
                {reveal ? "[hide]" : "[show]"}
              </button>
            </div>

            <div className="term-meta">
              <span className="term-dim">length: {secret.length}</span>
            </div>

            {error && (
              <div className="term-error" role="alert">
                <span className="term-mark">[!]</span> {error}
              </div>
            )}

            <button className="term-submit" type="submit" disabled={busy === "unlock"}>
              {busy === "unlock" ? "[ ... ] processing" : `[ ${(continueLabel || "continue").toLowerCase()} ]`}
            </button>
          </form>

          {/* catatan hanya untuk setup; pada mode unlock tidak ditampilkan */}
          {isNew && (
            <div className="term-note">
              secret ini tidak bisa dipulihkan. simpan di tempat aman.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
