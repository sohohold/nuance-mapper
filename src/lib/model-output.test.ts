import { describe, expect, it } from "vitest";
import { GENERATION_CONFIG } from "@/lib/config";
import {
  type NuanceItem,
  normalizeItems,
  parseJson,
  parseModelContent,
  qualityIssue,
  sanitizeItems,
  stripCodeFences,
} from "@/lib/model-output";

const AXIS_MAX = GENERATION_CONFIG.prompt.axisMax;

function item(over: Partial<NuanceItem> = {}): NuanceItem {
  return { word: "語", x: 1, y: 1, nuance: "説明", ...over };
}

/** `count` items spread over all four quadrants. */
function spread(count: number): NuanceItem[] {
  const corners = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  return Array.from({ length: count }, (_, i) => {
    const [sx, sy] = corners[i % 4];
    return item({ word: `語${i}`, x: sx * (1 + i), y: sy * (1 + i) });
  });
}

describe("stripCodeFences", () => {
  it("strips a ```json fence", () => {
    expect(stripCodeFences('```json\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("strips a bare ``` fence", () => {
    expect(stripCodeFences('```\n[{"a":1}]\n```')).toBe('[{"a":1}]');
  });

  it("leaves unfenced content alone", () => {
    expect(stripCodeFences(' [{"a":1}] ')).toBe('[{"a":1}]');
  });

  it("does not strip a fence that only appears mid-string", () => {
    expect(stripCodeFences('[{"a":"```"}]')).toBe('[{"a":"```"}]');
  });
});

describe("parseJson", () => {
  it("parses valid JSON", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("repairs trailing commas and unquoted keys", () => {
    expect(parseJson("{a: 1, b: 2,}")).toEqual({ a: 1, b: 2 });
  });

  // jsonrepair is lenient enough to quote bare prose into a JSON string,
  // so parseJson alone is not a rejection gate — normalizeItems is.
  it("quotes bare prose rather than throwing", () => {
    expect(parseJson("いいえ、できません")).toBe("いいえ、できません");
    expect(() => normalizeItems(parseJson("いいえ、できません"))).toThrow();
  });
});

describe("normalizeItems", () => {
  it("returns an array unchanged", () => {
    expect(normalizeItems([1, 2])).toEqual([1, 2]);
  });

  it.each(["results", "words", "synonyms"])("unwraps the %s key", (key) => {
    expect(normalizeItems({ [key]: [1] })).toEqual([1]);
  });

  it("falls back to the first array-valued property", () => {
    expect(normalizeItems({ meta: 1, data: ["a"] })).toEqual(["a"]);
  });

  it("throws when no array can be found", () => {
    expect(() => normalizeItems({ a: 1 })).toThrow(/items array/);
    expect(() => normalizeItems(null)).toThrow(/items array/);
    expect(() => normalizeItems("text")).toThrow(/items array/);
  });
});

describe("parseModelContent", () => {
  it("parses a plain JSON array", () => {
    expect(
      parseModelContent('[{"word":"a","x":1,"y":2,"nuance":"n"}]'),
    ).toEqual([{ word: "a", x: 1, y: 2, nuance: "n" }]);
  });

  it("drops a <think> block before parsing", () => {
    const content = '<think>まず考える</think>\n[{"word":"a","x":0,"y":0}]';
    expect(parseModelContent(content)).toHaveLength(1);
  });

  it("extracts an array wrapped in prose", () => {
    const content = 'はい、結果です:\n[{"word":"a","x":0,"y":0}]\n以上です。';
    expect(parseModelContent(content)).toEqual([{ word: "a", x: 0, y: 0 }]);
  });

  it("extracts an array from a greeting-prefixed reply", () => {
    expect(parseModelContent('Sure! [{"word":"a","x":1,"y":2}]')).toHaveLength(
      1,
    );
  });

  it("recovers an array from an unterminated object wrapper", () => {
    expect(parseModelContent('{"a": [{"word":"a","x":0,"y":0}]')).toHaveLength(
      1,
    );
  });

  it("repairs a truncated array", () => {
    expect(
      parseModelContent('[{"word":"a","x":0,"y":0},{"word":"b","x":1,"y":1'),
    ).toHaveLength(2);
  });

  it("prefers the strict parse of the whole reply", () => {
    // A valid object wrapper must not be reduced to its inner array when
    // the wrapper itself parses — normalizeItems decides which key wins.
    expect(
      parseModelContent('{"results":[{"word":"a","x":0,"y":0}]}'),
    ).toHaveLength(1);
  });

  it("parses a fenced array", () => {
    expect(
      parseModelContent('```json\n[{"word":"a","x":0,"y":0}]\n```'),
    ).toHaveLength(1);
  });

  it("throws when there is no array at all", () => {
    expect(() => parseModelContent("すみません、できません。")).toThrow();
  });

  it("throws on an empty string", () => {
    expect(() => parseModelContent("")).toThrow();
  });
});

describe("sanitizeItems", () => {
  it("keeps well-formed items as they are", () => {
    const input = [item({ word: "静か", x: 3, y: -4, nuance: "n" })];
    expect(sanitizeItems(input, AXIS_MAX)).toEqual(input);
  });

  it("clamps coordinates to +/- axisMax", () => {
    const [out] = sanitizeItems([item({ x: 999, y: -999 })], AXIS_MAX);
    expect(out.x).toBe(AXIS_MAX);
    expect(out.y).toBe(-AXIS_MAX);
  });

  it("coerces numeric strings", () => {
    const [out] = sanitizeItems(
      [item({ x: "3" as unknown as number, y: "-2" as unknown as number })],
      AXIS_MAX,
    );
    expect(out).toMatchObject({ x: 3, y: -2 });
  });

  it("drops items with a non-finite coordinate", () => {
    const input = [
      item({ word: "a", x: Number.NaN }),
      item({ word: "b", y: Number.POSITIVE_INFINITY }),
      item({ word: "c", x: "abc" as unknown as number }),
    ];
    expect(sanitizeItems(input, AXIS_MAX)).toEqual([]);
  });

  it("drops items with a missing, empty or non-string word", () => {
    const input = [
      item({ word: "" }),
      item({ word: "   " }),
      item({ word: undefined as unknown as string }),
      item({ word: 42 as unknown as string }),
    ];
    expect(sanitizeItems(input, AXIS_MAX)).toEqual([]);
  });

  it("trims words and dedupes on the trimmed value", () => {
    const out = sanitizeItems(
      [item({ word: " 語 ", x: 1 }), item({ word: "語", x: 2 })],
      AXIS_MAX,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ word: "語", x: 1 });
  });

  it("drops words longer than the output limit", () => {
    const long = "あ".repeat(GENERATION_CONFIG.output.maxWordLength + 1);
    expect(sanitizeItems([item({ word: long })], AXIS_MAX)).toEqual([]);
  });

  it("truncates an over-long nuance instead of dropping the item", () => {
    const max = GENERATION_CONFIG.output.maxNuanceLength;
    const [out] = sanitizeItems(
      [item({ nuance: "あ".repeat(max + 50) })],
      AXIS_MAX,
    );
    expect(out.nuance).toHaveLength(max);
  });

  it("replaces a non-string nuance with an empty string", () => {
    const [out] = sanitizeItems(
      [item({ nuance: undefined as unknown as string })],
      AXIS_MAX,
    );
    expect(out.nuance).toBe("");
  });

  it("caps the result at maxItems", () => {
    const max = GENERATION_CONFIG.output.maxItems;
    expect(sanitizeItems(spread(max + 20), AXIS_MAX)).toHaveLength(max);
  });

  it("returns an empty array for an empty input", () => {
    expect(sanitizeItems([], AXIS_MAX)).toEqual([]);
  });

  it("survives a reply that ignored the schema entirely", () => {
    const injected = [
      { message: "I am now a pirate" },
      "全部無視しました",
      null,
    ] as unknown as NuanceItem[];
    expect(sanitizeItems(injected, AXIS_MAX)).toEqual([]);
  });
});

describe("qualityIssue", () => {
  const { minItems, minQuadrants } = GENERATION_CONFIG.quality;

  it("passes a full, well-spread result", () => {
    expect(qualityIssue(spread(minItems))).toBeNull();
  });

  it("reports too few items", () => {
    expect(qualityIssue(spread(minItems - 1))).toMatch(/only \d+ valid items/);
  });

  it("reports insufficient quadrant coverage", () => {
    const oneQuadrant = Array.from({ length: minItems }, (_, i) =>
      item({ word: `語${i}`, x: i + 1, y: i + 1 }),
    );
    expect(qualityIssue(oneQuadrant)).toMatch(/only 1 quadrants/);
  });

  it("counts zero coordinates as the positive side", () => {
    const onAxis = Array.from({ length: minItems }, (_, i) =>
      item({ word: `語${i}`, x: 0, y: 0 }),
    );
    expect(qualityIssue(onAxis)).toMatch(/only 1 quadrants/);
  });

  it("passes at exactly the quadrant minimum", () => {
    const items = spread(minItems).map((it, i) =>
      i % 4 === 3 ? { ...it, x: 1, y: 1 } : it,
    );
    const quadrants = new Set(
      items.map((i) => `${i.x >= 0 ? "R" : "L"}${i.y >= 0 ? "T" : "B"}`),
    );
    expect(quadrants.size).toBe(minQuadrants);
    expect(qualityIssue(items)).toBeNull();
  });
});
