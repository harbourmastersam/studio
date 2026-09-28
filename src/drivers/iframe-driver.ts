"use client";
import { parseEmbedOrigin } from "@/lib/embed-origin";
import { generateId } from "@/lib/generate-id";
import type { DatabaseResultSet, QueryableBaseDriver } from "./base-driver";
import type { CommonAgentMessage } from "./agent/common";

type MessageIdentity = { id: number; channel: string; document: string };

export type EmbedRequest = MessageIdentity &
  (
    | { type: "query"; statement: string }
    | { type: "transaction"; statements: string[] }
    | { type: "ai"; messages: CommonAgentMessage[] }
  );

export type EmbedResponse = MessageIdentity &
  (
    | { type: "query"; data: DatabaseResultSet; error?: never }
    | { type: "transaction"; data: DatabaseResultSet[]; error?: never }
    | { type: "ai"; data: { response: string }; error?: never }
    | { type: "query" | "transaction" | "ai"; error: string; data?: never }
  );

type PendingRequest = { reject: (reason: Error) => void } & (
  | { type: "query"; resolve: (value: DatabaseResultSet) => void }
  | { type: "transaction"; resolve: (value: DatabaseResultSet[]) => void }
  | { type: "ai"; resolve: (value: string) => void }
);

// Preserve numeric IDs, without reusing them across connections in this document.
let nextRequestId = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === [...expected].sort()[index])
  );
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createDocumentId(): string {
  return generateId().replaceAll("-", "").toLowerCase();
}

function isArrayOf<T>(
  value: unknown,
  validate: (item: unknown) => item is T
): value is T[] {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length)
    return false;
  // Structured cloning can preserve extra array properties. Never invoke a
  // method supplied by the payload, or skip sparse entries as .every() does.
  for (let index = 0; index < value.length; index++) {
    if (
      !Object.prototype.hasOwnProperty.call(value, index) ||
      !validate(value[index])
    )
      return false;
  }
  return true;
}

function isResultSet(value: unknown): value is DatabaseResultSet {
  if (!isRecord(value) || !isRecord(value.stat)) return false;
  return (
    isArrayOf(value.rows, isRecord) &&
    isArrayOf(
      value.headers,
      (header: unknown): header is DatabaseResultSet["headers"][number] =>
        isRecord(header) &&
        typeof header.name === "string" &&
        typeof header.displayName === "string" &&
        (header.originalType === null ||
          typeof header.originalType === "string") &&
        (header.type === undefined ||
          header.type === 1 ||
          header.type === 2 ||
          header.type === 3 ||
          header.type === 4)
    ) &&
    isNumber(value.stat.rowsAffected) &&
    [
      value.stat.rowsRead,
      value.stat.rowsWritten,
      value.stat.queryDurationMs,
    ].every((stat) => stat === null || isNumber(stat)) &&
    (value.lastInsertRowid === undefined || isNumber(value.lastInsertRowid))
  );
}

function validAgentMessages(messages: CommonAgentMessage[]) {
  if (
    !isArrayOf(
      messages,
      (message: unknown): message is CommonAgentMessage =>
        isRecord(message) &&
        hasExactKeys(message, ["role", "content"]) &&
        ["system", "user", "assistant"].includes(String(message.role)) &&
        typeof message.content === "string"
    ) ||
    messages.length < 1 ||
    messages.length > 12
  )
    return false;
  return (
    messages.reduce(
      (total, message) =>
        total + new TextEncoder().encode(message.content).byteLength,
      0
    ) <=
    24 * 1024
  );
}

function readChannel(): string | null {
  const channels = new URLSearchParams(window.location.search).getAll(
    "channel"
  );
  return channels.length === 1 ? channels[0] : null;
}

class IframeConnection {
  private readonly origin: string;
  private readonly channel: string;
  private readonly document = createDocumentId();
  private readonly pending = new Map<number, PendingRequest>();
  private state: "new" | "listening" | "closed" = "new";

  constructor(channel: string | null) {
    const origin = parseEmbedOrigin(
      process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN
    );
    if (!origin) {
      throw new Error(
        "Embedding is disabled: set NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN to the parent application's exact origin and rebuild Studio."
      );
    }
    if (!channel || !/^[A-Za-z0-9_-]{22,256}$/.test(channel)) {
      throw new Error(
        "An embed URL requires one channel parameter containing 22–256 URL-safe characters. The parent must generate a cryptographically random nonce for each viewer."
      );
    }
    this.origin = origin;
    this.channel = channel;
  }

  private readonly onMessage = (event: MessageEvent<unknown>) => {
    if (event.origin !== this.origin || event.source !== window.parent) return;
    const message = event.data;
    if (
      !isRecord(message) ||
      message.channel !== this.channel ||
      message.document !== this.document ||
      typeof message.id !== "number" ||
      !Number.isSafeInteger(message.id)
    )
      return;
    const pending = this.pending.get(message.id);
    if (!pending || message.type !== pending.type) return;

    if ("error" in message) {
      if (typeof message.error !== "string" || "data" in message) return;
      this.pending.delete(message.id);
      pending.reject(new Error(message.error));
    } else if (pending.type === "query" && isResultSet(message.data)) {
      this.pending.delete(message.id);
      pending.resolve(message.data);
    } else if (
      pending.type === "transaction" &&
      isArrayOf(message.data, isResultSet)
    ) {
      this.pending.delete(message.id);
      pending.resolve(message.data);
    } else if (
      pending.type === "ai" &&
      isRecord(message.data) &&
      hasExactKeys(message.data, ["response"]) &&
      typeof message.data.response === "string"
    ) {
      this.pending.delete(message.id);
      pending.resolve(message.data.response);
    }
  };

  listen(): () => void {
    if (this.state !== "listening") {
      window.addEventListener("message", this.onMessage);
      this.state = "listening";
    }
    return this.close;
  }

  private readonly close = () => {
    window.removeEventListener("message", this.onMessage);
    this.state = "closed";
    for (const pending of this.pending.values()) {
      pending.reject(
        new Error("Embed connection closed before a response was received.")
      );
    }
    this.pending.clear();
  };

  private send(request: EmbedRequest, pending: PendingRequest) {
    if (this.state === "closed") {
      pending.reject(new Error("Embed connection is closed."));
      return;
    }
    // Child effects can query before the page's effect subscribes.
    if (this.state === "new") this.listen();
    this.pending.set(request.id, pending);
    try {
      window.parent.postMessage(request, this.origin);
    } catch (error) {
      this.pending.delete(request.id);
      pending.reject(
        error instanceof Error
          ? error
          : new Error("Unable to send embed request.")
      );
    }
  }

  query(statement: string): Promise<DatabaseResultSet> {
    return new Promise((resolve, reject) => {
      this.send(
        {
          type: "query",
          id: ++nextRequestId,
          channel: this.channel,
          document: this.document,
          statement,
        },
        { type: "query", resolve, reject }
      );
    });
  }

  transaction(statements: string[]): Promise<DatabaseResultSet[]> {
    return new Promise((resolve, reject) => {
      this.send(
        {
          type: "transaction",
          id: ++nextRequestId,
          channel: this.channel,
          document: this.document,
          statements,
        },
        { type: "transaction", resolve, reject }
      );
    });
  }

  ai(messages: CommonAgentMessage[]): Promise<string> {
    if (!validAgentMessages(messages)) {
      return Promise.reject(new Error("AI request is invalid or too large."));
    }
    return new Promise((resolve, reject) => {
      this.send(
        {
          type: "ai",
          id: ++nextRequestId,
          channel: this.channel,
          document: this.document,
          messages: messages.map((message) => ({ ...message })),
        },
        { type: "ai", resolve, reject }
      );
    });
  }
}

class ElectronConnection {
  listen() {
    // Electron owns its IPC lifecycle; iframe configuration does not apply.
  }
  query(stmt: string): Promise<DatabaseResultSet> {
    return window.outerbaseIpc!.query(stmt);
  }
  transaction(stmts: string[]): Promise<DatabaseResultSet[]> {
    return window.outerbaseIpc!.transaction(stmts);
  }
  ai(): Promise<string> {
    return Promise.reject(new Error("Managed AI is unavailable in Electron."));
  }
}

export class EmbedQueryable implements QueryableBaseDriver {
  protected readonly conn: ElectronConnection | IframeConnection;

  constructor(channel?: string | null) {
    this.conn = window.outerbaseIpc
      ? new ElectronConnection()
      : new IframeConnection(channel === undefined ? readChannel() : channel);
  }
  listen() {
    return this.conn.listen();
  }
  query(stmt: string): Promise<DatabaseResultSet> {
    return this.conn.query(stmt);
  }
  transaction(stmts: string[]): Promise<DatabaseResultSet[]> {
    return this.conn.transaction(stmts);
  }
  ai(messages: CommonAgentMessage[]): Promise<string> {
    return this.conn.ai(messages);
  }
}
