import { RATE_LIMIT_CONFIG } from "@/lib/config";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically. unref() so this housekeeping
// timer never keeps the process alive on its own.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, RATE_LIMIT_CONFIG.cleanupIntervalMs);
cleanupTimer.unref?.();

/**
 * Simple in-memory sliding-window rate limiter.
 * Returns { success: true } if allowed, or { success: false, retryAfter } if blocked.
 */
export function rateLimit(
  key: string,
  {
    limit = RATE_LIMIT_CONFIG.maxRequests,
    windowMs = RATE_LIMIT_CONFIG.windowMs,
  } = {},
): { success: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }

  if (entry.count < limit) {
    entry.count++;
    return { success: true };
  }

  return {
    success: false,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  };
}
