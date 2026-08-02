import { describe, expect, it } from "vitest";
import {
  countChars,
  INPUT_LIMITS,
  validateAxisLabel,
  validateWord,
} from "@/lib/validation";

const MAX = 24;

describe("INPUT_LIMITS", () => {
  it("uses the same 24-character limit for the word and for axis labels", () => {
    expect(INPUT_LIMITS.word).toBe(MAX);
    expect(INPUT_LIMITS.axisLabel).toBe(MAX);
  });
});

describe("countChars", () => {
  it("counts ASCII and Japanese one per character", () => {
    expect(countChars("abc")).toBe(3);
    expect(countChars("すごい")).toBe(3);
  });

  it("counts a surrogate pair as one character, unlike String#length", () => {
    expect("👍".length).toBe(2);
    expect(countChars("👍")).toBe(1);
  });

  it("counts an empty string as zero", () => {
    expect(countChars("")).toBe(0);
  });

  it("counts ZWJ sequences per code point (documented limitation)", () => {
    // "👨‍👩‍👧" is one glyph but five code points. See docs/test-spec.md D-01.
    expect(countChars("👨‍👩‍👧")).toBe(5);
  });
});

describe("validateWord", () => {
  it("accepts a normal word", () => {
    expect(validateWord("すごい")).toEqual({ ok: true, length: 3, max: MAX });
  });

  it("accepts exactly 24 characters", () => {
    const result = validateWord("あ".repeat(24));
    expect(result.ok).toBe(true);
    expect(result.length).toBe(24);
  });

  it("rejects 25 characters as too_long", () => {
    const result = validateWord("あ".repeat(25));
    expect(result).toEqual({
      ok: false,
      code: "too_long",
      length: 25,
      max: MAX,
    });
  });

  it("measures 24 emoji as 24, not 48", () => {
    expect(validateWord("👍".repeat(24)).ok).toBe(true);
    expect(validateWord("👍".repeat(25)).code).toBe("too_long");
  });

  it("rejects an empty string", () => {
    expect(validateWord("").code).toBe("empty");
  });

  it("rejects whitespace-only input, including full-width spaces", () => {
    expect(validateWord("   ").code).toBe("empty");
    expect(validateWord("　　").code).toBe("empty");
    expect(validateWord("\n\t").code).toBe("empty");
  });

  it("measures the trimmed value, so padding never pushes it over", () => {
    const result = validateWord(`  ${"あ".repeat(24)}  `);
    expect(result.ok).toBe(true);
    expect(result.length).toBe(24);
  });

  it("rejects non-strings as invalid_type", () => {
    for (const value of [undefined, null, 42, {}, [], true]) {
      expect(validateWord(value).code).toBe("invalid_type");
    }
  });

  it("reports the limit so callers can render one message", () => {
    expect(validateWord("あ".repeat(30)).max).toBe(MAX);
  });
});

describe("validateAxisLabel", () => {
  it("applies exactly the same rule as validateWord", () => {
    expect(validateAxisLabel("フォーマル度").ok).toBe(true);
    expect(validateAxisLabel("あ".repeat(24)).ok).toBe(true);
    expect(validateAxisLabel("あ".repeat(25)).code).toBe("too_long");
    expect(validateAxisLabel("").code).toBe("empty");
    expect(validateAxisLabel(undefined).code).toBe("invalid_type");
  });
});
