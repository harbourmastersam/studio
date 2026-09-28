/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import MySQLLikeDriver from "@/drivers/mysql/mysql-driver";
import { parseEmbedDatabase } from "@/lib/embed-database";
import { useAvailableAIAgents } from "@/lib/ai-agent-storage";
import { EmbedQueryable } from "@/drivers/iframe-driver";
import EmbedPageClient from "./page-client";

jest.mock("next/navigation", () => ({ useSearchParams: jest.fn() }));
jest.mock("@/components/gui/studio", () => ({
  Studio: () => <div>Full Studio</div>,
}));
jest.mock("@/core/extension-manager", () => ({
  StudioExtensionManager: jest.fn(),
}));
jest.mock("@/core/standard-extension", () => ({
  createMySQLExtensions: jest.fn(() => []),
  createPostgreSQLExtensions: jest.fn(() => []),
  createSQLiteExtensions: jest.fn(() => []),
}));
jest.mock("@/drivers/mysql/mysql-driver", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@/drivers/postgres/postgres-driver", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@/drivers/sqlite-base-driver", () => ({
  SqliteLikeBaseDriver: jest.fn(),
}));
jest.mock("@/drivers/saved-doc/electron-saved-doc", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@/extensions/dolt", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@/extensions/local-setting-sidebar", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@/lib/ai-agent-storage", () => ({
  useAvailableAIAgents: jest.fn(),
}));

describe("embed database parsing", () => {
  it.each([
    ["s2_test", "s2_test"],
    ["tenant's data", "tenant's data"],
    ["客户数据", "客户数据"],
    ["😀".repeat(64), "😀".repeat(64)],
  ])("accepts one valid database %s", (database, expected) => {
    expect(parseEmbedDatabase(new URLSearchParams({ database }))).toEqual({
      valid: true,
      value: expected,
    });
  });

  it.each([
    ["missing", new URLSearchParams()],
    ["empty", new URLSearchParams({ database: "" })],
    [
      "duplicate",
      new URLSearchParams("database=first&database=second"),
    ],
    ["65 code points", new URLSearchParams({ database: "😀".repeat(65) })],
    ["C0 control", new URLSearchParams({ database: "bad\u0000name" })],
    ["delete", new URLSearchParams({ database: "bad\u007fname" })],
    ["replacement", new URLSearchParams({ database: "bad\ufffdname" })],
    ["malformed encoding", new URLSearchParams("database=%E0%A4%A")],
  ])("rejects %s database input", (_name, params) => {
    expect(parseEmbedDatabase(params)).toEqual({ valid: false });
  });
});

describe("probe route selection", () => {
  const channel = "viewer_0123456789abcdefghijk";
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN = "https://panel.example.com";
  });
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
  });

  it("does not construct the schema-loading driver in explicit MySQL probe mode", () => {
    jest
      .mocked(useSearchParams)
      .mockReturnValue(
        new URLSearchParams(`channel=${channel}&mode=probe`) as ReturnType<
          typeof useSearchParams
        >
      );
    render(<EmbedPageClient driverName="mysql" />);
    expect(screen.getByRole("button", { name: "Run SELECT 1" })).toBeTruthy();
    expect(MySQLLikeDriver).not.toHaveBeenCalled();
    expect(screen.queryByText("Full Studio")).toBeNull();
  });

  it.each(["", "&mode=normal", "&mode=probe&mode=probe"])(
    "preserves the existing flow for mode suffix %s",
    (suffix) => {
      jest
        .mocked(useSearchParams)
        .mockReturnValue(
          new URLSearchParams(
            `channel=${channel}&database=s2_test${suffix}`
          ) as ReturnType<
            typeof useSearchParams
          >
        );
      render(<EmbedPageClient driverName="mysql" />);
      expect(screen.getByText("Full Studio")).toBeTruthy();
      expect(MySQLLikeDriver).toHaveBeenCalledTimes(1);
    }
  );

  it("does not silently accept duplicate channels in probe mode", () => {
    jest
      .mocked(useSearchParams)
      .mockReturnValue(
        new URLSearchParams(
          `channel=${channel}&channel=${channel}&mode=probe`
        ) as ReturnType<typeof useSearchParams>
      );
    render(<EmbedPageClient driverName="mysql" />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("passes the selected database to the normal MySQL driver", () => {
    jest.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams(
        `channel=${channel}&database=tenant%27s+data`
      ) as ReturnType<typeof useSearchParams>
    );

    render(<EmbedPageClient driverName="mysql" />);

    expect(screen.getByText("Full Studio")).toBeTruthy();
    expect(MySQLLikeDriver).toHaveBeenCalledTimes(1);
    expect(jest.mocked(MySQLLikeDriver).mock.calls[0][1]).toBe("tenant's data");
  });

  it("routes embedded AI through the same channel-bound iframe connection", async () => {
    jest.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams(
        `channel=${channel}&database=s2_test`
      ) as ReturnType<typeof useSearchParams>
    );
    const ai = jest
      .spyOn(EmbedQueryable.prototype, "ai")
      .mockResolvedValue("```sql\nSELECT 1\n```");

    render(<EmbedPageClient driverName="mysql" />);

    expect(useAvailableAIAgents).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function)
    );
    const managedQuery = jest.mocked(useAvailableAIAgents).mock.calls[0][1]!;
    const messages = [{ role: "user", content: "test" }];
    await expect(managedQuery(messages)).resolves.toContain("SELECT 1");
    expect(ai).toHaveBeenCalledWith(messages);
  });

  it.each([
    ["missing", `channel=${channel}`],
    ["duplicate", `channel=${channel}&database=one&database=two`],
    ["malformed", `channel=${channel}&database=%E0%A4%A`],
  ])("fails closed for %s normal MySQL database scope", (_name, query) => {
    jest
      .mocked(useSearchParams)
      .mockReturnValue(
        new URLSearchParams(query) as ReturnType<typeof useSearchParams>
      );

    render(<EmbedPageClient driverName="mysql" />);

    expect(screen.getByRole("alert").textContent).toBe(
      "Unable to open this database viewer."
    );
    expect(MySQLLikeDriver).not.toHaveBeenCalled();
    expect(screen.queryByText("Full Studio")).toBeNull();
  });

  it("does not require database scope for non-MySQL embeds", () => {
    jest
      .mocked(useSearchParams)
      .mockReturnValue(
        new URLSearchParams(`channel=${channel}`) as ReturnType<
          typeof useSearchParams
        >
      );

    render(<EmbedPageClient driverName="sqlite" />);

    expect(screen.getByText("Full Studio")).toBeTruthy();
    expect(MySQLLikeDriver).not.toHaveBeenCalled();
  });
});
