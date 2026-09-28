import { handleInternalAi } from "./internal-ai";

const token = "test-broker-token";
const endpoint = "https://studio.greyharbour.net/internal/ai";

function request(body: unknown, init: RequestInit = {}) {
  const { headers, ...rest } = init;
  return new Request(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    ...rest,
  });
}

function environment(response: unknown = { response: "```sql\nSELECT 1\n```" }) {
  return {
    DATABASE_VIEWER_AI_TOKEN: token,
    AI: { run: jest.fn().mockResolvedValue(response) },
  };
}

describe("internal Workers AI endpoint", () => {
  const originalCrypto = globalThis.crypto;

  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        subtle: {
          timingSafeEqual: (left: Uint8Array, right: Uint8Array) =>
            left.length === right.length &&
            left.every((value, index) => value === right[index]),
        },
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    });
  });

  it("invokes only the fixed model for an authenticated bounded request", async () => {
    const env = environment();
    const messages = [{ role: "user", content: "Test the connection" }];

    const response = await handleInternalAi(request({ messages }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      response: "```sql\nSELECT 1\n```",
    });
    expect(env.AI.run).toHaveBeenCalledWith(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      { messages, max_tokens: 1024, temperature: 0 }
    );
  });

  it.each([
    ["missing token", { Authorization: "" }],
    ["wrong token", { Authorization: "Bearer wrong" }],
    ["wrong scheme", { Authorization: token }],
  ])("rejects %s without invoking Workers AI", async (_name, headers) => {
    const env = environment();
    const response = await handleInternalAi(
      request({ messages: [{ role: "user", content: "test" }] }, { headers }),
      env
    );
    expect(response.status).toBe(401);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("rejects unsupported methods and media types", async () => {
    const env = environment();
    const get = await handleInternalAi(
      new Request(endpoint, { method: "GET", headers: { Authorization: `Bearer ${token}` } }),
      env
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("Allow")).toBe("POST");

    const text = await handleInternalAi(
      request({ messages: [] }, { headers: { "Content-Type": "text/plain" } }),
      env
    );
    expect(text.status).toBe(415);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it.each([
    ["empty messages", { messages: [] }],
    ["too many messages", { messages: Array(13).fill({ role: "user", content: "x" }) }],
    ["unknown role", { messages: [{ role: "tool", content: "x" }] }],
    ["extra message key", { messages: [{ role: "user", content: "x", extra: true }] }],
    ["extra envelope key", { messages: [{ role: "user", content: "x" }], extra: true }],
    ["oversized content", { messages: [{ role: "user", content: "x".repeat(24 * 1024 + 1) }] }],
  ])("rejects %s", async (_name, body) => {
    const env = environment();
    const response = await handleInternalAi(request(body), env);
    expect(response.status).toBe(422);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared request before reading it", async () => {
    const env = environment();
    const response = await handleInternalAi(
      request(
        { messages: [{ role: "user", content: "x" }] },
        { headers: { "Content-Length": String(32 * 1024 + 1) } }
      ),
      env
    );
    expect(response.status).toBe(413);
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed model output", { answer: "secret" }],
    ["oversized model output", { response: "x".repeat(16 * 1024 + 1) }],
  ])("returns a generic failure for %s", async (_name, modelResponse) => {
    const env = environment(modelResponse);
    const response = await handleInternalAi(
      request({ messages: [{ role: "user", content: "PRIVATE" }] }),
      env
    );
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: "AI request failed." });
    expect(body).not.toContain("PRIVATE");
  });
});
