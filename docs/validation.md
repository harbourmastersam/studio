# Validation and deployment report — 2026-09-27

Implemented on the existing develop checkout of harbourmastersam/studio, based
on b06fb85. The results below describe the implementation deployed before the
user's follow-up request to commit and push it to develop.

## Changes

- Preserved EmbedQueryable and Electron IPC. The iframe transport now requires
  the configured exact parent origin, actual parent window, per-viewer channel,
  pending numeric request ID, matching operation and valid result/error shape.
- Added listener cleanup, pending-request rejection on close, unique request IDs
  across connections, and protection against malformed and sparse arrays.
- Passed the channel from embed search parameters. Required embed configuration
  fails closed; normal Studio and Electron do not require it.
- Added embed-only CSP frame-ancestors and no-referrer headers, a shared origin
  parser, environment examples, and complete parent/broker documentation.
- Updated the Next 15/OpenNext/Wrangler stack, regenerated the npm lockfile,
  applied compatible audit fixes, and aligned MDX/ESLint with Next.
- Removed only Edge runtime declarations from existing routes for OpenNext's
  Node runtime. Replaced the upstream KV cache ID with static-assets caching.
  Added immutable asset headers and fixed next-themes script serialization with
  Wrangler keep_names: false.
- Updated CI to Node 24, npm ci, and a Cloudflare build without deployment.

No Pelican plugin, authentication backend, database session backend, credentials,
new connection driver, or query proxy was added. Existing Studio functionality
was retained.

## Deployment

The user later explicitly requested deployment and selected
Scarlson6603@gmail.com's Account, superseding the original no-deployment request.

- Worker: outerbase-studio
- URL: https://outerbase-studio.scarlson6603.workers.dev
- Final version: ac9a2eeb-2beb-4213-8bf3-4d7c9e18f777
- Allowed parent: https://panel.greyharbour.net
- Compatibility date: 2026-09-25
- Bindings: ASSETS only; no database, KV or R2 resources created.
- Uploaded gzip size: 4502.08 KiB; reported startup time: 20 ms.

The deployment was built under Linux/WSL and uploaded using the existing
Wrangler login. Credentials and account IDs were not added to the repository.
A prior deployment was replaced after browser testing identified and verified
the documented next-themes keep_names fix.

## Dependency versions

These are all changed direct dependencies' resolved versions, from the old and
new npm lockfiles. The original manifest used @next/mdx ^14.2.4 (resolved 14.2.25),
OpenNext ^0.6.6 and Wrangler ^4.6.0. New Next/MDX/Next ESLint versions are pinned;
OpenNext and Wrangler use ^1.20.6 and ^4.141.0.

| Package | Before | After |
| --- | --- | --- |
| @next/mdx | 14.2.25 | 15.5.26 |
| @opennextjs/cloudflare | 0.6.6 | 1.20.6 |
| @types/showdown | 2.0.6 | removed |
| eslint-config-next | 14.0.4 | 15.5.26 |
| lodash | 4.17.21 | 4.18.1 |
| next | 15.4.10 | 15.5.26 |
| postcss | 8.5.3 | 8.5.28 |
| react | 19.0.0 | 19.0.8 |
| react-dom | 19.0.0 | 19.0.8 |
| showdown | 2.1.0 | removed |
| wrangler | 4.6.0 | 4.141.0 |
| xlsx | 0.18.5 | 0.20.3 |

Transitive security updates are recorded in package-lock.json. A scoped override
moves the existing TypeScript ESLint parser's minimatch from 9.0.3 to 9.0.9; the
PostCSS override also replaces Next's nested 8.4.31 with 8.5.28. No force audit
fix or Next 16 migration was used. SheetJS 0.20.3 comes from its official vendor
tarball, with integrity recorded by npm.

## Validation results

| Check | Result |
| --- | --- |
| npm ci | Passed on Windows and Ubuntu/WSL using the final lockfile |
| npm run typecheck | Passed on Windows and Linux |
| npm run lint | Passed on Windows and Linux, no errors or warnings |
| npm test -- --runInBand | 164 tests passed, 12 suites |
| Focused transport/config tests | 71 cases included in the full suite |
| npm run build | Passed on Node 24.21.0/Linux, 54 static pages; dynamic /embed/[driver] built |
| npm run build:cloudflare | Passed on Node 24.21.0/Linux with the real allowed parent origin |
| npm run preview:cloudflare | Passed locally without Cloudflare credentials |
| Local HTTP smoke checks | /, /local, /embed/mysql and embed docs returned 200 |
| Production HTTP smoke checks | /, /local, /embed/mysql, embed docs and /connect redirect returned 200 |
| CSP | Local and live embed responses use frame-ancestors https://panel.greyharbour.net and no-referrer |
| Normal pages | No embed-only CSP; browser renders the existing local Studio interface |
| Browser embed smoke check | Initialization reaches Connecting, with no console errors/warnings after the fix |
| npm audit --audit-level=high | Exit 0; zero high/critical, one moderate finding |
| Independent security review | Malformed-array finding fixed and verified; no remaining significant finding in reviewed scope |

Browser testing of the embed alone intentionally stops at Connecting: a real
Pelican broker is not part of this task. Transport tests use controlled parent
messages, with no real database. No real SQL or Pelican authentication flow was
tested. The iframe security tests cover origin/source/channel rejection,
malformed input, response pairing, errors, transactions, cleanup and Electron.

## Remaining warnings

1. npm audit reports one moderate ECharts XSS advisory,
   [GHSA-fgmj-fm8m-jvvx](https://github.com/advisories/GHSA-fgmj-fm8m-jvvx).
   The advertised fix is ECharts 6.1.0, an unrelated major upgrade. ECharts 5.6.0
   remains; do not treat the application as having a completely clean audit.
2. OpenNext 1.20.6 logs “Failed to copy” for hast-util-to-html,
   hast-util-whitespace and property-information. Root cause was reproduced:
   its transformPackageJson helper uses the in operator on string-valued
   package exports. Those installed packages are present and do not need a
   workerd export rewrite. Bundle/deployment and tested static/dynamic routes
   succeed. No dependency internals were patched or errors suppressed.
3. Next static generation reports multiple Shiki highlighter instances.
   Existing docs generation still completes.
4. npm reports deprecated legacy tooling packages (including ESLint 8 and
   transitive glob/rimraf/inflight). Windows npm 11 also reports unapproved
   esbuild/workerd install scripts; Linux npm installs and executes the build
   toolchain successfully. OpenNext deployment emits Node DEP0190 for its
   shell-based child-process invocation.

## Future builds and parent integration

The deployed artifact already contains the selected origin. For subsequent
Cloudflare Workers Builds or any external CI, set Node 24 and this **build-time**
variable before running npm run build:cloudflare:

~~~dotenv
NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN=https://panel.greyharbour.net
~~~

Install with npm ci. Rebuild when the origin changes; a runtime-only dashboard
variable does not update the client bundle or compiled CSP. No database secrets
or extra bindings are needed. This task uploaded through Wrangler; it did not
create a GitHub-connected Cloudflare Builds pipeline or custom domain.

Example URL (replace the nonce with a fresh cryptographically random value for
each viewer):

~~~text
https://outerbase-studio.scarlson6603.workers.dev/embed/mysql?channel=6ed3eb71-431d-4e72-9e84-8d032b6935cb
~~~

The future Pelican plugin owns authentication, authorization, viewer/session
expiry, database permission mapping, credentials, SQL execution, transactions,
limits/timeouts, CSRF protection where applicable, audit logging, and safe error
responses. It must check the Studio origin, iframe contentWindow, channel and
request schema, then reply to the exact Studio origin with matching type/id/channel.
The channel is only message-session binding, never authentication. See
[embedding.md](embedding.md) and [cloudflare.md](cloudflare.md).

## All changed files

- `.env.example`
- `.github/workflows/check.yaml`
- `.gitignore`
- `README.md`
- `docs/cloudflare.md`
- `docs/embedding.md`
- `docs/superpowers/plans/2026-09-27-secure-embed-cloudflare.md`
- `docs/validation.md`
- `next.config.js`
- `open-next.config.ts`
- `package-lock.json`
- `package.json`
- `public/_headers`
- `src/app/(outerbase)/local/board/[boardId]/page.tsx`
- `src/app/(outerbase)/local/edit-base/[baseId]/page.tsx`
- `src/app/(outerbase)/local/new-base/[driver]/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/[baseId]/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/billing/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/board/[boardId]/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/edit-base/[baseId]/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/edit-base/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/new-base/[driver]/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/new-base/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/page.tsx`
- `src/app/(outerbase)/w/[workspaceId]/settings/page.tsx`
- `src/app/(public)/docs/embed-iframe-client/page.mdx`
- `src/app/(theme)/client/s/[[...driver]]/page.tsx`
- `src/app/(theme)/client/s/starbase/page.tsx`
- `src/app/(theme)/embed/[driver]/page-client.tsx`
- `src/app/(theme)/embed/[driver]/page.tsx`
- `src/app/(theme)/embed/board/[boardId]/page.tsx`
- `src/app/(theme)/playground/client/page.tsx`
- `src/app/(theme)/playground/mysql/[roomName]/page.tsx`
- `src/app/api/events/route.ts`
- `src/app/connect/route.ts`
- `src/app/proxy/d1/route.ts`
- `src/app/proxy/wae/route.tsx`
- `src/drivers/iframe-driver.test.ts`
- `src/drivers/iframe-driver.ts`
- `src/lib/embed-headers.test.ts`
- `src/lib/embed-origin.js`
- `src/lib/embed-origin.test.ts`
- `wrangler.jsonc`
