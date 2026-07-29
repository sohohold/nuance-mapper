/**
 * Everything that turns an untrusted model reply into displayable items.
 *
 * These functions are pure and total: given the same string they return
 * the same items or throw, with no network, clock or environment access.
 * They are the last line of defence against both bad generations and
 * successful prompt injections — nothing reaches the client or the cache
 * without passing through `sanitizeItems`.
 */

import { jsonrepair } from "jsonrepair";
import { GENERATION_CONFIG } from "@/lib/config";
import type { NuanceData } from "@/lib/types";

export type NuanceItem = NuanceData;

/** Pull the item array out of the shapes models actually return. */
export function normalizeItems(data: unknown): NuanceItem[] {
  if (Array.isArray(data)) return data;
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    for (const key of ["results", "words", "synonyms"]) {
      if (Array.isArray(obj[key])) return obj[key] as NuanceItem[];
    }
    const arr = Object.values(obj).find((v) => Array.isArray(v));
    if (arr) return arr as NuanceItem[];
  }
  throw new Error("Could not parse response as items array");
}

/** Strip a leading ```json / ``` fence and its closing counterpart. */
export function stripCodeFences(str: string): string {
  let s = str.trim();
  if (s.startsWith("```json")) {
    s = s.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  } else if (s.startsWith("```")) {
    s = s.replace(/^```\n?/, "").replace(/\n?```$/, "");
  }
  return s;
}

/** JSON.parse, falling back to jsonrepair for truncated/lenient output. */
export function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return JSON.parse(jsonrepair(value));
  }
}

/** Parse model content, tolerating <think> blocks and stray prose. */
export function parseModelContent(content: string): NuanceItem[] {
  const s = stripCodeFences(
    content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim(),
  );
  try {
    return normalizeItems(parseJson(s));
  } catch {
    const start = s.indexOf("[");
    const end = s.lastIndexOf("]");
    if (start === -1 || end <= start) throw new Error("No JSON array found");
    return normalizeItems(parseJson(s.slice(start, end + 1)));
  }
}

/** Drop malformed entries, dedupe by word, clamp coordinates. */
export function sanitizeItems(
  items: NuanceItem[],
  axisMax: number,
): NuanceItem[] {
  const seen = new Set<string>();
  const out: NuanceItem[] = [];
  for (const item of items) {
    if (out.length >= GENERATION_CONFIG.output.maxItems) break;
    if (typeof item?.word !== "string" || !item.word.trim()) continue;
    const x = Number(item.x);
    const y = Number(item.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const word = item.word.trim();
    if (
      word.length > GENERATION_CONFIG.output.maxWordLength ||
      seen.has(word)
    ) {
      continue;
    }
    seen.add(word);
    out.push({
      word,
      x: Math.max(-axisMax, Math.min(axisMax, x)),
      y: Math.max(-axisMax, Math.min(axisMax, y)),
      nuance:
        typeof item.nuance === "string"
          ? item.nuance.slice(0, GENERATION_CONFIG.output.maxNuanceLength)
          : "",
    });
  }
  return out;
}

/** Describe why a result is too thin to show, or null when it passes. */
export function qualityIssue(items: NuanceItem[]): string | null {
  if (items.length < GENERATION_CONFIG.quality.minItems) {
    return `only ${items.length} valid items`;
  }
  const quadrants = new Set(
    items.map((i) => `${i.x >= 0 ? "R" : "L"}${i.y >= 0 ? "T" : "B"}`),
  );
  if (quadrants.size < GENERATION_CONFIG.quality.minQuadrants) {
    return `items cover only ${quadrants.size} quadrants`;
  }
  return null;
}
