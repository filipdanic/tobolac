import { LRUCache } from "lru-cache";
import type { CacheEntry } from "../types";

export class MemoryCache {
  private readonly cache: LRUCache<string, CacheEntry>;

  constructor(maxItems: number) {
    this.cache = new LRUCache<string, CacheEntry>({
      max: maxItems,
    });
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    return entry;
  }

  set(key: string, entry: CacheEntry): void {
    this.cache.set(key, entry);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clearByPrefix(prefix: string): number {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key === prefix || key.startsWith(`${prefix}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
    return keysToDelete.length;
  }

  clear(): void {
    this.cache.clear();
  }

  count(): number {
    return this.cache.size;
  }
}
