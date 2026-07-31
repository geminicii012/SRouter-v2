# Security policy

## Supported release

SRouter 1.x receives security fixes.

## Secrets

- Never commit `.env.local`, Router Secret, provider keys, relay secrets, or OAuth client secrets.
- Use unique random values for `Router Secret`, `OAUTH_STATE_SECRET`, and each relay secret.
- Provider credentials and OAuth tokens are encrypted at rest with AES-256-GCM using a PBKDF2-derived key.
- Losing the Router Secret makes the vault unrecoverable by design.

## Network controls

- Provider, OAuth, and relay URLs must use HTTPS and resolve to public addresses.
- Private, loopback, link-local, and local hostnames are blocked.
- Cloudflare Relay only forwards to `ALLOWED_HOSTS`.
- Redirect following is disabled for security-sensitive outbound requests.

## Logging

SRouter stores request metadata only: timestamp, provider, model, HTTP status, and latency. Prompt and response bodies are not logged.

## Responsible use

SRouter does not include account farming, ban evasion, fingerprint spoofing, or IP rotation. Multiple keys and relays must be used according to provider terms.
