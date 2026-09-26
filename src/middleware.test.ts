import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("production exposure", () => {
  const originalFlag = process.env.STUDIO_EMBED_ONLY;
  const originalOrigin = process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
  beforeEach(() => {
    process.env.STUDIO_EMBED_ONLY = "true";
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN =
      "https://panel.greyharbour.net";
  });
  afterAll(() => {
    if (originalFlag === undefined) delete process.env.STUDIO_EMBED_ONLY;
    else process.env.STUDIO_EMBED_ONLY = originalFlag;
    if (originalOrigin === undefined)
      delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    else process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN = originalOrigin;
  });

  function request(
    path: string,
    headers: Record<string, string> = {},
    method = "GET"
  ) {
    return middleware(
      new NextRequest(`https://studio.greyharbour.net${path}`, {
        headers,
        method,
      })
    );
  }
  const iframe = { "sec-fetch-dest": "iframe", "sec-fetch-mode": "navigate" };
  const rsc = {
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    rsc: "1",
  };

  it("allows iframe documents without sharing cached responses with top-level requests", () => {
    const response = request(
      "/embed/mysql?channel=1234567890123456789012",
      iframe
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toContain("Sec-Fetch-Dest");
  });

  it.each([
    {},
    { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" },
    { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", rsc: "1" },
    { "sec-fetch-dest": "iframe" },
    { "sec-fetch-dest": "iframe", "sec-fetch-mode": "cors" },
    { "sec-fetch-dest": "iframe, document", "sec-fetch-mode": "navigate" },
    { "sec-fetch-dest": "IFRAME", "sec-fetch-mode": "navigate" },
    { "sec-fetch-dest": "empty", "sec-fetch-mode": "cors" },
    { ...rsc, "sec-fetch-site": "cross-site" },
    { ...rsc, "sec-fetch-mode": "navigate" },
    { ...rsc, "sec-fetch-site": "same-origin, cross-site" },
  ])("rejects unsafe or incomplete embed metadata: %j", async (headers) => {
    const response = request("/embed/mysql", headers as Record<string, string>);
    expect(response.status).toBe(403);
    expect(response.headers.get("content-security-policy")).toBe(
      "frame-ancestors https://panel.greyharbour.net"
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("Pelican Panel");
  });

  it("allows same-origin Next RSC fetches within the viewer", () => {
    expect(
      request("/embed/mysql?_rsc=refresh", rsc).headers.get("x-middleware-next")
    ).toBe("1");
  });
  it("allows framework fetch metadata after Next strips internal RSC headers", () => {
    expect(
      request("/embed/mysql", {
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      }).headers.get("x-middleware-next")
    ).toBe("1");
  });
  it.each([
    "/",
    "/local",
    "/local/new-base/mysql",
    "/connect",
    "/w/test",
    "/playground/client",
    "/client/s/mysql",
    "/sign-in",
    "/docs",
    "/api/v1/test",
    "/proxy/d1",
    "/embed/postgres",
    "/embed/board/test",
    "/embed/mysql/other",
    "/local/file.js",
    "/_next/data/build/local.json",
  ])(
    "blocks standalone or unsupported route %s even with iframe metadata",
    (path) => {
      expect(request(path, iframe).status).toBe(403);
    }
  );
  it.each(["POST", "PUT", "DELETE"])(
    "rejects %s on the read-only embed endpoint",
    (method) => {
      expect(request("/embed/mysql", iframe, method).status).toBe(403);
    }
  );
  it.each([
    "/_next/static/chunks/app.js",
    "/_next/static/css/app.css",
    "/_next/static/media/font.woff2",
    "/_next/image?url=%2Fextension%2Fdefinition-dark.png&w=640&q=75",
    "/favicon.ico",
    "/icon.png",
    "/apple-icon.png",
    "/icons/outerbase.svg",
    "/extension/definition-dark.png",
  ])("preserves required asset %s", (path) => {
    expect(request(path).headers.get("x-middleware-next")).toBe("1");
  });
  it.each([
    "/",
    "/local",
    "/connect",
    "/embed/mysql",
    "/embed/postgres",
    "/api/v1/test",
  ])(
    "keeps development route %s available when the guard is disabled",
    (path) => {
      process.env.STUDIO_EMBED_ONLY = "false";
      expect(request(path).headers.get("x-middleware-next")).toBe("1");
    }
  );
  it("fails closed for frame ancestors without a configured origin", () => {
    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    expect(request("/embed/mysql").headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'"
    );
  });
});
