# SRouter v1.0.0

SRouter is a production-oriented single-user AI gateway for Vercel. Connect Hermes, Cursor, Cline, Codex, or any OpenAI-compatible client once, then manage providers, keys, aliases, fallback, OAuth, and optional Cloudflare relays from the dashboard.

## Included through stage 5

### 1. Core router
- Encrypted single-user vault using PBKDF2 and AES-256-GCM
- Upstash Redis persistence
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

## License

MIT
