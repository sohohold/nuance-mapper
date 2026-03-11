interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}, 60_000);

/**
 * Simple in-memory sliding-window rate limiter.
 * Returns { success: true } if allowed, or { success: false, retryAfter } if blocked.
 */
export function rateLimit(
  key: string,
  { limit = 10, windowMs = 60_000 } = {},
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
