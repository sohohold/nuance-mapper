/**
 * Cache key derivation, kept apart from cache.ts so it can be tested
 * without touching Redis or the disk fallback.
 */

/**
 * Normalized (NFKC + trim) so trivial input variants share one entry.
 * Case is preserved on purpose: the prompt sees the original spelling,
 * and "Apple" and "apple" are different generations.
 */
export function buildCacheKey(
  word: string,
  xAxis: string,
  yAxis: string,
): string {
  return [word, xAxis, yAxis].map((s) => s.normalize("NFKC").trim()).join("|");
}
