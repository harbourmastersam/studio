# Production exposure implementation plan

> Execute inline using the executing-plans workflow. Work on `develop` as requested.

**Goal:** Serve Studio as the Pelican iframe UI at https://studio.greyharbour.net.

**Architecture:** Next middleware with a public build-time `STUDIO_EMBED_ONLY`
flag (production default true, development default false). Allow only the MySQL
embed route and required assets; reject standalone routes with a minimal 403
response. Fetch metadata is an exposure control, never authentication.

**Constraints:** Preserve exact-parent CSP, nonce/source/origin/request validation,
Electron and development code. Add no backend, credentials, sessions, database
connectivity or Cloudflare Access. Disable workers.dev and retain the custom domain.

## Steps

- [x] Add failing middleware tests: iframe document accepted; document/invalid or
  missing metadata rejected; only same-origin framework fetches allowed; standalone,
  API/proxy and alternate embed paths denied; static resources and dev preserved.
- [x] Implement `middleware(request: NextRequest)` in `src/middleware.ts`; pin
  flag defaults/validation in `next.config.js`. Test the real Next config and
  middleware responses, including denial CSP, no-store and fetch-metadata Vary.
- [x] Set `workers_dev: false`, document production/development configuration,
  remove obsolete public endpoint/account details and update validation report.
- [x] Run npm ci, typecheck, lint, all tests, Next build, OpenNext build, local
  Worker preview with production configuration. Check allowed iframe, RSC,
  top-level/standalone denials, assets, CSP and dev behavior.
- [x] Review the final diff; apply the already-authorized Cloudflare deployment
  and verify the custom domain and disabled workers.dev. Record exact results.

## Review focus

- Top-level document metadata must take precedence over spoofed RSC headers.
- Missing/duplicate metadata must fail closed; no Referer fallback.
- Asset exceptions must not expose app paths with asset-looking extensions.
- An allowed response must not be cached for a later denied request.
- Next/OpenNext routing and static cache interception must run the guard before
  serving a standalone page; verify on the actual Worker artifact.

## Final integration decisions

- Next strips internal RSC headers before invoking middleware. Use destination
  `empty`, mode `cors`/`same-origin`, and site `same-origin` for framework fetches
  on the exact MySQL route; top-level `document` remains denied. This is exposure
  control only. Regression test, Worker preview and live requests verify it.
- Set CSP/referrer in middleware only for early denial responses; allowed pages
  use Next's configured headers. Local/live checks confirm a single exact CSP.
- Disable remote version preview URLs alongside workers.dev to retain one
  production hostname. Local Worker preview remains operational.
- Final evidence: 221 tests, typecheck, lint, both builds, local/live HTTP matrices
  and live browser iframe passed. Cloudflare version is recorded in validation.md.
