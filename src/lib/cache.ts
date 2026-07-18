import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CACHE_CONFIG } from "@/lib/config";

interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
}

// ── Upstash Redis (REST) backend ─────────────────────────────────────
// Preferred when configured: survives serverless cold starts and is
// shared across instances, so cache hits actually save upstream quota.
// Accepts both Upstash-native and Vercel KV integration env var names.
function redisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token };
}

async function redisGet(key: string): Promise<unknown[] | undefined> {
  const config = redisConfig();
  if (!config) return undefined;
  const res = await fetch(
    `${config.url}/get/${encodeURIComponent(CACHE_CONFIG.redisKeyPrefix + key)}`,
    {
      headers: { Authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(CACHE_CONFIG.redisTimeoutMs),
    },
  );
  if (!res.ok) throw new Error(`Redis GET failed: ${res.status}`);
  const data = (await res.json()) as { result: string | null };
  if (!data.result) return undefined;
  return JSON.parse(data.result) as unknown[];
}

async function redisSet(key: string, value: unknown[]): Promise<void> {
  const config = redisConfig();
  if (!config) return;
  const res = await fetch(
    `${config.url}/set/${encodeURIComponent(CACHE_CONFIG.redisKeyPrefix + key)}?EX=${Math.floor(CACHE_CONFIG.ttlMs / 1000)}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(CACHE_CONFIG.redisTimeoutMs),
    },
  );
  if (!res.ok) throw new Error(`Redis SET failed: ${res.status}`);
}

// ── Local fallback: in-memory LRU + best-effort disk persistence ─────
const mem = new Map<string, CacheEntry<unknown[]>>();
let loaded = false;
let cacheFile: string | null = null;

// The project dir is read-only on serverless platforms (e.g. Vercel's
// /var/task), so fall back to the OS temp dir when it isn't writable.
function resolveCacheFile(): string {
  if (cacheFile) return cacheFile;
  const candidates = [
    path.join(process.cwd(), ".cache"),
    path.join(os.tmpdir(), "nuance-mapper"),
  ];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      cacheFile = path.join(dir, "nuance-cache.json");
      return cacheFile;
    } catch {
      // Not writable — try the next candidate
    }
  }
  cacheFile = path.join(os.tmpdir(), "nuance-cache.json");
  return cacheFile;
}

function isExpired(entry: CacheEntry<unknown[]>): boolean {
  return Date.now() - entry.createdAt > CACHE_CONFIG.ttlMs;
}

function loadFromDisk() {
  if (loaded) return;
  loaded = true;
  try {
    const file = resolveCacheFile();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const entries: CacheEntry<unknown[]>[] = JSON.parse(raw);
      for (const entry of entries) {
        if (!isExpired(entry)) mem.set(entry.key, entry);
      }
      console.log(`Cache loaded: ${mem.size} entries from disk`);
    }
  } catch {
    // Corrupted cache file — start fresh
    console.warn("Cache file corrupted, starting fresh");
  }
}

function persistToDisk() {
  try {
    const entries = [...mem.values()];
    fs.writeFileSync(resolveCacheFile(), JSON.stringify(entries), "utf-8");
  } catch (err) {
    console.warn("Failed to persist cache:", err);
  }
}

export async function cacheGet<T>(key: string): Promise<T[] | undefined> {
  if (redisConfig()) {
    try {
      return (await redisGet(key)) as T[] | undefined;
    } catch (err) {
      // Cache must never take the API down — treat as a miss
      console.warn("Redis cache read failed:", err);
      return undefined;
    }
  }
  loadFromDisk();
  const entry = mem.get(key);
  if (!entry) return undefined;
  if (isExpired(entry)) {
    mem.delete(key);
    return undefined;
  }
  return entry.value as T[];
}

export async function cacheSet<T>(key: string, value: T[]): Promise<void> {
  if (redisConfig()) {
    try {
      await redisSet(key, value as unknown[]);
    } catch (err) {
      console.warn("Redis cache write failed:", err);
    }
    return;
  }
  loadFromDisk();
  if (mem.size >= CACHE_CONFIG.maxEntries) {
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
  mem.set(key, { key, value: value as unknown[], createdAt: Date.now() });
  // Persist asynchronously to avoid blocking the response
  setTimeout(persistToDisk, 0);
}
