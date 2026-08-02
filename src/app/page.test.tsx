import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { ja } from "@/lib/dictionaries/ja/common";
import type { NuanceData } from "@/lib/types";

// The map itself is covered by NuanceMap.test.tsx. Here it is a probe for
// what the page hands down, so these tests stay about request handling.
vi.mock("@/components/NuanceMap", async () => {
  const React = await import("react");
  return {
    NuanceMap: ({
      data,
      xAxisLabel,
      yAxisLabel,
      isLoading,
    }: {
      data: NuanceData[];
      xAxisLabel: string;
      yAxisLabel: string;
      isLoading?: boolean;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "map",
          "data-x": xAxisLabel,
          "data-y": yAxisLabel,
          "data-loading": String(Boolean(isLoading)),
        },
        data.map((d) => React.createElement("span", { key: d.word }, d.word)),
      ),
  };
});

const ITEMS: NuanceData[] = [
  { word: "壮麗", x: 8, y: 7, nuance: "a" },
  { word: "淡泊", x: -6, y: -5, nuance: "b" },
  { word: "率直", x: 4, y: -3, nuance: "c" },
];

/** An SSE response that yields one `data:` frame per pull. */
function sseResponse(lines: string[]) {
  let index = 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async pull(controller) {
      if (index >= lines.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`data: ${lines[index++]}\n\n`));
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function sseLines(
  items: NuanceData[],
  meta?: Record<string, unknown>,
): string[] {
  return [
    ...(meta ? [JSON.stringify({ __meta: true, ...meta })] : []),
    ...items.map((i) => JSON.stringify(i)),
    "[DONE]",
  ];
}

let fetchMock: ReturnType<typeof vi.fn>;

function lastPostBody(): Record<string, unknown> {
  const posts = fetchMock.mock.calls.filter(
    (call) => (call[1] as RequestInit | undefined)?.method === "POST",
  );
  const last = posts.at(-1);
  if (!last) throw new Error("no POST to /api/generate was made");
  return JSON.parse(String((last[1] as RequestInit).body));
}

async function search(user: ReturnType<typeof userEvent.setup>, word: string) {
  await user.type(
    screen.getByRole("textbox", { name: ja.inputPlaceholder }),
    word,
  );
  await user.click(screen.getByRole("button", { name: "" }));
}

beforeEach(() => {
  vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock = vi.fn(async () => sseResponse(sseLines(ITEMS)));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home — request lifecycle (C-09..C-12)", () => {
  it("renders the streamed items", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("map")).toHaveTextContent("壮麗淡泊率直"),
    );
  });

  it("sends the word and both axis labels", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastPostBody()).toMatchObject({
      word: "すごい",
      xAxis: ja.axisMetaphor,
      yAxis: ja.axisSentiment,
      skipCache: false,
    });
  });

  it("passes the requested axis labels to the map", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("map")).toHaveAttribute(
        "data-x",
        ja.axisMetaphor,
      ),
    );
    expect(screen.getByTestId("map")).toHaveAttribute(
      "data-y",
      ja.axisSentiment,
    );
  });

  it("ignores an unparseable SSE payload without losing the rest", async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        JSON.stringify(ITEMS[0]),
        "{ this is not json",
        JSON.stringify(ITEMS[1]),
        "[DONE]",
      ]),
    );
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("map")).toHaveTextContent("壮麗淡泊"),
    );
  });

  it("shows the rate-limit message on 429", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("request-error")).toHaveTextContent(
        ja.errorRateLimit,
      ),
    );
  });

  it("shows the generic message on 500", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("request-error")).toHaveTextContent(
        ja.errorGeneric,
      ),
    );
  });

  it("shows the generic message when the network fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("request-error")).toHaveTextContent(
        ja.errorGeneric,
      ),
    );
  });

  it("clears a previous error when a new search starts", async () => {
    // Fail only the generation call — the mount-time HEAD preflight would
    // otherwise swallow a one-shot rejection
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new Error("offline");
      return sseResponse(sseLines(ITEMS));
    });
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");
    await waitFor(() =>
      expect(screen.getByTestId("request-error")).toBeInTheDocument(),
    );

    fetchMock.mockResolvedValue(sseResponse(sseLines(ITEMS)));
    await user.click(screen.getByRole("button", { name: "" }));

    await waitFor(() =>
      expect(screen.queryByTestId("request-error")).not.toBeInTheDocument(),
    );
  });

  it("uses no alert dialog", async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    fetchMock.mockRejectedValue(new Error("offline"));
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("request-error")).toBeInTheDocument(),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("Home — result provenance (K-04..K-06)", () => {
  it("marks a cached result and offers a regeneration", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(sseLines(ITEMS, { fromCache: true })),
    );
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByText(ja.cachedResult)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: ja.regenerate }),
    ).toBeInTheDocument();
  });

  it("marks a degraded result", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(sseLines(ITEMS, { degraded: true })),
    );
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByText(ja.degradedResult)).toBeInTheDocument(),
    );
  });

  it("shows no badge for a fresh result", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(screen.getByTestId("map")).toHaveTextContent("壮麗"),
    );
    expect(screen.queryByText(ja.cachedResult)).not.toBeInTheDocument();
    expect(screen.queryByText(ja.degradedResult)).not.toBeInTheDocument();
  });

  it("regenerates the same query with skipCache", async () => {
    fetchMock.mockResolvedValue(
      sseResponse(sseLines(ITEMS, { fromCache: true })),
    );
    const user = userEvent.setup();
    render(<Home />);
    await search(user, "すごい");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: ja.regenerate }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: ja.regenerate }));

    await waitFor(() =>
      expect(lastPostBody()).toMatchObject({ word: "すごい", skipCache: true }),
    );
  });
});

describe("Home — preflight", () => {
  it("warms the connection with a HEAD request on mount", async () => {
    render(<Home />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/generate", { method: "HEAD" });
  });
});
