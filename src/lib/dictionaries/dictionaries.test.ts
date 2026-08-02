import { describe, expect, it } from "vitest";
import { en } from "@/lib/dictionaries/en/common";
import { ja } from "@/lib/dictionaries/ja/common";
import { PRESETS } from "@/lib/presets";

describe("dictionaries", () => {
  it("define exactly the same keys", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it("have no empty values", () => {
    for (const [locale, dict] of Object.entries({ ja, en })) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("cover every key a preset refers to", () => {
    for (const preset of PRESETS) {
      for (const key of [preset.nameKey, preset.xKey, preset.yKey]) {
        expect(ja[key], `ja.${key}`).toBeTruthy();
        expect(en[key], `en.${key}`).toBeTruthy();
      }
    }
  });

  it("keep the same placeholders in both locales", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(ja) as (keyof typeof ja)[]) {
      expect(placeholders(en[key]), key).toEqual(placeholders(ja[key]));
    }
  });
});
