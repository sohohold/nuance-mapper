import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NuanceMap } from "@/components/NuanceMap";
import { MAP_CONFIG } from "@/lib/config";
import { ja } from "@/lib/dictionaries/ja/common";
import { I18nProvider } from "@/lib/i18n";
import type { NuanceData } from "@/lib/types";

// framer-motion keeps an exiting element mounted until its animation
// finishes, which never happens on a fake clock. These tests assert *when*
// the tooltip should be gone; how it fades out is a Playwright concern.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MOTION_PROPS = new Set([
    "initial",
    "animate",
    "exit",
    "transition",
    "layout",
    "variants",
    "whileHover",
    "whileTap",
  ]);
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          React.forwardRef(
            (props: Record<string, unknown>, ref: React.Ref<HTMLElement>) => {
              const domProps = Object.fromEntries(
                Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)),
              );
              return React.createElement(tag, { ...domProps, ref });
            },
          ),
      },
    ),
  };
});

const DATA: NuanceData[] = [
  { word: "壮麗", x: 8, y: 7, nuance: "華やかで重厚" },
  { word: "淡泊", x: -6, y: -5, nuance: "あっさりしている" },
  { word: "率直", x: 4, y: -3, nuance: "遠回しでない" },
];

/** React Flow reveals nodes only after its ResizeObserver reports a size. */
async function renderMap(
  props: Partial<React.ComponentProps<typeof NuanceMap>> = {},
) {
  const user = userEvent.setup({
    advanceTimers: vi.advanceTimersByTime,
    delay: null,
  });
  render(
    <I18nProvider>
      <NuanceMap
        data={DATA}
        xAxisLabel="フォーマル度"
        yAxisLabel="情緒的"
        {...props}
      />
    </I18nProvider>,
  );
  // Let the measurement microtask land so nodes stop being visibility:hidden
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return { user };
}

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

/** The clickable dot for a word — the only tooltip trigger. */
const dot = (word: string) => screen.getByRole("button", { name: word });

const tooltip = () => screen.getByTestId("word-tooltip");
const queryTooltip = () => screen.queryByTestId("word-tooltip");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
});

afterEach(() => {
  vi.useRealTimers();
});

// ── E. Axis labels ───────────────────────────────────────────────────

describe("NuanceMap — axis labels (E-05)", () => {
  it("shows the given labels with their direction markers", async () => {
    await renderMap();
    expect(screen.getByText(/↑ 情緒的 \(\+Y\)/)).toBeInTheDocument();
    expect(screen.getByText(/→ フォーマル度 \(\+X\)/)).toBeInTheDocument();
  });

  it("reflects a changed label", async () => {
    await renderMap({ xAxisLabel: "抽象度", yAxisLabel: "緊張感" });
    expect(screen.getByText(/↑ 緊張感 \(\+Y\)/)).toBeInTheDocument();
    expect(screen.getByText(/→ 抽象度 \(\+X\)/)).toBeInTheDocument();
  });

  it("truncates rather than wrapping a long label", async () => {
    await renderMap({ xAxisLabel: "あ".repeat(24) });
    const label = screen.getByText(new RegExp(`→ ${"あ".repeat(24)}`));
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("whitespace-nowrap");
  });
});

// ── F. Empty, loading and grouping ───────────────────────────────────

describe("NuanceMap — states (F-04, F-05, F-08)", () => {
  it("shows the empty state with no data", async () => {
    await renderMap({ data: [] });
    expect(screen.getByText(ja.emptyState)).toBeInTheDocument();
  });

  it("shows the loading state while generating", async () => {
    await renderMap({ data: [], isLoading: true });
    expect(screen.getByText(ja.generating)).toBeInTheDocument();
    expect(screen.queryByText(ja.emptyState)).not.toBeInTheDocument();
  });

  it("renders one node per word", async () => {
    await renderMap();
    for (const item of DATA) {
      expect(dot(item.word)).toBeInTheDocument();
    }
  });

  it("groups words that share a coordinate and counts the rest", async () => {
    await renderMap({
      data: [
        { word: "静穏", x: 1, y: 1, nuance: "a" },
        { word: "平穏", x: 1, y: 1, nuance: "b" },
        { word: "安寧", x: 1, y: 1, nuance: "c" },
      ],
    });
    expect(screen.getByTestId("group-count")).toHaveTextContent("+2");
    // Only the first word of the group labels the node
    expect(
      screen.queryByRole("button", { name: "平穏" }),
    ).not.toBeInTheDocument();
  });

  it("groups coordinates that agree to three decimals", async () => {
    await renderMap({
      data: [
        { word: "甲", x: 1.00001, y: 2, nuance: "a" },
        { word: "乙", x: 1.00002, y: 2, nuance: "b" },
      ],
    });
    expect(screen.getByTestId("group-count")).toHaveTextContent("+1");
  });

  it("keeps coordinates apart when they differ above the rounding factor", async () => {
    await renderMap({
      data: [
        { word: "甲", x: 1.001, y: 2, nuance: "a" },
        { word: "乙", x: 1.002, y: 2, nuance: "b" },
      ],
    });
    expect(screen.queryByTestId("group-count")).not.toBeInTheDocument();
    expect(dot("甲")).toBeInTheDocument();
    expect(dot("乙")).toBeInTheDocument();
  });
});

// ── H. Tooltip ───────────────────────────────────────────────────────

describe("NuanceMap — tooltip (H-01..H-10, H-13)", () => {
  it("is absent until a coordinate is selected", async () => {
    await renderMap();
    expect(queryTooltip()).not.toBeInTheDocument();
  });

  it("opens on hover", async () => {
    const { user } = await renderMap();
    await user.hover(dot("壮麗"));
    expect(tooltip()).toBeInTheDocument();
  });

  // fireEvent rather than user-event: a synthetic mousedown reaches the
  // d3-zoom pan handler bundled inside React Flow, which dereferences
  // `event.view` — null on events user-event builds. The assertion here is
  // about the component's own click handler, which fireEvent drives
  // directly; pan behaviour is covered by the E2E suite.
  it("opens on click, so touch works too", async () => {
    await renderMap();
    fireEvent.click(dot("率直"));
    expect(tooltip()).toBeInTheDocument();
  });

  it("opens on keyboard focus", async () => {
    await renderMap();
    await act(async () => {
      dot("淡泊").focus();
    });
    expect(tooltip()).toBeInTheDocument();
  });

  it("shows the word, its nuance and both coordinates", async () => {
    const { user } = await renderMap();
    await user.hover(dot("壮麗"));

    const panel = tooltip();
    expect(within(panel).getByText("壮麗")).toBeInTheDocument();
    expect(within(panel).getByText("華やかで重厚")).toBeInTheDocument();
    expect(within(panel).getByText("X: 8.0")).toBeInTheDocument();
    expect(within(panel).getByText("Y: 7.0")).toBeInTheDocument();
  });

  it("lists every word sharing the coordinate", async () => {
    const { user } = await renderMap({
      data: [
        { word: "静穏", x: 1, y: 1, nuance: "a" },
        { word: "平穏", x: 1, y: 1, nuance: "b" },
      ],
    });
    await user.hover(dot("静穏"));

    const panel = tooltip();
    expect(within(panel).getByText("静穏")).toBeInTheDocument();
    expect(within(panel).getByText("平穏")).toBeInTheDocument();
  });

  // fireEvent rather than user-event for the two timing assertions: it is
  // synchronous, so no real milliseconds slip past while the fake clock is
  // being positioned either side of the threshold.
  it("stays open for the grace period after the pointer leaves", async () => {
    await renderMap();
    fireEvent.mouseEnter(dot("壮麗"));
    fireEvent.mouseLeave(dot("壮麗"));

    await advance(MAP_CONFIG.tooltip.hideDelayMs - 50);
    expect(queryTooltip()).toBeInTheDocument();
  });

  it("closes once the grace period elapses", async () => {
    await renderMap();
    fireEvent.mouseEnter(dot("壮麗"));
    fireEvent.mouseLeave(dot("壮麗"));

    await advance(MAP_CONFIG.tooltip.hideDelayMs);
    expect(queryTooltip()).not.toBeInTheDocument();
  });

  it("survives the pointer travelling onto it", async () => {
    const { user } = await renderMap();
    await user.hover(dot("壮麗"));
    await user.unhover(dot("壮麗"));
    await user.hover(tooltip());

    await advance(MAP_CONFIG.tooltip.hideDelayMs * 3);
    expect(queryTooltip()).toBeInTheDocument();
  });

  it("copies the word and confirms it", async () => {
    // user-event installs its own navigator.clipboard, so the assertion
    // reads back what the component actually wrote
    const { user } = await renderMap();
    await user.hover(dot("壮麗"));
    await user.hover(tooltip());
    await user.click(
      within(tooltip()).getByRole("button", { name: `${ja.copy}: 壮麗` }),
    );

    await expect(navigator.clipboard.readText()).resolves.toBe("壮麗");
    await waitFor(() =>
      expect(within(tooltip()).getByTitle(ja.copied)).toBeInTheDocument(),
    );
  });

  it("reverts the confirmation after the indicator delay", async () => {
    const { user } = await renderMap();
    await user.hover(dot("壮麗"));
    await user.hover(tooltip());
    await user.click(
      within(tooltip()).getByRole("button", { name: `${ja.copy}: 壮麗` }),
    );
    await waitFor(() =>
      expect(within(tooltip()).getByTitle(ja.copied)).toBeInTheDocument(),
    );

    await advance(MAP_CONFIG.tooltip.copiedIndicatorMs);
    await waitFor(() =>
      expect(within(tooltip()).getByTitle(ja.copy)).toBeInTheDocument(),
    );
  });

  it("colours the marker by quadrant", async () => {
    const { user } = await renderMap({
      data: [
        { word: "右上", x: 1, y: 1, nuance: "" },
        { word: "右下", x: 1, y: -1, nuance: "" },
        { word: "左上", x: -1, y: 1, nuance: "" },
        { word: "左下", x: -1, y: -1, nuance: "" },
      ],
    });
    const expected = {
      右上: "bg-pink-400",
      右下: "bg-violet-400",
      左上: "bg-emerald-400",
      左下: "bg-blue-400",
    };
    for (const [word, cls] of Object.entries(expected)) {
      await user.hover(dot(word));
      expect(tooltip().querySelector(`.${cls}`)).not.toBeNull();
    }
  });
});
