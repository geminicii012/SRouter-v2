# SRouter v1.0.0

SRouter is a production-oriented single-user AI gateway for Vercel. Connect Hermes, Cursor, Cline, Codex, or any OpenAI-compatible client once, then manage providers, keys, aliases, fallback, OAuth, and optional Cloudflare relays from the dashboard.

## Kapabilitas inti

### 1. Core router
- Encrypted single-user vault using PBKDF2 and AES-256-GCM
- Penyimpanan **Cloudflare Durable Objects** (Upstash Redis sebagai cadangan)
- Provider create, edit, test, enable/disable, and delete
- Multiple keys per provider with round-robin and cooldown
- OpenAI-compatible `/v1/models` and `/v1/chat/completions`
- Native chat adapters for Anthropic and Gemini
- Ordered route aliases and provider fallback
- Metadata logs without prompt or response bodies
- Indonesian/English UI and light/dark themes

### 2. Multimodal
- `/v1/responses`
- `/v1/embeddings`
- `/v1/images/generations`
- `/v1/audio/speech`
- `/v1/audio/transcriptions` with multipart upload
- OpenAI-compatible multimodal chat payload pass-through

Non-chat capabilities are passed to providers that implement the corresponding OpenAI-compatible endpoint.

### 3. Cloudflare relay
- Optional relay per provider
- Multiple relays and ordered failover
- Direct-first, relay-first, or relay-only mode
- Streaming body pass-through
- Shared-secret authentication
- HTTPS host allowlist and SSRF protection
- Relay health checks from the dashboard

### 4. OAuth and deployment sync
- Generic OAuth 2.0 authorization-code flow for providers with official API OAuth
- Encrypted temporary OAuth state
- Token exchange, encrypted token storage, disconnect, and automatic refresh
- Shared vault sync across deployments using `SROUTER_VAULT_ID`
- Optimistic version conflict protection
- Instance heartbeat and sync status

OAuth must only be used with provider-issued developer credentials and provider-approved API scopes.

### 5. Model catalog and route management
- Editable route aliases with ordered fallback targets
- Per-target route metadata for priority, retry count, and timeout notes
- OpenAI-compatible model auto-detection through `GET /v1/models`
- Unified model catalog across providers with provider badges and search
- Favorite models pinned above the rest of the catalog
- Provider model sync metadata: status, model count, last sync, and error message
- 15 minute model cache TTL with dashboard background refresh and manual Refresh Now

Providers that do not implement `GET /v1/models` can still use manual model entry in the provider editor.

## Deploy from a phone

The simplest flow is GitHub + Vercel:

1. Extract this project and upload its files to a new GitHub repository named `SRouter`.
2. In Vercel, choose **Add New → Project**, then import the repository.
3. In the Vercel Marketplace, create or connect an Upstash Redis database.
4. Add the remaining environment variables from `.env.example`.
5. Deploy, open the generated URL, and create your Router Secret.

Required variables:

```env
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
SROUTER_VAULT_ID=default
SROUTER_INSTANCE_ID=primary
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
OAUTH_STATE_SECRET=a-long-random-secret-at-least-32-characters
```

`NEXT_PUBLIC_APP_URL` must match the production domain for OAuth callbacks.

## Connect Hermes

Use Hermes' custom OpenAI-compatible provider:

```text
Base URL: https://your-project.vercel.app/v1
API key:  your Router Secret
Model:    smart
```

Create the `smart` alias in **Routes** and add its ordered targets, or choose any model returned by `/v1/models`. Hermes only needs SRouter's URL and Router Secret; SRouter keeps the provider mapping internally.

In the dashboard, use **Models** to search across all providers, filter by provider, and star frequently used models. Use **Providers → Detect Models** or **Refresh Now** to keep the model picker current.

## Deploy the Cloudflare Worker relay

```bash
cd relay
npm install
npx wrangler secret put RELAY_SECRET
npm run deploy
```

Before deployment, edit `ALLOWED_HOSTS` in `relay/wrangler.toml`. Add the resulting Worker URL and the same secret in the SRouter provider editor using:

```text
Primary|https://your-relay.workers.dev|your-relay-secret|global
```

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Security boundaries

- Provider keys and OAuth tokens are stored inside the encrypted vault.
- The Router Secret is not stored in plaintext.
- The dashboard receives decrypted configuration only after successful authentication.
- Logs contain metadata only.
- Relay destinations must be explicitly allowlisted.
- SRouter does not implement account farming, ban evasion, fingerprint spoofing, or IP rotation.

## Release validation

Run the complete gate after installing dependencies:

```bash
npm run check
```

This runs strict TypeScript checking, automated tests, and the Next.js production build. Vercel runs `npm run build` again during deployment. The health endpoint at `/api/health` returns HTTP 503 until required Redis environment variables are configured.

## Production checklist

- Use a unique Router Secret with at least 24 random characters.
- Use a unique `OAUTH_STATE_SECRET` with at least 32 random characters.
- Restrict relay hosts to providers you actually use.
- Keep Vercel and Upstash accounts protected with MFA.
- Test each provider before connecting a client.
- Detect or manually enter models for each provider.
- Create a route alias such as `smart`, then verify `/v1/models` and `/v1/chat/completions`.


## Storage

SRouter memakai **Cloudflare Durable Objects** sebagai penyimpanan utama
(vault, API key, counter token, log), dengan Upstash Redis sebagai cadangan.

| Variabel | Kegunaan |
|---|---|
| `SROUTER_STORE_URL` | endpoint Worker DO |
| `SROUTER_STORE_TOKEN` | token Bearer Worker |
| `SROUTER_VAULT_ID` | namespace vault (default: `default`) |
| `SROUTER_INSTANCE_ID` | identitas instance (heartbeat) |
| `UPSTASH_REDIS_REST_URL` | cadangan (opsional) |
| `UPSTASH_REDIS_REST_TOKEN` | cadangan (opsional) |

Pemilihan backend otomatis di `lib/redis.ts`: kalau `SROUTER_STORE_URL` diisi,
pakai DO; kalau tidak, jatuh ke Upstash. **Semua akses store lewat satu file
itu** — backend lain dengan protokol REST sama bisa dipasang tanpa menyentuh
`lib/usage.ts` atau `lib/api-key-store.ts`.

### Cloudflare Worker (`srouter-do-store`)

Worker ini menyajikan protokol REST **Redis-compatible** (`POST ["CMD", ...]` →
`{"result": ...}`) di atas SQLite internal Durable Object.

Perintah yang didukung:

| Kelompok | Perintah |
|---|---|
| String | `GET` `SET` `SETEX` `DEL` `EXISTS` `INCR` `INCRBY` `DECR` `DECRBY` |
| TTL | `EXPIRE` `TTL` |
| Hash | `HSET` `HGET` `HGETALL` `HINCRBY` `HDEL` |
| Set | `SADD` `SREM` `SMEMBERS` |
| List | `LPUSH` `LRANGE` `LTRIM` `LLEN` |
| Lain | `KEYS` `TYPE` `PING` |
| Atomik | **`CAS <key> <expected> <k> <v> [<k> <v> ...]`** |

**Catatan `CAS`:** pengganti `EVAL`/Lua. DO bersifat single-threaded, jadi
baca-cek-tulis otomatis atomik. `expected` = `__NONE__` berarti key harus
belum ada. Dipakai `lib/vault.ts` untuk optimistic locking (`VERSION_CONFLICT`).

### Migrasi Upstash → Cloudflare DO

Data lama dipindahkan utuh (42 key: string, hash, set, list). Skrip migrasi
ada di `~/srouter-tools/` (di luar repo) karena berisi kredensial.

**Penting:** kalau `srouter:<vault>:version` pernah digeser manual, key itu
harus disamakan dengan versi **di dalam payload vault**. Kalau tidak,
`saveVault()` selalu menolak dengan `VERSION_CONFLICT`.

## Deploy

1. **Cloudflare Worker**
   ```bash
   cd worker-do
   npx wrangler deploy
   npx wrangler secret put AUTH_TOKEN     # token Bearer untuk client
   ```
2. **Vercel** — hubungkan repo ini, set env di atas, deploy.

Auto-deploy aktif: setiap `git push` ke `main` memicu build ulang.

> **Penting:** commit author harus memakai **email akun Vercel**. Kalau tidak,
> Vercel memblokir deploy dengan status `BLOCKED` dan pesan
> *"the commit author doesn't have permission to create deployments"*.

## Fitur

### Tab / menu

Sembilan tab, label Bahasa Indonesia (kecuali `Models` / `Log` / `Relay` / `Chat`
/ `API Key`):

| Tab | Isi |
|---|---|
| **Ringkasan** | Metrik (provider aktif, model katalog, rute fallback, relay), ringkasan pemakaian, jaringan provider |
| **Provider** | CRUD provider, deteksi model otomatis, tes koneksi, sinkronisasi, duplikat, inspector |
| **Models** | Katalog model, pencarian, filter provider, favorit |
| **Rute** | Alias rute + rantai target fallback (prioritas, retry, timeout) |
| **Log** | Metadata request terbaru, tombol muat ulang & hapus log |
| **Relay** | Status relay Cloudflare |
| **Chat** | Uji coba langsung: pilih model, kirim pesan, streaming |
| **API Key** | CRUD API key, batas token/RPM/concurrent, kedaluwarsa, reset pemakaian |
| **Pengaturan** | Logging, deploy sync, **warna aksen**, endpoint API |

### Provider

- Deteksi model otomatis dari `/v1/models` upstream, dengan spinner + status error
- Format: OpenAI-compatible, Anthropic, Gemini
- Multi-key per provider (label + enable per key)
- Header custom, relay (nama/URL/secret/region), mode relay (direct/prefer/only)
- OAuth 2.0 resmi (authorize URL, token URL, client id/secret, scopes)
- Harga per model: `auto` (katalog LiteLLM) / `free` / `manual`
- **Tombol aksi per baris**: `Inspeksi` · `Sinkron` · `Tes` · `Edit` · `Duplikat` · `Hapus`

### Biaya / pricing

Tiga tingkat sumber harga:

| Prioritas | Sumber | Kapan |
|---|---|---|
| 1 | `manual` | Harga diisi sendiri di provider |
| 2 | `litellm` | Model cocok + provider dikenali dari hostname |
| 3 | `model-catalog` | Model cocok, provider tidak dikenali |
| 4 | `fallback-estimate` | Tidak cocok → $1/1jt input, $3/1jt output |

Katalog diambil dari LiteLLM (`model_prices_and_context_window.json`), cache
**6 jam**. Rumus: `input/1e6 × hargaIn + output/1e6 × hargaOut`.

### Chat

- Pilih model dari dropdown, kirim pesan, respons streaming
- Riwayat **tidak dipersist** — prompt/API key tidak pernah disimpan ke log atau backend

### Keamanan

- Router Secret ≥ 16 karakter, tidak dapat dipulihkan
- Vault dienkripsi AES-GCM 256, kunci diturunkan PBKDF2 210.000 iterasi
- Secret disimpan di `sessionStorage`, hilang saat tab ditutup
- API key provider disimpan terenkripsi di vault, tidak pernah dikirim mentah ke browser
- Rate limit per endpoint

## Perubahan UI

### Tema & aksen

- **Toggle tema** (`☀`/`☾`) — gelap & terang, dipersist ke `localStorage`
- **Warna aksen** — pilihan **Biru** / **Oranye** di Pengaturan; berlaku di
  **kedua tema** (sebelumnya tema memaksa warna: gelap selalu biru, terang
  selalu oranye)
- Preferensi disimpan di satu key `srouter-prefs` (`theme`, `locale`, `accent`)
- `document.documentElement.lang` mengikuti locale

### Dua bahasa

- Indonesia (default) dan Inggris, bisa diganti dari header
- **Halaman login + layar boot dikunci Bahasa Inggris**

### Grid background

- Grid kotak halus **hanya di mode terang** (mode gelap tetap polos)
- Digambar di `body::after` supaya menembus seluruh halaman, bukan hanya
  bagian kosong

### Terminal login

- Nada terminal: `AUTHENTICATION REQUIRED` · `[srouter]` · `unlock srouter` ·
  input `ROUTER SECRET` · tombol `[ continue ]` · state `[ ... ] processing`

### Perbaikan UI lain

- **Kolom chat tidak lagi hitam di mode terang** — akarnya tema + secret tidak
  persist, bukan token CSS
- **Tombol aksi provider muncul di mobile** — akar: `@media(max-width:1100px)`
  punya `.provider>div:nth-child(4){display:none}` yang (tanpa sengaja)
  menargetkan `.provider-actions`; diperbaiki jadi `:not(.provider-actions)`
- **Spinner deteksi model terlihat** — minimal 650 ms, `opacity: 1` saat busy,
  status error berbasis state (bukan pencocokan string), dihormati saat
  `prefers-reduced-motion`
- **Titik animasi jaringan provider tidak lagi bocor ke kartu sebelah** —
  `.health-connector` diberi `overflow: hidden` + lebar 64 px
- **Toast salin** berbunyi `tersalin ke clipboard.` (embel-embel mode
  kompatibilitas dihapus)
- **Simpan provider tidak menggantung** — `AbortController` 30 detik, pesan
  timeout jelas

## Riwayat perbaikan penting

### Storage & agregasi

- **Total pemakaian tidak lagi "reset sendiri".** Akar: `aggregateUsage()`
  menghitung ulang total dari daftar log yang dipangkas `LTRIM` — begitu log
  ke-1001 masuk, log tertua terbuang dan total ikut turun. Sekarang ada
  **counter akumulatif** (`bumpUsage()` / `readUsageBucket()`) yang HINCRBY ke
  `srouter:<vault>:usage:<YYYY-MM-DD>` dan `<YYYY-MM>`; log hanya untuk rincian.
  Field `billableMicroUsd` disimpan sebagai integer supaya `HINCRBY` tetap
  presisi 1e-6 USD.

### Token & limit

- **Token output non-stream tidak lagi 0.** Akar: `countTokens()` dipanggil
  fire-and-forget atas `response.clone()`, jadi kalah balapan saat koneksi
  ditutup. Sekarang body dihitung **sebelum** respons dikembalikan.
- **Deteksi usage dinamis.** `extractUsage()` menelusuri objek secara rekursif,
  jadi bentuk `{data:{usage}}` (Cline), `{usageMetadata}` (Gemini),
  `{response:{usage}}` (Vertex) ikut terbaca — bukan cuma `{usage}` OpenAI.
- **Limit token menghentikan aliran di tengah.** Dulu limit hanya dicek di awal
  request, jadi satu respons panjang bisa jauh melampaui batas. Sekarang batas
  dibaca live dari store dan stream diperiksa per chunk; begitu ambang lewat,
  aliran diputus dengan `finish_reason: "length"` + pesan jelas.

### Vault & sinkronisasi

- **`VERSION_CONFLICT` tidak lagi memaksa reload.** Akar: `persist()` memakai
  `expectedVersion` dari state React yang bisa basi (`setVault` itu async), dan
  endpoint `/api/apikeys` menaikkan versi tanpa memberi tahu UI. Sekarang:
  - `persist(next, patch)` **auto-retry maks 3×**, mengambil vault terbaru lalu
    menempelkan perubahan di atasnya → perubahan tab lain tidak tertimpa
  - `versionRef` menyimpan versi di `useRef`, selalu segar
  - server mengirim vault terbaru di respons **409**
  - `ApiKeyPanel` memberi tahu parent lewat `onVaultChange`

### Keamanan origin non-secure

- **`crypto.randomUUID` hanya ada di secure context.** Lewat HTTP
  (`bore.pub`), `crypto.randomUUID` dan `crypto.subtle` bernilai `undefined`,
  sehingga handler React crash sebelum `fetch` terkirim (gejala: tombol
  "deteksi model" diam total). Diganti helper `uid()` dengan fallback
  `crypto.getRandomValues` → `Math.random`.

### Cache

- **Header anti-stale.** HTML shell memakai `must-revalidate`; aset
  `/_next/static/*` tetap `immutable`. Tanpa ini, chunk dengan nama hash sama
  antar build membuat browser/CDN menyajikan salinan lama.

## License

MIT
