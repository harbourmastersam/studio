// @ts-ignore OpenNext generates this module before Wrangler bundles the Worker.
import openNext from "./.open-next/worker.js";
import type { InternalAiEnvironment } from "./src/lib/internal-ai";
import { routeWorkerRequest } from "./src/lib/worker-router";

export default {
  fetch(request: Request, env: InternalAiEnvironment, ctx: unknown) {
    return routeWorkerRequest(request, env, (nextRequest, nextEnv) =>
      openNext.fetch(nextRequest, nextEnv, ctx)
    );
  },
};
