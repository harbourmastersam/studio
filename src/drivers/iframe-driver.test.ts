import { EmbedQueryable } from "./iframe-driver";
import type { DatabaseResultSet } from "./base-driver";

const origin = "https://panel.example.com";
const channel = "viewer_0123456789abcdefghijk";
const result: DatabaseResultSet = {
  rows: [{ answer: 42 }],
  headers: [
    { name: "answer", displayName: "answer", originalType: "INT", type: 2 },
  ],
  stat: { rowsAffected: 0, rowsRead: 1, rowsWritten: null, queryDurationMs: 2 },
};

describe("iframe transport", () => {
  let parent: { postMessage: jest.Mock };
  let listeners: Set<(event: MessageEvent<unknown>) => void>;
  let cleanups: (() => void)[];

  beforeEach(() => {
    parent = { postMessage: jest.fn() };
    listeners = new Set();
    cleanups = [];
    Object.assign(window, {
      parent,
      location: { search: `?channel=${channel}` },
      outerbaseIpc: undefined,
      addEventListener: jest.fn((type, handler) => {
        if (type === "message") listeners.add(handler);
      }),
      removeEventListener: jest.fn((type, handler) => {
        if (type === "message") listeners.delete(handler);
      }),
    });
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN = origin;
  });

  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup());
    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
  });

  function connect() {
    const connection = new EmbedQueryable();
    const cleanup = connection.listen();
    if (cleanup) cleanups.push(cleanup);
    return connection;
  }

  function receive(data: unknown, overrides: Record<string, unknown> = {}) {
    const message =
      typeof data === "object" && data !== null && !Array.isArray(data)
        ? {
            document: parent.postMessage.mock.calls.at(-1)?.[0]?.document,
            ...data,
          }
        : data;
    const event = { data: message, origin, source: parent, ...overrides };
    listeners.forEach((listener) =>
      listener(event as unknown as MessageEvent<unknown>)
    );
  }

  function lastRequest() {
    return parent.postMessage.mock.calls.at(-1)![0];
  }

  it("uses the exact parent origin and channel and accepts its query response", async () => {
    const connection = connect();
    const pending = connection.query("SELECT 42");
    const request = lastRequest();
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        type: "query",
        id: expect.any(Number),
        document: expect.stringMatching(/^[a-f0-9]{32}$/),
        statement: "SELECT 42",
        channel,
      },
      origin
    );
    receive({ type: "query", id: request.id, channel, data: result });
    await expect(pending).resolves.toEqual(result);
  });

  it.each([
    ["wrong origin", { origin: "https://attacker.example" }, {}],
    ["unexpected source", { source: {} }, {}],
    ["null source", { source: null }, {}],
    ["wrong channel", {}, { channel: "another_0123456789abcdefghijk" }],
    ["missing channel", {}, { channel: undefined }],
    ["wrong document", {}, { document: "f".repeat(32) }],
    ["wrong response type", {}, { type: "transaction", data: [result] }],
    ["string request ID", {}, { id: "1" }],
    ["unknown request ID", {}, { id: -1 }],
    ["malformed result", {}, { data: {} }],
    ["malformed headers", {}, { data: { ...result, headers: [null] } }],
    ["malformed rows", {}, { data: { ...result, rows: [null] } }],
    ["sparse rows", {}, { data: { ...result, rows: new Array(1) } }],
    ["sparse headers", {}, { data: { ...result, headers: new Array(1) } }],
    [
      "shadowed array method",
      {},
      { data: { ...result, rows: Object.assign([], { every: 1 }) } },
    ],
    ["malformed statistics", {}, { data: { ...result, stat: {} } }],
    ["malformed error", {}, { error: 12 }],
    ["ambiguous success and error", {}, { error: "denied" }],
  ])("ignores %s without settling the request", async (_label, event, data) => {
    const connection = connect();
    const pending = connection.query("SELECT 42");
    const response = {
      type: "query",
      id: lastRequest().id,
      channel,
      data: result,
    };
    const settled = jest.fn();
    void pending.then(settled, settled);
    receive({ ...response, ...data }, event);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    receive(response);
    await expect(pending).resolves.toEqual(result);
  });

  it.each([null, undefined, [], "hello", 1, {}, { type: "query" }])(
    "ignores malformed envelopes: %p",
    (data) => {
      connect();
      expect(() => receive(data)).not.toThrow();
    }
  );

  it("pairs out-of-order success and error responses with the correct requests", async () => {
    const connection = connect();
    const first = connection.query("SELECT 42");
    const firstId = lastRequest().id;
    const second = connection.query("invalid sql");
    const secondId = lastRequest().id;
    receive({ type: "query", id: secondId, channel, error: "SQL denied" });
    receive({ type: "query", id: firstId, channel, data: result });
    await expect(second).rejects.toThrow("SQL denied");
    await expect(first).resolves.toEqual(result);
  });

  it("sends and receives a transaction", async () => {
    const connection = connect();
    const pending = connection.transaction(["SELECT 42", "SELECT 42"]);
    const request = lastRequest();
    expect(parent.postMessage).toHaveBeenCalledWith(
      {
        type: "transaction",
        id: request.id,
        channel,
        document: expect.stringMatching(/^[a-f0-9]{32}$/),
        statements: ["SELECT 42", "SELECT 42"],
      },
      origin
    );
    receive({
      type: "transaction",
      id: request.id,
      channel,
      data: [result, result],
    });
    await expect(pending).resolves.toEqual([result, result]);
  });

  it("rejects the matching transaction on an error response", async () => {
    const connection = connect();
    const pending = connection.transaction(["invalid sql"]);
    receive({
      type: "transaction",
      id: lastRequest().id,
      channel,
      error: "transaction failed",
    });
    await expect(pending).rejects.toThrow("transaction failed");
  });

  it("removes the listener and rejects pending requests on cleanup", async () => {
    const connection = connect();
    const pending = connection.query("SELECT 42");
    expect(cleanups).toHaveLength(1);
    cleanups[0]();
    expect(listeners.size).toBe(0);
    await expect(pending).rejects.toThrow(/closed/i);
    await expect(connection.query("SELECT 43")).rejects.toThrow(/closed/i);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate listeners and can listen again after React effect cleanup", async () => {
    const connection = connect();
    connection.listen();
    expect(listeners.size).toBe(1);
    cleanups[0]();
    const cleanup = connection.listen();
    if (cleanup) cleanups.push(cleanup);
    const pending = connection.query("SELECT 42");
    receive({ type: "query", id: lastRequest().id, channel, data: result });
    await expect(pending).resolves.toEqual(result);
    expect(listeners.size).toBe(1);
  });

  it("does not reuse request IDs across viewer connections", async () => {
    const first = connect();
    const firstPending = first.query("SELECT 42");
    const oldId = lastRequest().id;
    receive({ type: "query", id: oldId, channel, data: result });
    await firstPending;
    cleanups[0]();
    const second = connect();
    const secondPending = second.query("SELECT 42");
    const newId = lastRequest().id;
    expect(newId).not.toBe(oldId);
    const settled = jest.fn();
    void secondPending.then(settled);
    receive({ type: "query", id: oldId, channel, data: result });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    receive({ type: "query", id: newId, channel, data: result });
    await expect(secondPending).resolves.toEqual(result);
  });

  it("listens before sending even when a child effect queries before the page effect", async () => {
    const connection = new EmbedQueryable();
    parent.postMessage.mockImplementation((request) => {
      receive({ type: "query", id: request.id, channel, data: result });
    });
    await expect(connection.query("SELECT 42")).resolves.toEqual(result);
    const cleanup = connection.listen();
    if (cleanup) cleanups.push(cleanup);
  });

  it.each([
    undefined,
    "",
    "*",
    "null",
    "https://panel.example.com/path",
    "https://panel.example.com/",
    "https://user:pass@panel.example.com",
    "https://panel.example.com https://other.example",
    "javascript:alert(1)",
  ])("fails closed for invalid origin %p", (value) => {
    if (value === undefined)
      delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    else process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN = value;
    expect(() => connect()).toThrow(/NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN/);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it.each([
    "",
    "?channel=",
    "?channel=short",
    "?channel=has%20spaces_01234567890123456789",
    `?channel=${channel}&channel=${channel}`,
  ])("fails closed for invalid channel context %p", (search) => {
    window.location.search = search;
    expect(() => connect()).toThrow(/channel/i);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it("preserves Electron IPC without iframe configuration", async () => {
    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    window.location.search = "";
    window.outerbaseIpc = {
      query: jest.fn().mockResolvedValue(result),
      transaction: jest.fn().mockResolvedValue([result]),
    } as unknown as typeof window.outerbaseIpc;
    const connection = connect();
    await expect(connection.query("SELECT 42")).resolves.toEqual(result);
    await expect(connection.transaction(["SELECT 42"])).resolves.toEqual([
      result,
    ]);
    expect(parent.postMessage).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it("accepts result headers without an optional SDK type hint", async () => {
    const connection = connect();
    const pending = connection.query("SELECT 42");
    const untyped = {
      ...result,
      headers: [{ name: "answer", displayName: "answer", originalType: null }],
    };
    receive({ type: "query", id: lastRequest().id, channel, data: untyped });
    await expect(pending).resolves.toEqual(untyped);
  });

  it("rejects a send failure without leaving a pending request", async () => {
    const connection = connect();
    parent.postMessage.mockImplementationOnce(() => {
      throw new Error("send failed");
    });
    await expect(connection.query("SELECT 42")).rejects.toThrow("send failed");
    receive({ type: "query", id: lastRequest().id, channel, data: result });
    cleanups[0]();
    expect(listeners.size).toBe(0);
  });

  it.each([[new Array(1)], [Object.assign([], { every: 1 })]])(
    "ignores malformed transaction arrays without throwing or settling",
    async (data) => {
      const connection = connect();
      const pending = connection.transaction(["SELECT 42"]);
      const response = {
        type: "transaction",
        id: lastRequest().id,
        channel,
        data: [result],
      };
      const settled = jest.fn();
      void pending.then(settled, settled);
      expect(() => receive({ ...response, data })).not.toThrow();
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      receive(response);
      await expect(pending).resolves.toEqual([result]);
    }
  );
});
