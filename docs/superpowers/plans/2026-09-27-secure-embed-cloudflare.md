# Secure embed and Cloudflare maintenance implementation plan

**Goal:** Prepare the existing Studio client for a future Pelican parent broker and a reproducible Cloudflare Workers build.

**Architecture:** Preserve `EmbedQueryable` and Electron IPC. Bind iframe requests to a single build-time HTTP(S) origin, the actual parent window, and a required per-viewer channel. Validate response envelopes and results before settling a matching pending request. Apply embed-only frame-ancestors headers from the same configuration. Keep all authentication, authorization, credentials and SQL execution in the future parent/backend.

**Tech stack:** Next 15, React 19, OpenNext Cloudflare 1.x, Wrangler 4, npm, Jest.

**Spec:** User's attached request, “Work on the develop branch of harbourmastersam/studio”, supplied 2026-09-27.

## Constraints

- Work directly on `develop` as requested; no framework migration. The original
  no-deployment constraint was superseded by the user's later explicit request
  to deploy to Cloudflare with `https://panel.greyharbour.net` as the allowed parent.
- Minimum Next 15.5.14, OpenNext 1.17.3, Wrangler 4.59.3. Align MDX and Next ESLint configuration.
- No database credentials, sessions, authentication backend, new drivers, or query proxy.
- Normal Studio and Electron continue working without iframe configuration.
- No wildcard messaging, no credential/token URL parameters, no forced audit fixes.

## Tasks

- [x] Upgrade compatible dependencies with npm and inspect audit findings. Review OpenNext imports, runtime declarations, caching bindings and compatibility date using current documentation. Validate the locked install.
- [x] Add failing iframe tests for outbound routing, origin/source/channel rejection, malformed envelopes/results, request correlation, errors, transactions, lifecycle cleanup, remount/replay isolation, and missing/invalid configuration.
- [x] Implement typed transport and pass channel from embed search parameters. Return listener cleanup, reject pending work on disposal, and ensure stale responses cannot satisfy a new viewer's requests.
- [x] Add and test shared strict origin parsing and embed CSP configuration. Missing origin yields `frame-ancestors 'none'`; invalid configured values produce actionable errors. Other routes remain accessible.
- [x] Update embed protocol documentation, environment examples and build/preview instructions; remove obsolete insecure iframe examples.
- [x] Run npm ci, typecheck, lint, full Jest suite, Next build, OpenNext build and local Worker preview. Check `/embed/mysql`, CSP, top-level access, and audit; record actual results and limitations.
- [x] Review final diff against the request and report every changed file, dependency versions, validation, remaining warnings and future parent responsibilities.

## Review focus

- Malformed structured-clone data must not throw or settle a promise.
- React unmount/remount and channel changes must clean up listeners and reject abandoned requests; IDs must not collide across connections.
- Electron must bypass iframe-only requirements without changing IPC behavior.
- Build-time origin and response CSP must agree, including when configuration is absent.
- Cloudflare packaging must preserve existing routes and work without credentials during local validation.

## Execution record

- Initial checkout: clean `develop`, commit `b06fb85`.
- Inspection: wildcard outbound transport, unchecked responses, dropped cleanup return, 22 Edge runtime declarations, and a hardcoded upstream KV namespace identified.
- Proceeding directly with the user's specified implementation scope; no extra design approval or isolated branch needed.
- Transport red/green cycle: initial implementation failed 31 of 44 new tests;
  focused tests then passed. Added further regressions for optional SDK headers,
  send failures, sparse arrays and payload-owned array methods. Independent
  review verified the malformed-array fix and found no remaining significant
  security issue in reviewed code.
- Final checks: Windows and Linux clean installs, typecheck, lint and all 164
  Jest tests passed. Next and OpenNext builds passed under WSL Node 24.21.0.
  Local and production Worker HTTP/browser checks passed. Audit: 69 findings
  reduced to one moderate ECharts finding, zero high/critical.
- Browser smoke testing reproduced a next-themes `__name` runtime error;
  applied the documented Wrangler `keep_names: false` fix and verified clean
  local and production embed consoles after redeployment.
- Deployment and complete file/version details are in `docs/validation.md`.
