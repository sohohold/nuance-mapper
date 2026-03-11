import fs from "node:fs";
import path from "node:path";

interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
}

const CACHE_FILE = path.join(process.cwd(), ".cache", "nuance-cache.json");
const CACHE_MAX = 200;

// In-memory LRU map (hot path)
const mem = new Map<string, unknown[]>();
let loaded = false;

function ensureCacheDir() {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFromDisk() {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
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
    ensureCacheDir();
    const entries: CacheEntry<unknown[]>[] = [];
    for (const [key, value] of mem) {
      entries.push({ key, value: value as unknown[], createdAt: Date.now() });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entries), "utf-8");
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
