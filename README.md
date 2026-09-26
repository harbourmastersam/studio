# Outerbase Studio

## This fork: secure embedding and Cloudflare Workers

See [build and Cloudflare instructions](docs/cloudflare.md) and the
[iframe transport contract](docs/embedding.md) for this fork's `/embed/mysql`
integration. Production is available only at https://studio.greyharbour.net and
must be opened through https://panel.greyharbour.net. `/embed/mysql` is the
supported production integration route; standalone routes return a minimal 403
page. `workers.dev` and remote version preview URLs are disabled.

Studio remains a UI client. Pelican owns authentication, authorization, sessions,
database credentials and SQL execution. Fetch-metadata checks limit accidental
standalone use; they are not authentication or database authorization.

Use Node.js 24 LTS (22 or later required), then run:

```sh
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
npm run preview
```

Configure `NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN` before building to enable embedding.
Framing is denied without it. `STUDIO_EMBED_ONLY` defaults to `true` in production
builds and `false` in `npm run dev`. Use `STUDIO_EMBED_ONLY=false` at build time
for a standalone local build. Local Worker preview remains available and uses
the build's exposure settings. See the deployment docs for request metadata and
preview checks. The upstream features below remain available in development.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/outerbase/studio)

**Outerbase Studio** is a lightweight, browser-based GUI for managing SQL databases, designed for simplicity and versatility. Initially built for LibSQL and SQLite, it now supports a broad range of databases, including:

**Supported Databases:**

- **SQLite-based Database**
  - Turso/LibSQL
  - SQLite (local files)
  - Cloudflare D1
  - rqlite
  - StarbaseDB
  - Val.town
- MySQL (beta, limited features)
- PostgreSQL (beta, limited features)

---

Give it a try directly from your browser

[![LibSQL Studio, sqlite online editor](https://github.com/user-attachments/assets/5d92ce58-9ce6-4cd7-9c65-4763d2d3b231)](https://libsqlstudio.com)
[![Libsql studio playground](https://github.com/user-attachments/assets/dcf7e246-fe72-4351-ab10-ae2d1658087d)](https://libsqlstudio.com/playground/client?template=chinook)

## Desktop App

You can download [Windows and Mac desktop app here](https://github.com/outerbase/studio-desktop/releases/).

Outerbase Studio Desktop is a lightweight Electron wrapper for the Outerbase Studio web version. It enables support for drivers that aren't feasible in a browser environment, such as MySQL and PostgreSQL.

## Features

![libsqlstudio-git-preview (7)](https://github.com/user-attachments/assets/1d7a3d90-61e3-4a77-83a5-4bb096bbfb4b)

- **Query Editor**: It features a user-friendly query editor equipped with auto-completion and function hint tooltips. It allows you to execute multiple queries simultaneously and view their results efficiently.
- **Data Editor**: It comes with a powerful data editor, allowing you to stage all your changes and preview them before committing. The data table is highly optimized and lightweight, capable of rendering thousands of rows and columns efficiently.
- **Schema Editor**: It allows you to quickly create, modify, and remove table columns with just a few clicks without writing any SQL.
- **Connection Manager**: It includes a flexible connection manager, allowing you to store your connections locally in your browser. You can also store them on a server and share your connections across multiple devices.

The features mentioned above are just a few of the many we offer. Give it a try to explore everything we have in store
