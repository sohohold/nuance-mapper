/**
 * Input validation shared by the browser and the API route.
 *
 * Both sides import these functions so there is exactly one rule per field.
 * The client uses them to block submission and explain why; the route uses
 * them to reject anything that bypassed the UI.
 */

import { GENERATION_CONFIG } from "@/lib/config";

export const INPUT_LIMITS = {
  word: GENERATION_CONFIG.input.maxWordLength,
  axisLabel: GENERATION_CONFIG.input.maxAxisLabelLength,
} as const;

export type ValidationErrorCode = "invalid_type" | "empty" | "too_long";

export interface ValidationResult {
  ok: boolean;
  /** Absent when `ok` is true. */
  code?: ValidationErrorCode;
  /** Counted length of the trimmed value; 0 for non-strings. */
  length: number;
  /** The limit the value was measured against. */
  max: number;
}

/**
 * Length as a user perceives it, not as UTF-16 stores it.
 *
 * `"👍".length` is 2, which would make the 24-character limit mean
 * "12 emoji" and disagree with the counter shown next to the field.
 * Counting code points keeps the number stable and runtime-independent.
 * (Combining marks and ZWJ sequences still count per code point — see the
 * decision row in docs/test-spec.md.)
 */
export function countChars(value: string): number {
  return Array.from(value).length;
}

function validateText(value: unknown, max: number): ValidationResult {
  if (typeof value !== "string") {
    return { ok: false, code: "invalid_type", length: 0, max };
  }
  // Surrounding whitespace is never meaningful here and the API trims it
  // before building the cache key, so measure what actually gets used
  const trimmed = value.trim();
  const length = countChars(trimmed);
  if (length === 0) return { ok: false, code: "empty", length, max };
  if (length > max) return { ok: false, code: "too_long", length, max };
  return { ok: true, length, max };
}

export function validateWord(value: unknown): ValidationResult {
  return validateText(value, INPUT_LIMITS.word);
}

export function validateAxisLabel(value: unknown): ValidationResult {
  return validateText(value, INPUT_LIMITS.axisLabel);
}
