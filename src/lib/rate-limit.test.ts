import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_CONFIG } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";

const { maxRequests, windowMs } = RATE_LIMIT_CONFIG;

// The store is a module-level singleton, so every test uses its own key
let counter = 0;
const freshKey = () => `key-${counter++}`;

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the configured number of requests", () => {
    const key = freshKey();
    for (let i = 0; i < maxRequests; i++) {
      expect(rateLimit(key).success).toBe(true);
    }
  });

  it("blocks the request after the limit", () => {
    const key = freshKey();
    for (let i = 0; i < maxRequests; i++) rateLimit(key);
    expect(rateLimit(key)).toMatchObject({ success: false });
  });

  it("reports retryAfter in whole seconds", () => {
    const key = freshKey();
    for (let i = 0; i < maxRequests; i++) rateLimit(key);
    const blocked = rateLimit(key);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.retryAfter).toBeLessThanOrEqual(windowMs / 1000);
    expect(Number.isInteger(blocked.retryAfter)).toBe(true);
  });

  it("counts each key independently", () => {
    const busy = freshKey();
    const quiet = freshKey();
    for (let i = 0; i < maxRequests; i++) rateLimit(busy);
    expect(rateLimit(busy).success).toBe(false);
    expect(rateLimit(quiet).success).toBe(true);
  });

  it("starts a new window once the old one expires", () => {
    const key = freshKey();
    for (let i = 0; i < maxRequests; i++) rateLimit(key);
    expect(rateLimit(key).success).toBe(false);

    vi.advanceTimersByTime(windowMs);
    expect(rateLimit(key).success).toBe(true);
  });

  it("does not reset early inside the window", () => {
    const key = freshKey();
    for (let i = 0; i < maxRequests; i++) rateLimit(key);
    vi.advanceTimersByTime(windowMs - 1);
    expect(rateLimit(key).success).toBe(false);
  });

  it("honours a per-call limit override", () => {
    const key = freshKey();
    expect(rateLimit(key, { limit: 1 }).success).toBe(true);
    expect(rateLimit(key, { limit: 1 }).success).toBe(false);
  });
});
