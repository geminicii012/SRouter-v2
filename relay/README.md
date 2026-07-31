# SRouter Relay

## Deploy dari Cloudflare Dashboard di HP

1. Buka **Workers & Pages → Create Worker**.
2. Salin isi `worker.js` ke editor Worker.
3. Tambahkan secret `RELAY_SECRET` di **Settings → Variables and Secrets**.
4. Tambahkan variable `ALLOWED_HOSTS`, misalnya:

```text
api.openai.com,api.anthropic.com,generativelanguage.googleapis.com,integrate.api.nvidia.com,openrouter.ai
```

5. Deploy dan salin URL `workers.dev`.
6. Di SRouter, edit provider lalu isi relay:

```text
Primary|https://nama-worker.workers.dev|RELAY_SECRET_YANG_SAMA|global
```

Untuk deployment melalui Wrangler, gunakan `src/index.ts` dan `wrangler.toml`.
