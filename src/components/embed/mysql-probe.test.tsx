/** @jest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import MySQLProbe from "./mysql-probe";

const origin = "https://panel.example.com";
const channel = "viewer_0123456789abcdefghijk";
const data = {
  headers: [{ name: "1", displayName: "1", originalType: "INT", type: 2 }],
  rows: [{ "1": 1 }],
  stat: { rowsAffected: 0, rowsRead: 1, rowsWritten: null, queryDurationMs: 2 },
};

describe("MySQL embed probe", () => {
  let post: jest.SpyInstance;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN = origin;
    post = jest
      .spyOn(window.parent, "postMessage")
      .mockImplementation(() => {});
  });
  afterEach(() => {
    post.mockRestore();
    delete process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGIN;
    jest.useRealTimers();
  });
  async function receive(
    payload: object,
    source = window.parent,
    from = origin
  ) {
    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", { data: payload, origin: from, source })
      );
    });
  }

  it("sends no startup queries and sends SELECT 1 as query on Run", async () => {
    render(<MySQLProbe channel={channel} />);
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    expect(post).toHaveBeenCalledTimes(1);
    const request = post.mock.calls[0][0];
    expect(request).toEqual({
      type: "query",
      id: expect.any(Number),
      channel,
      document: expect.stringMatching(/^[a-f0-9]{32}$/),
      statement: "SELECT 1",
    });
    expect(post.mock.calls[0][1]).toBe(origin);
    await receive({ ...request, data });
    expect(screen.getByRole("columnheader").textContent).toBe("1");
    expect(screen.getByRole("cell").textContent).toBe("1");
    expect(screen.getByRole("status").textContent).toContain("Query succeeded");
  });

  it("keeps origin, source, channel and operation validation", async () => {
    render(<MySQLProbe channel={channel} />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    const request = post.mock.calls[0][0];
    await receive({ ...request, data }, window.parent, "https://evil.example");
    await receive({ ...request, data }, {} as Window);
    await receive({ ...request, channel: "wrong", data });
    await receive({ ...request, type: "transaction", data: [data] });
    expect(screen.queryByRole("table")).toBeNull();
    await receive({ ...request, data });
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("shows the controlled broker error and permits retry", async () => {
    render(<MySQLProbe channel={channel} />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    await receive({
      ...post.mock.calls[0][0],
      error: "Database query failed.",
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "Database query failed."
    );
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    expect(post).toHaveBeenCalledTimes(2);
    await receive({ ...post.mock.calls[1][0], data });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("times out, closes its listener and can retry without stale results", async () => {
    jest.useFakeTimers();
    render(<MySQLProbe channel={channel} />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    const old = post.mock.calls[0][0];
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(screen.getByRole("alert").textContent).toContain("timed out");
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    await receive({ ...old, data });
    expect(screen.queryByRole("table")).toBeNull();
    await receive({ ...post.mock.calls[1][0], data });
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("fails closed without a valid channel", async () => {
    render(<MySQLProbe channel={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("does not duplicate an in-flight query and drops replies after channel changes", async () => {
    const page = render(<MySQLProbe channel={channel} />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Running…" }));
    expect(post).toHaveBeenCalledTimes(1);
    const old = post.mock.calls[0][0];
    page.rerender(<MySQLProbe channel={channel + "_new"} />);
    fireEvent.click(screen.getByRole("button", { name: "Run SELECT 1" }));
    await receive({ ...old, data });
    expect(screen.queryByRole("table")).toBeNull();
    await receive({ ...post.mock.calls[1][0], data });
    expect(screen.getByRole("table")).toBeTruthy();
    page.unmount();
  });
});
