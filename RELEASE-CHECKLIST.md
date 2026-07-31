# SRouter 1.0 release checklist

- [ ] `npm install` completed
- [ ] `npm run typecheck` passed
- [ ] `npm test` passed
- [ ] `npm run build` passed
- [ ] `/api/health` returns HTTP 200 after deployment
- [ ] Setup creates the encrypted vault once
- [ ] Provider connection test passes
- [ ] `/v1/models` lists direct models and aliases
- [ ] Non-streaming chat succeeds
- [ ] Streaming chat succeeds
- [ ] Fallback works after a simulated 429
- [ ] Cloudflare Relay rejects a missing secret
- [ ] Cloudflare Relay rejects hosts outside `ALLOWED_HOSTS`
- [ ] OAuth callback URL exactly matches the provider registration
- [ ] Hermes works with SRouter Base URL, Router Secret, and alias `smart`

A release is operationally production-ready only after the checks involving real Vercel, Upstash, relay, and provider credentials pass.
