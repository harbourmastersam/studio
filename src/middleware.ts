import { NextRequest, NextResponse } from "next/server";
import { parseEmbedOrigin } from "./lib/embed-origin";

const notice = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Grey Harbour Database Viewer</title></head><body><main><h1>Grey Harbour Database Viewer</h1><p>Open the Database Viewer from Pelican Panel.</p></main></body></html>`;

// Exposure control only. Pelican must authenticate and authorize every operation.
export function middleware(request: NextRequest) {
  if (process.env.STUDIO_EMBED_ONLY !== "true") return NextResponse.next();

  const path = request.nextUrl.pathname;
  const readOnly = request.method === "GET" || request.method === "HEAD";
  const asset =
    path.startsWith("/_next/static/") ||
    path === "/_next/image" ||
    path.startsWith("/icons/") ||
    path.startsWith("/extension/") ||
    ["/favicon.ico", "/icon.png", "/apple-icon.png"].includes(path);
  if (readOnly && asset) return NextResponse.next();

  const destination = request.headers.get("sec-fetch-dest");
  const mode = request.headers.get("sec-fetch-mode");
  const iframe = destination === "iframe" && mode === "navigate";
  // Next client navigation/refresh fetches within an already loaded viewer.
  // Next strips RSC headers before middleware, so use browser fetch metadata.
  // A top-level document can never enter this branch, even with an RSC header.
  const componentFetch =
    destination === "empty" &&
    (mode === "cors" || mode === "same-origin") &&
    request.headers.get("sec-fetch-site") === "same-origin";
  const allowed =
    readOnly && path === "/embed/mysql" && (iframe || componentFetch);
  const response = allowed
    ? NextResponse.next()
    : new NextResponse(request.method === "HEAD" ? null : notice, {
        status: 403,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });

  // Allowed pages receive these headers from next.config.js. Middleware's
  // early responses bypass that stage; set them here only for denials.
  if (!allowed) {
    const origin = parseEmbedOrigin(
      process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN
    );
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${origin ?? "'none'"}`
    );
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set(
    "Vary",
    "Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, RSC"
  );
  return response;
}

export const config = { matcher: "/:path*" };
