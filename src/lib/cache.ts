import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
}

const CACHE_MAX = 200;

// In-memory LRU map (hot path)
const mem = new Map<string, unknown[]>();
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

function loadFromDisk() {
  if (loaded) return;
  loaded = true;
  try {
    const file = resolveCacheFile();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf-8");
      const entries: CacheEntry<unknown[]>[] = JSON.parse(raw);
      for (const entry of entries) {
        mem.set(entry.key, entry.value);
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
    const entries: CacheEntry<unknown[]>[] = [];
    for (const [key, value] of mem) {
      entries.push({ key, value: value as unknown[], createdAt: Date.now() });
    }
    fs.writeFileSync(resolveCacheFile(), JSON.stringify(entries), "utf-8");
  } catch (err) {
    console.warn("Failed to persist cache:", err);
  }
}

export function cacheGet<T>(key: string): T[] | undefined {
  loadFromDisk();
  return mem.get(key) as T[] | undefined;
}

export function cacheSet<T>(key: string, value: T[]): void {
  loadFromDisk();
  if (mem.size >= CACHE_MAX) {
    const oldest = mem.keys().next().value;
    if (oldest !== undefined) mem.delete(oldest);
  }
  mem.set(key, value);
  // Persist asynchronously to avoid blocking the response
  setTimeout(persistToDisk, 0);
}
