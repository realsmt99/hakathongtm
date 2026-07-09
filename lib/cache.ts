import { saveJSON, loadJSON } from "./memory-store";

interface CacheEnvelope<T> {
  ts: number;
  data: T;
}

/** Read a cached value if it exists and is younger than ttlMs. */
export function getCached<T>(key: string, ttlMs: number): T | null {
  const env = loadJSON<CacheEnvelope<T>>(`cache_${key}`);
  if (!env) return null;
  if (Date.now() - env.ts > ttlMs) return null;
  return env.data;
}

/** Read a cached value regardless of age (used as a fallback on live errors). */
export function getCachedStale<T>(key: string): { data: T; ageMs: number } | null {
  const env = loadJSON<CacheEnvelope<T>>(`cache_${key}`);
  if (!env) return null;
  return { data: env.data, ageMs: Date.now() - env.ts };
}

export function setCached<T>(key: string, data: T): void {
  saveJSON(`cache_${key}`, { ts: Date.now(), data } satisfies CacheEnvelope<T>);
}

/** Stable cache key from arbitrary parts (lowercased, non-alnum → underscore). */
export function cacheKey(...parts: (string | number | undefined | null)[]): string {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .map((p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .join("__")
    .slice(0, 120);
}
