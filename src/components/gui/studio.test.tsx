/** @jest-environment jsdom */
import { render, waitFor } from "@testing-library/react";
import type { DatabaseResultSet, QueryableBaseDriver } from "@/drivers/base-driver";
import MySQLLikeDriver from "@/drivers/mysql/mysql-driver";
import { useStudioContext } from "@/context/driver-provider";
import { Studio } from "./studio";
import { useEffect } from "react";

jest.mock("@/lib/export-helper", () => ({ parseUserInput: jest.fn() }));
jest.mock("@/components/common-dialog", () => ({
  CommonDialogProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("./providers/full-editor-provider", () => ({
  FullEditorProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function emptyResult(): DatabaseResultSet {
  return {
    headers: [],
    rows: [],
    stat: {
      rowsAffected: 0,
      rowsRead: 0,
      rowsWritten: null,
      queryDurationMs: 0,
    },
  };
}

const schemaPromise = { current: Promise.resolve() as Promise<unknown> };

jest.mock("@/components/gui/main-connection", () => ({
  __esModule: true,
  default: function SchemaLoader() {
    const { databaseDriver } = useStudioContext();
    useEffect(() => {
      schemaPromise.current = databaseDriver.schemas();
    }, [databaseDriver]);
    return null;
  },
}));

test("routes scoped MySQL schema discovery through one six-statement transaction", async () => {
  const query = jest.fn();
  const transaction = jest
    .fn<Promise<DatabaseResultSet[]>, [string[]]>()
    .mockResolvedValue(Array.from({ length: 6 }, emptyResult));
  const queryable: QueryableBaseDriver = { query, transaction };
  const driver = new MySQLLikeDriver(queryable, "tenant's data");

  render(<Studio driver={driver} name="Database" color="gray" />);
  await schemaPromise.current;
  await waitFor(() => expect(transaction).toHaveBeenCalledTimes(1));

  expect(query).not.toHaveBeenCalled();
  expect(transaction).toHaveBeenCalledWith([
    "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'tenant''s data'",
    "SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, DATA_LENGTH, INDEX_LENGTH FROM information_schema.tables WHERE TABLE_SCHEMA = 'tenant''s data'",
    "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, EXTRA, COLUMN_KEY, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.columns WHERE TABLE_SCHEMA = 'tenant''s data'",
    "SELECT TABLE_SCHEMA, TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.table_constraints WHERE TABLE_SCHEMA = 'tenant''s data' AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')",
    "SELECT CONSTRAINT_NAME, TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_SCHEMA, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = 'tenant''s data'",
    "SELECT * from information_schema.triggers WHERE TRIGGER_SCHEMA = 'tenant''s data'",
  ]);
});
