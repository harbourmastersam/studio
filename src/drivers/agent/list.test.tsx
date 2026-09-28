/** @jest-environment jsdom */
import type { BaseDriver } from "../base-driver";
import AgentDriverList from "./list";

describe("managed embedded AI agent", () => {
  const driver = {
    getFlags: () => ({ dialect: "mysql", defaultSchema: "s2_test" }),
  } as unknown as BaseDriver;

  beforeEach(() => localStorage.clear());

  it("routes the managed model through the Pelican iframe transport", async () => {
    const transport = jest
      .fn()
      .mockResolvedValue("```sql\nSELECT COUNT(*) FROM users\n```");
    const agents = new AgentDriverList(driver, undefined, transport);

    await expect(
      agents.run("llama-3.3-70b", "Count users", undefined, { selected: "" })
    ).resolves.toBe("SELECT COUNT(*) FROM users\n");
    expect(transport).toHaveBeenCalledWith([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "" },
      { role: "user", content: "Count users" },
    ]);
  });

  it("makes only the managed Cloudflare model available and repairs a stale default", () => {
    localStorage.setItem("default-agent-model", "gpt-4o mini");
    const agents = new AgentDriverList(driver, "saved-browser-token", jest.fn());

    expect(agents.getDefaultModelName()).toBe("llama-3.3-70b");
    expect(agents.list().flatMap((group) => group.agents)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "llama-3.3-70b",
          available: true,
          free: false,
        }),
        expect.objectContaining({ name: "sqlcoder-7b-2", available: false }),
        expect.objectContaining({ name: "gpt-4o mini", available: false }),
      ])
    );
  });
});
