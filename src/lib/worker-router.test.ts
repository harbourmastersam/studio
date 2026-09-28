import { routeWorkerRequest } from "./worker-router";

describe("custom Worker routing", () => {
  const env = {
    DATABASE_VIEWER_AI_TOKEN: "secret",
    AI: { run: jest.fn() },
  };

  it("routes only the exact internal AI path to the protected handler", async () => {
    const internal = jest.fn().mockResolvedValue(new Response("ai"));
    const fallback = jest.fn().mockResolvedValue(new Response("next"));

    const response = await routeWorkerRequest(
      new Request("https://studio.greyharbour.net/internal/ai", {
        method: "POST",
      }),
      env,
      fallback,
      internal
    );

    expect(await response.text()).toBe("ai");
    expect(internal).toHaveBeenCalledTimes(1);
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each(["/internal/ai/", "/INTERNAL/ai", "/embed/mysql", "/internal/ai/extra"])(
    "delegates %s unchanged to OpenNext",
    async (path) => {
      const internal = jest.fn();
      const fallback = jest.fn().mockResolvedValue(new Response("next"));
      const request = new Request(`https://studio.greyharbour.net${path}`);

      const response = await routeWorkerRequest(
        request,
        env,
        fallback,
        internal
      );

      expect(await response.text()).toBe("next");
      expect(fallback).toHaveBeenCalledWith(request, env);
      expect(internal).not.toHaveBeenCalled();
    }
  );
});
