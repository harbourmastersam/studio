"use client";

import { Button } from "@/components/ui/button";
import type { DatabaseResultSet } from "@/drivers/base-driver";
import { EmbedQueryable } from "@/drivers/iframe-driver";
import { useEffect, useRef, useState } from "react";

/** A transport probe: deliberately never constructs the schema-loading Studio driver. */
export default function MySQLProbe({ channel }: { channel: string | null }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DatabaseResultSet>();
  const [error, setError] = useState<string>();
  const active = useRef<(() => void) | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    setRunning(false);
    setResult(undefined);
    setError(undefined);
    return () => {
      // Invalidate the latest run, including one started after this effect mounted.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      active.current?.();
      active.current = null;
    };
  }, [channel]);

  async function run() {
    if (active.current) return;
    const attempt = ++generation.current;
    setRunning(true);
    setResult(undefined);
    setError(undefined);
    let cleanup: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const connection = new EmbedQueryable(channel);
      cleanup = connection.listen() || undefined;
      active.current = () => {
        clearTimeout(timer);
        cleanup?.();
      };
      const response = await Promise.race([
        connection.query("SELECT 1"),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Query timed out. Check the Pelican viewer connection and retry."
                )
              ),
            10000
          );
        }),
      ]);
      if (generation.current === attempt) setResult(response);
    } catch (failure) {
      if (generation.current === attempt) {
        setError(
          failure instanceof Error ? failure.message : "Database query failed."
        );
      }
    } finally {
      clearTimeout(timer);
      cleanup?.();
      if (generation.current === attempt) {
        active.current = null;
        setRunning(false);
      }
    }
  }

  return (
    <main className="bg-background text-foreground min-h-screen p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header>
          <h1 className="text-xl font-semibold">Database connection test</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Run SELECT 1 through Pelican. This test needs no tables and does not
            change your database.
          </p>
        </header>
        <div className="bg-muted/30 rounded-lg border p-4">
          <pre aria-label="Test query" className="font-mono text-sm">
            SELECT 1
          </pre>
        </div>
        <div>
          <Button onClick={() => void run()} disabled={running}>
            {running ? "Running…" : "Run SELECT 1"}
          </Button>
        </div>
        <p role="status" className="text-muted-foreground text-sm">
          {running
            ? "Waiting for Pelican…"
            : result
              ? `Query succeeded · ${result.stat.queryDurationMs ?? 0} ms`
              : "Ready to test. Schema discovery is disabled in probe mode."}
        </p>
        {error && (
          <p
            role="alert"
            className="border-destructive rounded-lg border p-4 text-sm"
          >
            {error}
          </p>
        )}
        {result && (
          <table
            aria-label="Query result"
            className="w-full border-collapse text-left text-sm"
          >
            <thead>
              <tr>
                {result.headers.map((header, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="bg-muted border px-4 py-2"
                  >
                    {header.displayName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {result.headers.map((header, columnIndex) => (
                    <td key={columnIndex} className="border px-4 py-2">
                      {String(row[header.name] ?? "NULL")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
