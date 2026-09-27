/** @jest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import MySQLLikeDriver from "@/drivers/mysql/mysql-driver";
import EmbedPageClient from "./page-client";

jest.mock("next/navigation", () => ({ useSearchParams: jest.fn() }));
jest.mock("@/components/gui/studio", () => ({
  Studio: () => <div>Full Studio</div>,
}));
jest.mock("@/core/extension-manager", () => ({
  StudioExtensionManager: jest.fn(),
}));
jest.mock("@/core/standard-extension", () => ({
  createMySQLExtensions: jest.fn(),
  createPostgreSQLExtensions: jest.fn(),
  createSQLiteExtensions: jest.fn(),
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
          new URLSearchParams(`channel=${channel}${suffix}`) as ReturnType<
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
});
