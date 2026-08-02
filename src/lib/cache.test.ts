/**
 * The cache keeps module-level state (the in-memory map, the disk-load
 * flag), so each test imports it fresh through `vi.resetModules()`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CACHE_CONFIG } from "@/lib/config";

const REDIS_URL = "https://redis.example.test";
const KEY = "すごい|X|Y";
const VALUE = [{ word: "壮麗", x: 1, y: 2, nuance: "n" }];

async function freshCache() {
  vi.resetModules();
  return import("@/lib/cache");
}

function useRedis() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", REDIS_URL);
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
}

function useLocalOnly() {
  for (const name of [
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ]) {
    vi.stubEnv(name, "");
  }
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cache — Redis backend", () => {
  it("reads a stored value", async () => {
    useRedis();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ result: JSON.stringify(VALUE) })),
    );
    const { cacheGet } = await freshCache();

    await expect(cacheGet(KEY)).resolves.toEqual(VALUE);
  });

  it("treats an empty result as a miss", async () => {
    useRedis();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ result: null })),
    );
    const { cacheGet } = await freshCache();

    await expect(cacheGet(KEY)).resolves.toBeUndefined();
  });

  it("namespaces keys with the configured prefix", async () => {
    useRedis();
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({ result: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { cacheGet } = await freshCache();
    await cacheGet(KEY);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      encodeURIComponent(CACHE_CONFIG.redisKeyPrefix + KEY),
    );
  });

  it("treats a transport failure as a miss rather than an error", async () => {
    useRedis();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection reset");
      }),
    );
    const { cacheGet } = await freshCache();

    await expect(cacheGet(KEY)).resolves.toBeUndefined();
  });

  it("treats an error status as a miss", async () => {
    useRedis();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const { cacheGet } = await freshCache();

    await expect(cacheGet(KEY)).resolves.toBeUndefined();
  });

  it("never lets a failed write reject", async () => {
    useRedis();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const { cacheSet } = await freshCache();

    await expect(cacheSet(KEY, VALUE)).resolves.toBeUndefined();
  });

  it("sends the configured TTL on write", async () => {
    useRedis();
    const fetchMock = vi.fn(async (_url: string) =>
      Response.json({ result: "OK" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { cacheSet } = await freshCache();
    await cacheSet(KEY, VALUE);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `EX=${Math.floor(CACHE_CONFIG.ttlMs / 1000)}`,
    );
  });
});

describe("cache — local fallback", () => {
  it("returns what was written", async () => {
    useLocalOnly();
    const { cacheGet, cacheSet } = await freshCache();
    await cacheSet(KEY, VALUE);

    await expect(cacheGet(KEY)).resolves.toEqual(VALUE);
  });

  it("misses on an unknown key", async () => {
    useLocalOnly();
    const { cacheGet } = await freshCache();

    await expect(cacheGet("not-stored")).resolves.toBeUndefined();
  });

  it("drops an entry once it is older than the TTL", async () => {
    useLocalOnly();
    const { cacheGet, cacheSet } = await freshCache();
    await cacheSet(KEY, VALUE);

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + CACHE_CONFIG.ttlMs + 1);
    await expect(cacheGet(KEY)).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("evicts the oldest entry at capacity", async () => {
    useLocalOnly();
    const { cacheGet, cacheSet } = await freshCache();

    for (let i = 0; i <= CACHE_CONFIG.maxEntries; i++) {
      await cacheSet(`key-${i}`, VALUE);
    }

    await expect(cacheGet("key-0")).resolves.toBeUndefined();
    await expect(cacheGet(`key-${CACHE_CONFIG.maxEntries}`)).resolves.toEqual(
      VALUE,
    );
  });

  it("does not reach the network", async () => {
    useLocalOnly();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { cacheGet, cacheSet } = await freshCache();

    await cacheSet(KEY, VALUE);
    await cacheGet(KEY);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
