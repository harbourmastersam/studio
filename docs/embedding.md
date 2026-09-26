# Secure iframe transport

The existing `EmbedQueryable` flow is preserved:

`/embed/mysql` → parent `postMessage` broker → future Pelican backend → parent response → Studio UI.

This task supplies only the Studio client. There is no Pelican plugin, database
session backend, new query API or direct MySQL connection. Existing non-embed
Studio features and Electron IPC remain available in development or explicitly
standalone local builds. Production exposes only the MySQL integration route.

## Configuration

Copy `.env.example` to `.env.local` for local development. Set this public value
in the **build environment** for production:

```dotenv
NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN=https://panel.greyharbour.net
STUDIO_EMBED_ONLY=true
```

Use one canonical HTTP(S) origin, including a non-default port if needed. Do not
include a trailing slash, URL path, credentials, query, fragment, wildcard or
multiple origins. Use HTTPS in production. For development, an exact origin such
as `http://localhost:3000` works with the same checks; `127.0.0.1` is a different
origin. Studio development runs on port 3008, Worker preview on 8787.

The value is compiled into both the browser bundle and Next response headers.
Changing a Worker runtime variable alone cannot change it: rebuild and deploy
the same artifact to update both. Missing origin configuration denies all
framing of `/embed/*` and makes iframe initialization fail
with an actionable error. An invalid configured origin fails configuration load.

Embed responses contain:

```http
Content-Security-Policy: frame-ancestors https://panel.greyharbour.net
Referrer-Policy: no-referrer
```

Without an origin, the policy is `frame-ancestors 'none'`. CSP checks every
ancestor, so embedding the parent inside another origin will also be blocked.
Separately, production middleware rejects top-level embed navigation and requests
without iframe fetch metadata. It also blocks standalone routes. Development is
unrestricted by default. See [the exact exposure rules](cloudflare.md#production-exposure-and-development).
These checks are not authentication; Pelican remains the security boundary.

## Viewer channel

The parent must create a fresh cryptographically random nonce for each viewer,
with at least 128 bits of randomness (for example `crypto.randomUUID()`), and
retain it with that viewer's iframe. Studio consumes one `channel` query parameter
of 22–256 ASCII letters, digits, `_` or `-`. It cannot verify the entropy of a
supplied nonce. Missing, duplicate, empty or invalid channels fail closed.

Example only; generate a new value for every real viewer:

```text
https://studio.greyharbour.net/embed/mysql?channel=6ed3eb71-431d-4e72-9e84-8d032b6935cb
```

The channel is **not authentication or authorization**, and is not a database
session credential. URLs may appear in browser history and server access logs.
Never place database passwords, application API credentials, bearer tokens or
other authentication tokens in the URL. `no-referrer` reduces incidental URL
disclosure; it does not make the channel secret.

## Wire contract

The exported `EmbedRequest` and `EmbedResponse` TypeScript types live in
`src/drivers/iframe-driver.ts`. All messages carry `type`, numeric `id` and
`channel`. IDs are allocated across connections in a viewer document. The parent
must echo the exact ID, type and channel; it must not renumber requests.

Query request:

```json
{
  "type": "query",
  "id": 1,
  "channel": "6ed3eb71-431d-4e72-9e84-8d032b6935cb",
  "statement": "SELECT 1"
}
```

Transaction request:

```json
{
  "type": "transaction",
  "id": 2,
  "channel": "6ed3eb71-431d-4e72-9e84-8d032b6935cb",
  "statements": ["SELECT 1", "SELECT 2"]
}
```

Query success (`data` is a result set):

```json
{
  "type": "query",
  "id": 1,
  "channel": "6ed3eb71-431d-4e72-9e84-8d032b6935cb",
  "data": {
    "headers": [
      {
        "name": "value",
        "displayName": "value",
        "originalType": "INT",
        "type": 2
      }
    ],
    "rows": [{ "value": 1 }],
    "stat": {
      "rowsAffected": 0,
      "rowsRead": 1,
      "rowsWritten": null,
      "queryDurationMs": 1
    }
  }
}
```

Transaction success uses `type: "transaction"` and an array of result sets in
`data`. Optional header `type` values are 1 (text), 2 (integer), 3 (real), 4 (blob).
`originalType` may be null. Statistics other than `rowsAffected` may be null;
numeric fields must be finite. Optional `lastInsertRowid` is a finite number.
Rows are objects. Payloads must be compatible with browser structured cloning.

Error response: use a string `error` and omit `data` entirely:

```json
{
  "type": "query",
  "id": 1,
  "channel": "6ed3eb71-431d-4e72-9e84-8d032b6935cb",
  "error": "Query not permitted"
}
```

Studio sends only to the configured exact parent origin. It accepts responses
only when `event.origin` matches exactly and `event.source === window.parent`.
It then checks channel, pending ID, operation type, and result/error shape.
Unknown, duplicate, spoofed, or malformed responses are ignored without settling
pending requests. Valid errors reject with an `Error`. Cleanup removes the
listener and rejects outstanding requests. No automatic SQL retry is performed;
the parent must return success or failure and enforce its own query deadlines.

## Future parent/Pelican responsibilities

The broker must validate the **Studio** origin, the specific iframe's
`contentWindow`, the per-viewer channel and the request schema before processing
messages. Reply to that iframe using Studio's exact origin, never `"*"`. Check
that the viewer is still current after asynchronous work finishes.

Pelican must implement server-side authentication and authorization, bind each
viewer to the permitted server/database, protect its backend requests against
CSRF as applicable, and keep credentials entirely on the backend. It also owns
session expiry/revocation, query limits/timeouts, result limits, transaction
semantics, audit logging and safe error messages. Browser origin/channel checks
do not replace any of those controls. Do not execute SQL solely because a message
has a matching channel.

Legacy hosts must add the channel and exact-origin checks before using this fork.
There is intentionally no insecure compatibility fallback.
