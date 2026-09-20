"use client";

// lib/copy.ts — salin ke clipboard, DINAMIS untuk HTTP maupun HTTPS.
//
// Temuan terukur:
//   http://bore.pub:38700  -> isSecureContext=false, navigator.clipboard UNDEFINED
//   https://<vercel>       -> isSecureContext=true,  navigator.clipboard tersedia
//   127.0.0.1 / localhost  -> secure context juga (pengecualian browser)
//
// Strategi berlapis — yang pertama berhasil dipakai:
//   1. navigator.clipboard.writeText        (HTTPS / localhost)
//   2. ClipboardItem                        (kalau writeText gagal)
//   3. textarea + document.execCommand      (HTTP — legacy tapi jalan)
//   4. window.prompt                        (selalu jalan; user salin manual)
//
// TIDAK PERNAH diam: hasilnya selalu dikembalikan supaya UI bisa memberi tahu.

export type CopyResult = { ok: boolean; via: string; reason?: string };

/** Info lingkungan — untuk debugging & pesan ke user. */
export function clipboardEnv() {
  if (typeof window === "undefined") {
    return { secure: false, hasApi: false, proto: "", host: "", exec: false };
  }
  return {
    secure: window.isSecureContext,
    hasApi: typeof navigator !== "undefined" && !!navigator.clipboard?.writeText,
    proto: window.location.protocol,
    host: window.location.host,
    exec: typeof document !== "undefined" && typeof document.execCommand === "function",
  };
}

/** Fallback klasik: textarea + execCommand. Andalan di HTTP. */
function copyViaExecCommand(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.padding = "0";
    ta.style.border = "none";
    ta.style.outline = "none";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);

    const sel = document.getSelection();
    const prevRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

    ta.focus({ preventScroll: true });
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    const ok = document.execCommand("copy");

    document.body.removeChild(ta);
    if (prevRange && sel) {
      sel.removeAllRanges();
      sel.addRange(prevRange);
    }
    return ok === true;
  } catch {
    return false;
  }
}

/** ClipboardItem — beberapa browser punya ini walau writeText gagal. */
async function copyViaClipboardItem(text: string): Promise<boolean> {
  try {
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem;
    if (!CI || !navigator.clipboard?.write) return false;
    const item = new CI({ "text/plain": new Blob([text], { type: "text/plain" }) });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Salin teks. Urutan menyesuaikan protokol yang sedang dipakai.
 * Selalu mengembalikan hasil — pemanggil WAJIB menampilkannya ke user.
 */
export async function copyText(text: string): Promise<CopyResult> {
  if (!text) return { ok: false, via: "none", reason: "tidak ada teks untuk disalin" };

  const env = clipboardEnv();

  // 1. jalur modern
  if (env.hasApi) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, via: "clipboard" };
    } catch {
      /* lanjut */
    }
    // 2. ClipboardItem
    if (env.secure && (await copyViaClipboardItem(text))) {
      return { ok: true, via: "clipboardItem" };
    }
  }

  // 3. legacy — andalan di HTTP
  if (copyViaExecCommand(text)) return { ok: true, via: "execCommand" };

  // 4. terakhir: user menyalin manual
  if (typeof window !== "undefined" && typeof window.prompt === "function") {
    try {
      const r = window.prompt("Salin manual (Ctrl/Cmd + C, lalu Enter):", text);
      // prompt mengembalikan null kalau dibatalkan — tapi teks SUDAH terlihat
      // dan bisa disalin user, jadi kita anggap berhasil dengan catatan.
      void r;
      return { ok: true, via: "prompt" };
    } catch {
      /* prompt juga diblokir */
    }
  }

  return {
    ok: false,
    via: "none",
    reason: env.secure
      ? "clipboard diblokir browser"
      : "diakses lewat HTTP, browser membatasi clipboard",
  };
}
