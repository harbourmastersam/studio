const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const GATEWAY = "database-viewer";
const MAX_REQUEST_BYTES = 32 * 1024;
const MAX_MESSAGES = 12;
const MAX_CONTENT_BYTES = 24 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;

type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface InternalAiEnvironment {
  DATABASE_VIEWER_AI_TOKEN?: string;
  AI: {
    run(
      model: string,
      input: { messages: AiMessage[]; max_tokens: number; temperature: number },
      options?: { gateway: { id: string; skipCache: boolean } }
    ): Promise<unknown>;
  };
}

function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return (
    keys.length === sorted.length &&
    keys.every((key, index) => key === sorted[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validMessages(value: unknown): value is AiMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_MESSAGES)
    return false;

  let contentBytes = 0;
  for (const message of value) {
    if (
      !isRecord(message) ||
      !exactKeys(message, ["role", "content"]) ||
      !["system", "user", "assistant"].includes(String(message.role)) ||
      typeof message.content !== "string"
    )
      return false;
    contentBytes += new TextEncoder().encode(message.content).byteLength;
    if (contentBytes > MAX_CONTENT_BYTES) return false;
  }
  return true;
}

function tokenMatches(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const expectedBytes = encoder.encode(expected);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean;
  };
  const lengthsMatch = providedBytes.byteLength === expectedBytes.byteLength;
  return lengthsMatch
    ? subtle.timingSafeEqual(providedBytes, expectedBytes)
    : !subtle.timingSafeEqual(providedBytes, providedBytes);
}

export async function handleInternalAi(
  request: Request,
  env: InternalAiEnvironment
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "private, no-store" },
    });
  }

  const token = env.DATABASE_VIEWER_AI_TOKEN;
  if (!token) return json({ error: "AI request failed." }, 503);
  const authorized = tokenMatches(
    request.headers.get("Authorization") ?? "",
    `Bearer ${token}`
  );
  if (!authorized) return json({ error: "Unauthorized." }, 401);

  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0];
  if (contentType?.trim().toLowerCase() !== "application/json") {
    return json({ error: "Unsupported media type." }, 415);
  }

  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return json({ error: "AI request is too large." }, 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return json({ error: "AI request is too large." }, 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "AI request not permitted." }, 422);
  }
  if (
    !isRecord(payload) ||
    !exactKeys(payload, ["messages"]) ||
    !validMessages(payload.messages)
  ) {
    return json({ error: "AI request not permitted." }, 422);
  }

  try {
    const result = await env.AI.run(
      MODEL,
      {
        messages: payload.messages,
        max_tokens: 1024,
        temperature: 0,
      },
      {
        gateway: {
          id: GATEWAY,
          skipCache: true,
        },
      }
    );
    if (
      !isRecord(result) ||
      typeof result.response !== "string" ||
      new TextEncoder().encode(result.response).byteLength > MAX_RESPONSE_BYTES
    ) {
      return json({ error: "AI request failed." }, 503);
    }
    return json({ response: result.response }, 200);
  } catch {
    return json({ error: "AI request failed." }, 503);
  }
}
