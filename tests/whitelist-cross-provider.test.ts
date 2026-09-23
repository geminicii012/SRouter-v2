// Uji regresi: whitelist model harus provider-aware.
//
// Bug asli: `glm-5.3-flash` ada di provider "ai" DAN "Nata". Checkbox hanya
// membandingkan NAMA model, jadi dua baris berbagi satu state -> centang satu
// baris, dua ikut tercentang, tapi hitungannya bilang "1".
import test from "node:test";
import assert from "node:assert/strict";
import { qualifiedModel, modelAllowed, checkKeyStatic, entryMatches, emptyApiKey } from "../lib/api-key";

const AI = "ai";
const NATA = "Nata";
const MODEL = "glm-5.3-flash";

// ── logika checkbox (disalin dari ApiKeyPanel: rowChecked + toggleModel) ────
function rowChecked(selected: string[], provider: string, model: string): boolean {
  return selected.some((entry) => entry === model || entry === qualifiedModel(provider, model));
}
function toggle(selected: string[], provider: string, model: string): string[] {
  const key = qualifiedModel(provider, model);
  if (selected.includes(key)) return selected.filter((entry) => entry !== key);
  const legacy = selected.filter((entry) => entry !== model);
  return [...legacy, key];
}

test("centang 1 baris -> HANYA 1 baris tercentang, hitungan = 1", () => {
  let sel: string[] = [];
  sel = toggle(sel, AI, MODEL);

  assert.equal(rowChecked(sel, AI, MODEL), true, "baris yang diklik harus tercentang");
  assert.equal(rowChecked(sel, NATA, MODEL), false, "baris provider lain TIDAK boleh ikut tercentang");
  assert.equal(sel.length, 1, "hitungan harus 1, bukan 2");

  const tercentang = [[AI, MODEL], [NATA, MODEL]].filter(([pr, mo]) => rowChecked(sel, pr, mo));
  assert.equal(tercentang.length, 1, `visual tercentang harus 1, dapat ${tercentang.length}`);
});

test("centang dua baris nama-sama beda-provider -> 2 state terpisah", () => {
  let sel: string[] = [];
  sel = toggle(sel, AI, MODEL);
  sel = toggle(sel, NATA, MODEL);

  assert.equal(rowChecked(sel, AI, MODEL), true);
  assert.equal(rowChecked(sel, NATA, MODEL), true);
  assert.equal(sel.length, 2, "dua provider berbeda = dua entri");
  assert.notEqual(sel[0], sel[1], "entri harus berbeda, bukan string yang sama");
});

test("uncheck salah satu -> hanya yang itu hilang", () => {
  let sel: string[] = [qualifiedModel(AI, MODEL), qualifiedModel(NATA, MODEL)];
  sel = toggle(sel, AI, MODEL);

  assert.equal(rowChecked(sel, AI, MODEL), false, "yang diklik hilang");
  assert.equal(rowChecked(sel, NATA, MODEL), true, "yang lain tetap tercentang");
  assert.equal(sel.length, 1);
});

test("data lama (nama polos) tetap terbaca", () => {
  const legacy: string[] = [MODEL]; // key lama tersimpan tanpa provider
  assert.equal(rowChecked(legacy, AI, MODEL), true);
  assert.equal(rowChecked(legacy, NATA, MODEL), true, "data lama memang ambigu -> dianggap cocok");
  assert.equal(modelAllowed(legacy, MODEL, AI), true);
});

test("upgrade entri lama saat diklik -> jadi berkualifikasi", () => {
  const sel = toggle([MODEL], AI, MODEL);
  assert.equal(sel.includes(MODEL), false, "entri polos dibuang");
  assert.equal(sel.includes(qualifiedModel(AI, MODEL)), true);
});

test("enforcement API: pasangan salah ditolak, pasangan benar diterima", () => {
  const key = { ...emptyApiKey(), models: [qualifiedModel(AI, MODEL)] };

  const ok = checkKeyStatic(key, MODEL, AI);
  assert.equal(ok.ok, true, "provider yang diizinkan harus lolos");

  const bad = checkKeyStatic(key, MODEL, NATA);
  assert.equal(bad.ok, false, "provider lain dengan nama model sama harus DITOLAK 403");
  assert.equal((bad as { status: number }).status, 403);
  assert.match((bad as { message: string }).message, /Nata/);

  // tanpa info provider -> fallback permissive (tidak boleh memblokir trafik sah)
  assert.equal(checkKeyStatic(key, MODEL).ok, true);
});

test("whitelist kosong = semua diizinkan", () => {
  const key = { ...emptyApiKey(), models: [] };
  assert.equal(checkKeyStatic(key, MODEL, NATA).ok, true);
  assert.equal(checkKeyStatic(key, "apa-saja", "provider-x").ok, true);
});

test("filter katalog /v1/models pakai providerName", () => {
  const wl = [qualifiedModel(AI, MODEL)];
  assert.equal(entryMatches(wl[0], AI, MODEL), true);
  assert.equal(entryMatches(wl[0], NATA, MODEL), false);
  // bentuk yang dipakai route.ts
  const entryMatches2 = (w: readonly string[], pn: string, m: string) =>
    w.includes(`${pn}/${m}`) || w.includes(m);
  assert.equal(entryMatches2(wl, AI, MODEL), true);
  assert.equal(entryMatches2(wl, NATA, MODEL), false);
});

test("REGresi nyata: simulasi persis klik di screenshot", () => {
  // 28 model dari 2 provider, 4 terpilih; dua di antaranya nama sama beda provider
  const all = [
    { provider: AI, model: "glm-5.2" },
    { provider: AI, model: "glm-5.3" },
    { provider: AI, model: MODEL },
    { provider: NATA, model: MODEL },
  ];
  let sel: string[] = [];
  // user klik HANYA baris ke-3 (ai/glm-5.3-flash)
  sel = toggle(sel, AI, MODEL);

  const checkedRows = all.filter((r) => rowChecked(sel, r.provider, r.model));
  assert.equal(checkedRows.length, 1, `visual: harus 1 tercentang, dapat ${checkedRows.length}`);
  assert.equal(checkedRows[0].provider, AI);
  assert.equal(sel.length, 1, `hitungan: harus 1, dapat ${sel.length}`);
});
