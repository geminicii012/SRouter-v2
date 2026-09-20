
// ─────────────────────────────────────────────────────────────────────────────
// BootTerminal — boot screen bergaya log deployment (referensi: Render).
//
// Perbedaan utama dari versi sebelumnya:
//   • ASCII art TIDAK di bawah log — ia diletakkan di TENGAH, setelah 2 baris
//     log pertama, menjadi "hero" di antara blok log awal dan blok log akhir.
//   • Log memakai kolom timestamp berjarak tetap, bukan flex-gap.
//   • Baris log terakhir berwarna lebih terang sebagai penutup.
//   • Footer CTA di bawah.
//   • Tanpa border di sekeliling panel — hanya kotak dashed untuk ASCII.
//
// Yang dipertahankan:
//   • State machine: sequence berurutan, onDone() HANYA di akhir.
//   • Progress & checklist bertahap.
//   • Prompt terminal sebagai elemen terakhir + hold.
//   • reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import { useEffect, useRef, useState } from "react";

type LogRow = { ts: string; msg: string; bright?: boolean };

type BootTerminalProps = {
  onDone: () => void;
  steps?: string[];
};

const DEFAULT_STEPS = ["VERIFYING VAULT", "PREPARING ROUTES", "SYSTEM READY"];

const BANNER = [
  "  ____  ____            _            ",
  " / ___||  _ \\ ___  _   _| |_ ___ _ __ ",
  " \\___ \\| |_) / _ \\| | | | __/ _ \\ '__|",
  "  ___) |  _ < (_) | |_| | ||  __/ |   ",
  " |____/|_| \\_\\___/ \\__,_|\\__\\___|_|   ",
];

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const T = {
  start: 300,
  toWake: 1500,
  toStep1: 1300,
  step1Hold: 1200,
  step2Hold: 1300,
  step3Hold: 1400,
  finalHold: 2200,
  checklist: 420,
  promptHold: 1400,
  reduceFactor: 0.08,
};

export default function BootTerminal({
  onDone,
  steps = DEFAULT_STEPS,
}: BootTerminalProps) {
  const [head, setHead] = useState<LogRow[]>([]);   // log sebelum ASCII
  const [tail, setTail] = useState<LogRow[]>([]);   // log setelah ASCII
  const [split, setSplit] = useState(false);        // ASCII sudah tampil
  const [showPrompt, setShowPrompt] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const started = useRef(false);

  const pushHead = (msg: string, bright = false) =>
    setHead((p) => [...p, { ts: stamp(), msg, bright }]);
  const pushTail = (msg: string, bright = false) =>
    setTail((p) => [...p, { ts: stamp(), msg, bright }]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const f = reduced ? T.reduceFactor : 1;
    const w = (ms: number) => sleep(Math.max(60, Math.round(ms * f)));

    (async () => {
      await w(T.start);
      pushHead("INCOMING HTTP REQUEST DETECTED ...");

      await w(T.toWake);
      pushHead("SERVICE WAKING UP ...");

      // ── ASCII art tampil di sini: setelah 2 log, sebelum sisanya ─────────
      setSplit(true);

      await w(T.toStep1);
      pushTail(`STEP 1/${steps.length} · ${steps[0].toUpperCase()}`);
      await w(T.step1Hold);

      pushTail(`STEP 2/${steps.length} · ${steps[1].toUpperCase()}`);
      await w(T.step2Hold);

      pushTail(`STEP 3/${steps.length} · ${steps[2].toUpperCase()}`);
      await w(T.step3Hold);

      pushTail("FINALIZING STARTUP ...");
      await w(T.finalHold);

      pushTail("OPTIMIZING DEPLOYMENT ...", true);
      await w(T.checklist);

      setShowPrompt(true);
      await w(T.promptHold);

      setLeaving(true);
      onDone();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Row = ({ r }: { r: LogRow }) => (
    <div className={`lg-line lg-in${r.bright ? " lg-bright" : ""}`}>
      <span className="lg-ts">{r.ts}</span>
      <span className="lg-msg">{r.msg}</span>
    </div>
  );

  return (
    <main className={`lg-shell${leaving ? " lg-leaving" : ""}`}>
      <div className="lg-scan" aria-hidden="true" />
      <div className="lg-flick" aria-hidden="true" />

      {/* header + body dalam satu kolom: posisi header selalu mengikuti
          konten, jadi tidak mungkin bertabrakan dengan log */}
      <div className="lg-top">
        <header className="lg-head">
          <span className="lg-brand" aria-hidden="true" />
          <span className="lg-brandname">SRouter</span>
          <span className="lg-spin" aria-hidden="true" />
          <span className="lg-title">APPLICATION LOADING</span>
        </header>

        <section className="lg-body">
        {/* log awal */}
        <div className="lg-log">
          {head.map((r, i) => <Row r={r} key={`h${i}`} />)}
        </div>

        {/* ASCII art — hero di tengah, dibungkus kotak dashed */}
        {split && (
          <pre className="lg-art" aria-hidden="true">{BANNER.join("\n")}</pre>
        )}

        {/* log akhir */}
        <div className="lg-log">
          {tail.map((r, i) => <Row r={r} key={`t${i}`} />)}
        </div>

        {/* prompt terminal */}
        {showPrompt && (
          <div className="lg-prompt lg-in">
            <span className="lg-user">agentuser@srouter</span>
            <span className="lg-sep">:</span>
            <span className="lg-path">~</span>
            <span className="lg-sep">$</span>
            <span className="lg-caret">▊</span>
          </div>
        )}
        </section>
      </div>
    </main>
  );
}
