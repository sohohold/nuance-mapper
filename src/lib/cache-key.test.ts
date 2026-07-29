import { describe, expect, it } from "vitest";
import { buildCacheKey } from "@/lib/cache-key";

describe("buildCacheKey", () => {
  it("joins the three fields with a pipe", () => {
    expect(buildCacheKey("すごい", "X", "Y")).toBe("すごい|X|Y");
  });

  it("trims surrounding whitespace so padding shares one entry", () => {
    expect(buildCacheKey("  すごい ", " X", "Y  ")).toBe(
      buildCacheKey("すごい", "X", "Y"),
    );
  });

  it("NFKC-normalizes, so half-width and full-width variants collide", () => {
    expect(buildCacheKey("ｽｺﾞｲ", "X", "Y")).toBe(
      buildCacheKey("スゴイ", "X", "Y"),
    );
    expect(buildCacheKey("ａｂｃ", "X", "Y")).toBe(
      buildCacheKey("abc", "X", "Y"),
    );
  });

  it("preserves case, so Apple and apple are separate generations", () => {
    expect(buildCacheKey("Apple", "X", "Y")).not.toBe(
      buildCacheKey("apple", "X", "Y"),
    );
  });

  it("separates entries that differ only by axis", () => {
    expect(buildCacheKey("語", "A", "B")).not.toBe(
      buildCacheKey("語", "B", "A"),
    );
  });

  it("is deterministic", () => {
    expect(buildCacheKey("語", "A", "B")).toBe(buildCacheKey("語", "A", "B"));
  });
});
