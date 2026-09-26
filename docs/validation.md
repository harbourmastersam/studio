# Production hardening validation — 2026-09-27

Implemented on `develop` of `harbourmastersam/studio`, following the secure
iframe transport and custom-domain changes. This report supersedes the earlier
standalone deployment checks.

## Production configuration

- Sole production hostname: https://studio.greyharbour.net
- Worker: `outerbase-studio`
- Allowed parent: https://panel.greyharbour.net
- `workers_dev: false`, `preview_urls: false`; custom domain retained.
- Build flags: `STUDIO_EMBED_ONLY=true` and
  `NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN=https://panel.greyharbour.net`.
- ASSETS remains the only binding. No database, auth or session service was added.

## Route behavior

The middleware returns a minimal branded HTTP 403 page directing the visitor to
Pelican Panel for every application path except `/embed/mysql`. GET/HEAD iframe
documents on that route require `Sec-Fetch-Dest: iframe` and
`Sec-Fetch-Mode: navigate`. Missing/malformed metadata and top-level document
requests are rejected. Only same-origin framework fetches with the
expected fetch metadata can use the non-document exception. Other embed drivers
and existing standalone API/proxy routes are blocked too.

Required Next static/image resources, icons and extension images remain
accessible. Cloudflare may serve public files directly through ASSETS. Embed and
denial responses use private/no-store and metadata-aware Vary headers, exact
parent CSP and no-referrer. See [the complete route rules](cloudflare.md#production-exposure-and-development).

`next dev` remains unrestricted by default. An explicit build-time
`STUDIO_EMBED_ONLY=false` permits standalone local builds; production builds
otherwise default to restricted mode. Only literal `true` and `false` are valid.

Fetch metadata is not authentication or authorization. It can be forged by
non-browser clients and must never be used to authorize database access.
The secure iframe transport still validates origin, actual parent window,
channel nonce, request ID/type and response shape. No transport code changed.

## Validation

Validation uses Node 24/Linux (WSL) for reproducible Next/OpenNext builds.

| Check | Result |
| --- | --- |
| `npm ci` | Passed; unchanged lockfile |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test -- --runInBand` | 221 tests passed across 14 suites, including all existing transport tests |
| New exposure/config tests | 57 cases passed; first run failed before implementation |
| `npm run build` | Passed; dynamic `/embed/[driver]` and middleware built |
| `npm run build:cloudflare` | Passed; middleware bundled into the Worker |
| Local Worker preview | Passed: 23 route cases and 37 referenced JS/CSS/font assets |
| Development HTTP checks | `next dev` served `/local` with HTTP 200 and standalone UI |
| Production deployment | Passed; version `235bd6af-ad72-434b-9982-68b692dbd60e` |
| Production HTTP checks | Same 23 route cases and 37 assets passed; single exact-parent CSP |
| Production browser checks | Allowed-parent iframe rendered Connecting without page errors/failed requests; address-bar and standalone navigation returned 403 |
| Cloudflare hostname state | API confirms enabled=false and previews_enabled=false; old hostname returns 404 |

## Existing warnings

Preview integration testing caught Next stripping internal RSC headers before
middleware. The guard now uses browser fetch metadata for same-origin framework
fetches, with a regression test. Early middleware denials set CSP themselves;
allowed responses receive it from Next config, avoiding duplicate headers.

Browser validation used a synthetic parent page at the exact allowed origin in
an isolated browser context, without modifying Pelican. A local-browser harness
was blocked by Chromium Local Network Access rules; local HTTP preview and the
real production browser iframe both passed. No backend broker was simulated.
The initial independent code review found no actionable issues; the follow-up
review was unavailable, and the final integration correction was self-reviewed
and verified by the full test suite and local/live smoke checks.

The dependency graph is unchanged. `npm ci` reports one moderate vulnerability
(the previously recorded ECharts advisory); no unrelated major update was made.
Existing OpenNext warnings about copying string-export packages and Next's Shiki
highlighter warning are tracked from the previous validation. Actual build and
preview results are required before deployment; warnings are not hidden.

## Deployment and next implementation work

Build with the two public variables above, then deploy the validated artifact
using `opennextjs-cloudflare deploy`. Confirm the custom domain, disabled
workers.dev/version previews, exact frame-ancestors, iframe 200, top-level 403,
standalone 403, and asset 200 responses. Runtime-only flag edits do not update
compiled behavior. No Cloudflare Access, service token or separate Studio auth
is required or configured.

The next implementation belongs in the **Pelican plugin**, not Studio. Pelican
must own authentication, authorization, viewer/session expiry, database
permissions, credentials, SQL execution, transactions, limits, audit logging and
safe error responses. No real database or Pelican backend flow is tested here.

## Files changed

- `src/middleware.ts`, `src/middleware.test.ts`
- `src/lib/studio-exposure-config.test.ts`
- `next.config.js`, `wrangler.jsonc`, `.env.example`
- `README.md`, `docs/cloudflare.md`, `docs/embedding.md`, `docs/validation.md`
- `docs/superpowers/plans/2026-09-27-production-exposure.md`
- Prior maintenance plan: removed the personal account identifier.
