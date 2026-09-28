import {
  handleInternalAi,
  InternalAiEnvironment,
} from "./internal-ai";

type WorkerFallback = (
  request: Request,
  env: InternalAiEnvironment
) => Promise<Response>;

type InternalHandler = typeof handleInternalAi;

export function routeWorkerRequest(
  request: Request,
  env: InternalAiEnvironment,
  fallback: WorkerFallback,
  internalHandler: InternalHandler = handleInternalAi
): Promise<Response> {
  if (new URL(request.url).pathname === "/internal/ai") {
    return internalHandler(request, env);
  }
  return fallback(request, env);
}
