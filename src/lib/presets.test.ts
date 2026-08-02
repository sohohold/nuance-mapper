import { describe, expect, it } from "vitest";
import { ja } from "@/lib/dictionaries/ja/common";
import {
  DEFAULT_PRESET,
  findPreset,
  PRESETS,
  resolvePresets,
} from "@/lib/presets";

describe("PRESETS", () => {
  it("has six entries", () => {
    expect(PRESETS).toHaveLength(6);
  });

  it("uses unique ids", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defaults to the first entry", () => {
    expect(DEFAULT_PRESET).toBe(PRESETS[0]);
  });

  it("gives each preset a distinct axis pair", () => {
    const pairs = PRESETS.map((p) => `${p.xKey}|${p.yKey}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe("resolvePresets", () => {
  it("translates every entry against the given dictionary", () => {
    const resolved = resolvePresets(ja);
    expect(resolved).toHaveLength(PRESETS.length);
    expect(resolved[0]).toEqual({
      id: "creative",
      name: ja.presetCreative,
      x: ja.axisMetaphor,
      y: ja.axisSentiment,
    });
  });

  it("keeps ids stable across dictionaries", () => {
    expect(resolvePresets(ja).map((p) => p.id)).toEqual(
      PRESETS.map((p) => p.id),
    );
  });
});

describe("findPreset", () => {
  it("finds a preset by id", () => {
    expect(findPreset("business")?.xKey).toBe("axisLogic");
  });

  it("returns undefined for an unknown or null id", () => {
    expect(findPreset("nope")).toBeUndefined();
    expect(findPreset(null)).toBeUndefined();
  });
});
