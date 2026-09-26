describe("exposure build configuration", () => {
  const savedEnvironment = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnvironment };
    jest.resetModules();
  });

  async function config(nodeEnv: string, flag?: string) {
    Object.assign(process.env, { NODE_ENV: nodeEnv });
    if (flag === undefined) delete process.env.STUDIO_EMBED_ONLY;
    else process.env.STUDIO_EMBED_ONLY = flag;
    jest.resetModules();
    return (await import("../../next.config")).default;
  }

  it("enables exposure restrictions by default in production builds", async () => {
    expect((await config("production")).env?.STUDIO_EMBED_ONLY).toBe("true");
  });
  it("keeps development unrestricted by default", async () => {
    expect((await config("development")).env?.STUDIO_EMBED_ONLY).toBe("false");
  });
  it("supports an explicit standalone local build", async () => {
    expect((await config("production", "false")).env?.STUDIO_EMBED_ONLY).toBe(
      "false"
    );
  });
  it("supports testing exposure controls in development", async () => {
    expect((await config("development", "true")).env?.STUDIO_EMBED_ONLY).toBe(
      "true"
    );
  });
  it.each(["", "TRUE", "0", "false "])(
    "rejects ambiguous flag %j",
    async (flag) => {
      await expect(config("production", flag)).rejects.toThrow(
        /STUDIO_EMBED_ONLY/
      );
    }
  );
});
