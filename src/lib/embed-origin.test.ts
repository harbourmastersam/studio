import { parseEmbedOrigin } from "./embed-origin";

describe("embed origin configuration", () => {
  it.each([
    "https://panel.example.com",
    "http://localhost:3000",
    "https://panel.example.com:8443",
  ])("accepts the exact HTTP(S) origin %s", (origin) =>
    expect(parseEmbedOrigin(origin)).toBe(origin)
  );

  it.each([undefined, ""])(
    "allows absent config for normal Studio pages",
    (origin) => {
      expect(parseEmbedOrigin(origin)).toBeUndefined();
    }
  );

  it.each([
    "*",
    "null",
    "https://*.example.com",
    "https://panel.example.com/",
    "https://panel.example.com/path",
    "https://panel.example.com?x=1",
    "https://panel.example.com#x",
    "https://user:pass@panel.example.com",
    "https://panel.example.com; frame-ancestors *",
    "ftp://panel.example.com",
    " https://panel.example.com",
    "https://panel.example.com:443",
  ])("rejects non-origin or non-canonical configuration %s", (origin) =>
    expect(() => parseEmbedOrigin(origin)).toThrow(
      /NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN/
    )
  );
});
