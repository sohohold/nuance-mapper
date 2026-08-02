import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InputArea } from "@/components/InputArea";
import { INPUT_UI_CONFIG } from "@/lib/config";
import { ja } from "@/lib/dictionaries/ja/common";
import { I18nProvider } from "@/lib/i18n";
import { PRESETS } from "@/lib/presets";

const DELAY = INPUT_UI_CONFIG.slowWarningDelayMs;

function setup(props: Partial<React.ComponentProps<typeof InputArea>> = {}) {
  const onSearch = vi.fn();
  const user = userEvent.setup({
    advanceTimers: vi.advanceTimersByTime,
    // The fake clock must not stall user-event's internal delays
    delay: null,
  });
  const view = render(
    <I18nProvider>
      <InputArea onSearch={onSearch} isLoading={false} {...props} />
    </I18nProvider>,
  );
  const rerender = (next: Partial<React.ComponentProps<typeof InputArea>>) =>
    view.rerender(
      <I18nProvider>
        <InputArea onSearch={onSearch} isLoading={false} {...props} {...next} />
      </I18nProvider>,
    );
  return { onSearch, user, rerender };
}

const wordInput = () =>
  screen.getByRole("textbox", { name: ja.inputPlaceholder });
const submitButton = () => screen.getByRole("button", { name: "" });
const openAxisSettings = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string = ja.customizeAxis,
) => {
  await user.click(screen.getByRole("button", { name }));
};

/** Advance the fake clock and let React flush the resulting render. */
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // navigator.language drives the initial locale
  vi.spyOn(navigator, "language", "get").mockReturnValue("ja-JP");
});

afterEach(() => {
  vi.useRealTimers();
});

// ── A. Input validation ──────────────────────────────────────────────

describe("InputArea — word length (A-01..A-04, A-13)", () => {
  it("accepts exactly 24 characters", async () => {
    const { user, onSearch } = setup();
    await user.type(wordInput(), "あ".repeat(24));

    expect(submitButton()).toBeEnabled();
    expect(screen.getByTestId("word-error")).toHaveTextContent("");

    await user.click(submitButton());
    expect(onSearch).toHaveBeenCalledWith(
      "あ".repeat(24),
      expect.any(String),
      expect.any(String),
    );
  });

  it("blocks submission at 25 characters and explains why", async () => {
    const { user, onSearch } = setup();
    await user.type(wordInput(), "あ".repeat(25));

    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId("word-error")).toHaveTextContent(
      "文字数が上限を超えています（25/24）",
    );

    await user.click(submitButton());
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("reports the actual count in the warning", async () => {
    const { user } = setup();
    await user.type(wordInput(), "あ".repeat(30));
    expect(screen.getByTestId("word-error")).toHaveTextContent("（30/24）");
  });

  it("counts emoji as one character each", async () => {
    const { user } = setup();
    await user.type(wordInput(), "👍".repeat(24));
    expect(submitButton()).toBeEnabled();

    await user.type(wordInput(), "👍");
    expect(submitButton()).toBeDisabled();
  });

  it("clears the warning once the value is back within the limit", async () => {
    const { user } = setup();
    await user.type(wordInput(), "あ".repeat(25));
    expect(screen.getByTestId("word-error")).not.toHaveTextContent("");

    await user.type(wordInput(), "{backspace}");
    expect(screen.getByTestId("word-error")).toHaveTextContent("");
    expect(submitButton()).toBeEnabled();
  });

  it("keeps submission blocked while empty", () => {
    setup();
    expect(submitButton()).toBeDisabled();
  });

  it("keeps submission blocked for whitespace only", async () => {
    const { user } = setup();
    await user.type(wordInput(), "   ");
    expect(submitButton()).toBeDisabled();
  });

  it("trims the word before searching", async () => {
    const { user, onSearch } = setup();
    await user.type(wordInput(), "  すごい  ");
    await user.click(submitButton());
    expect(onSearch).toHaveBeenCalledWith(
      "すごい",
      expect.any(String),
      expect.any(String),
    );
  });
});

describe("InputArea — character counter (A-14)", () => {
  it("stays hidden below 20 characters", async () => {
    const { user } = setup();
    await user.type(wordInput(), "あ".repeat(19));
    expect(screen.queryByTestId("char-counter")).not.toBeInTheDocument();
  });

  it("appears at 20 characters", async () => {
    const { user } = setup();
    await user.type(wordInput(), "あ".repeat(20));
    expect(screen.getByTestId("char-counter")).toHaveTextContent("20/24");
  });

  it("keeps counting past the limit", async () => {
    const { user } = setup();
    await user.type(wordInput(), "あ".repeat(26));
    expect(screen.getByTestId("char-counter")).toHaveTextContent("26/24");
  });
});

describe("InputArea — submission (A-15, A-16)", () => {
  it("submits on Enter", async () => {
    const { user, onSearch } = setup();
    await user.type(wordInput(), "すごい{enter}");
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Enter when the value is invalid", async () => {
    const { user, onSearch } = setup();
    await user.type(wordInput(), `${"あ".repeat(25)}{enter}`);
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("disables the field and the button while loading", () => {
    setup({ isLoading: true });
    expect(wordInput()).toBeDisabled();
    expect(submitButton()).toBeDisabled();
  });
});

// ── C. Slow-request warning ──────────────────────────────────────────

describe("InputArea — slow request warning (C-01..C-08)", () => {
  // These tests only move the clock, never the pointer, so the fake timer
  // does not need to track real time — and the threshold assertions stay
  // exact instead of drifting by however long a render took.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("is absent before the request starts", () => {
    setup();
    expect(screen.queryByTestId("slow-warning")).not.toBeInTheDocument();
  });

  it("is still absent one millisecond before the threshold", async () => {
    setup({ isLoading: true });
    await advance(DELAY - 1);
    expect(screen.queryByTestId("slow-warning")).not.toBeInTheDocument();
  });

  it("appears once the threshold is reached", async () => {
    setup({ isLoading: true });
    await advance(DELAY);
    expect(screen.getByTestId("slow-warning")).toBeInTheDocument();
  });

  it("shows the agreed wording", async () => {
    setup({ isLoading: true });
    await advance(DELAY);
    expect(screen.getByTestId("slow-warning")).toHaveTextContent(
      "10秒以上かかることがあります",
    );
  });

  it("never appears when the request finishes first", async () => {
    const { rerender } = setup({ isLoading: true });
    await advance(3000);
    rerender({ isLoading: false });
    await advance(DELAY * 2);
    expect(screen.queryByTestId("slow-warning")).not.toBeInTheDocument();
  });

  it("disappears when the request completes", async () => {
    const { rerender } = setup({ isLoading: true });
    await advance(DELAY);
    expect(screen.getByTestId("slow-warning")).toBeInTheDocument();

    rerender({ isLoading: false });
    expect(screen.queryByTestId("slow-warning")).not.toBeInTheDocument();
  });

  it("restarts the timer for a second request", async () => {
    const { rerender } = setup({ isLoading: true });
    await advance(DELAY);
    rerender({ isLoading: false });
    rerender({ isLoading: true });

    await advance(DELAY - 1);
    expect(screen.queryByTestId("slow-warning")).not.toBeInTheDocument();

    await advance(1);
    expect(screen.getByTestId("slow-warning")).toBeInTheDocument();
  });

  it("is anchored above the submit button, not inside the clipping row", async () => {
    setup({ isLoading: true });
    await advance(DELAY);
    const warning = screen.getByTestId("slow-warning");

    // bottom-full places it above its offset parent; the parent must be
    // the form, because the input row clips overflow
    expect(warning.className).toContain("bottom-full");
    expect(warning.parentElement?.tagName).toBe("FORM");
    expect(warning.parentElement?.className).not.toContain("overflow-hidden");

    // and it is right-aligned, i.e. over the submit button
    expect(warning.className).toMatch(/right-1\.5/);
  });
});

// ── I. Axis customization ────────────────────────────────────────────

describe("InputArea — axis panel (I-01, I-13)", () => {
  it("toggles open and closed", async () => {
    const { user } = setup();
    expect(screen.queryByLabelText(ja.xAxisLabel)).not.toBeInTheDocument();

    await openAxisSettings(user);
    expect(screen.getByLabelText(ja.xAxisLabel)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: ja.closeAxisSettings }),
    );
    expect(screen.queryByLabelText(ja.xAxisLabel)).not.toBeInTheDocument();
  });

  it("keeps edited values when reopened", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.xAxisLabel));
    await user.type(screen.getByLabelText(ja.xAxisLabel), "難易度");

    await user.click(
      screen.getByRole("button", { name: ja.closeAxisSettings }),
    );
    await openAxisSettings(user);
    expect(screen.getByLabelText(ja.xAxisLabel)).toHaveValue("難易度");
  });
});

describe("InputArea — presets (I-02..I-06, I-12, I-14)", () => {
  it("renders every preset", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    const list = screen.getByTestId("preset-list");
    expect(within(list).getAllByRole("button")).toHaveLength(PRESETS.length);
  });

  it("starts on the first preset", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    expect(
      screen.getByRole("button", { name: ja.presetCreative }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(ja.xAxisLabel)).toHaveValue(ja.axisMetaphor);
    expect(screen.getByLabelText(ja.yAxisLabel)).toHaveValue(ja.axisSentiment);
  });

  it("updates both axes when a preset is chosen", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.click(screen.getByRole("button", { name: ja.presetBusiness }));

    expect(screen.getByLabelText(ja.xAxisLabel)).toHaveValue(ja.axisLogic);
    expect(screen.getByLabelText(ja.yAxisLabel)).toHaveValue(ja.axisEnthusiasm);
  });

  it("moves the highlight to the chosen preset", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.click(screen.getByRole("button", { name: ja.presetIdeas }));

    expect(
      screen.getByRole("button", { name: ja.presetIdeas }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: ja.presetCreative }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("drops the highlight once a label is edited by hand", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.type(screen.getByLabelText(ja.xAxisLabel), "！");

    for (const preset of PRESETS) {
      expect(
        screen.getByRole("button", { name: ja[preset.nameKey] }),
      ).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("lets a preset overwrite hand-edited labels", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.xAxisLabel));
    await user.type(screen.getByLabelText(ja.xAxisLabel), "自作の軸");

    await user.click(screen.getByRole("button", { name: ja.presetStyle }));
    expect(screen.getByLabelText(ja.xAxisLabel)).toHaveValue(ja.axisFormality);
  });

  it("keeps preset chips on one line", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    const list = screen.getByTestId("preset-list");
    expect(list.className).toContain("overflow-x-auto");
    for (const chip of within(list).getAllByRole("button")) {
      expect(chip.className).toContain("whitespace-nowrap");
    }
  });
});

describe("InputArea — axis labels (I-07..I-11)", () => {
  it("accepts an edit", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.yAxisLabel));
    await user.type(screen.getByLabelText(ja.yAxisLabel), "緊張感");
    expect(screen.getByLabelText(ja.yAxisLabel)).toHaveValue("緊張感");
  });

  it("passes the edited labels to onSearch", async () => {
    const { user, onSearch } = setup();
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.xAxisLabel));
    await user.type(screen.getByLabelText(ja.xAxisLabel), "抽象度");
    await user.clear(screen.getByLabelText(ja.yAxisLabel));
    await user.type(screen.getByLabelText(ja.yAxisLabel), "緊張感");

    await user.type(wordInput(), "すごい");
    await user.click(submitButton());

    expect(onSearch).toHaveBeenCalledWith("すごい", "抽象度", "緊張感");
  });

  it("blocks submission when an axis label is emptied", async () => {
    const { user } = setup();
    await user.type(wordInput(), "すごい");
    expect(submitButton()).toBeEnabled();

    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.xAxisLabel));

    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId("x-axis-error")).toHaveTextContent(
      ja.axisLabelRequired,
    );
  });

  it("blocks submission when an axis label exceeds 24 characters", async () => {
    const { user } = setup();
    await user.type(wordInput(), "すごい");
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.yAxisLabel));
    await user.type(screen.getByLabelText(ja.yAxisLabel), "あ".repeat(25));

    expect(submitButton()).toBeDisabled();
    expect(screen.getByTestId("y-axis-error")).toHaveTextContent(
      "文字数が上限を超えています（25/24）",
    );
  });

  it("applies the same limit to both axes", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.xAxisLabel));
    await user.type(screen.getByLabelText(ja.xAxisLabel), "あ".repeat(24));
    expect(screen.getByTestId("x-axis-error")).toHaveTextContent("");
  });
});

// ── K. i18n ──────────────────────────────────────────────────────────

describe("InputArea — language switch (K-02, K-03)", () => {
  it("keeps the preset highlighted and follows its labels", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    const { user } = setup();
    await openAxisSettings(user, "Customize axes");

    // English dictionary is active
    expect(screen.getByLabelText("X-axis label (horizontal)")).toHaveValue(
      "Metaphor level",
    );
    expect(screen.getByRole("button", { name: "Creative" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not overwrite hand-edited labels", async () => {
    const { user } = setup();
    await openAxisSettings(user);
    await user.clear(screen.getByLabelText(ja.xAxisLabel));
    await user.type(screen.getByLabelText(ja.xAxisLabel), "自作");

    await waitFor(() => {
      expect(screen.getByLabelText(ja.xAxisLabel)).toHaveValue("自作");
    });
  });
});
