describe("embed frame protection", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    jest.resetModules();
  });

  async function headers(origin?: string) {
    if (origin) process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN = origin;
    else delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    jest.resetModules();
    // Exercise the Next configuration that OpenNext consumes, not a copy of it.
    const config = await import("../../next.config");
    return config.default.headers!();
  }

  it("restricts only embed pages to the configured parent", async () => {
    await expect(headers("https://panel.example.com")).resolves.toEqual([
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://panel.example.com",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ]);
  });

  it("denies framing when embed configuration is absent", async () => {
    await expect(headers()).resolves.toEqual([
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ]);
  });

  it("fails the configuration load for invalid origins", async () => {
    await expect(headers("https://panel.example.com/path")).rejects.toThrow(
      /NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN/
    );
  });
});
