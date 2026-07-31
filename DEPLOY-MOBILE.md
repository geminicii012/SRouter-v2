# Deploy SRouter dari HP

## Cara termudah: GitHub lalu Vercel

1. Buat repository GitHub baru bernama `SRouter`.
2. Masukkan seluruh isi folder project ini ke repository. Struktur paling atas harus langsung berisi `package.json`, `app`, `lib`, dan `relay` — jangan menaruhnya di dalam folder tambahan.
3. Buka Vercel → **Add New → Project** → pilih repository `SRouter`.
4. Buka tab **Storage/Marketplace** pada project Vercel → tambahkan **Upstash Redis**. URL dan token Redis akan dimasukkan otomatis.
5. Tambahkan environment variables berikut:

```text
SROUTER_VAULT_ID=default
SROUTER_INSTANCE_ID=primary
NEXT_PUBLIC_APP_URL=https://NAMA-PROJECT.vercel.app
OAUTH_STATE_SECRET=buat-rangkaian-acak-minimal-32-karakter
```

6. Tekan **Deploy**.
7. Buka URL deployment dan buat Router Secret minimal 16 karakter.
8. Tambahkan provider, model, API key, dan route alias `smart` dari dashboard.
9. Hubungkan Hermes:

```text
Base URL = https://NAMA-PROJECT.vercel.app/v1
API key  = Router Secret
Model    = smart
```

## Cloudflare relay

Relay bersifat opsional. Folder `relay` adalah project Cloudflare Worker terpisah. Deploy melalui Cloudflare Workers dengan file `relay/src/index.ts`, tambahkan secret `RELAY_SECRET`, lalu salin URL Worker ke editor provider SRouter.

Jangan membuat Worker menjadi open proxy. Isi `ALLOWED_HOSTS` hanya dengan domain provider yang dipakai.
