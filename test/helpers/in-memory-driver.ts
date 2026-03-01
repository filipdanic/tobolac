import type { CacheDriver, CacheEntry, DriverWithNamespaceMaxItems } from "../../src/types";

export class InMemoryDriver implements CacheDriver, DriverWithNamespaceMaxItems {
  private readonly entries = new Map<string, CacheEntry>();

  private makeScopedKey(namespace: string, key: string): string {
    return `${namespace}\u0000${key}`;
  }

  private parseNamespace(scopedKey: string): string {
    const separatorIndex = scopedKey.indexOf("\u0000");
    return scopedKey.slice(0, separatorIndex);
  }

  get(namespace: string, key: string): CacheEntry | null {
    const entry = this.entries.get(this.makeScopedKey(namespace, key));
    if (!entry) {
      return null;
    }
    entry.lastAccessedAt = Date.now();
    return { ...entry };
  }

  set(namespace: string, key: string, entry: CacheEntry): void {
    this.entries.set(this.makeScopedKey(namespace, key), { ...entry });
  }

  delete(namespace: string, key: string): boolean {
    return this.entries.delete(this.makeScopedKey(namespace, key));
  }

  deleteNamespace(namespace: string): void {
    for (const scopedKey of this.entries.keys()) {
      if (this.parseNamespace(scopedKey) === namespace) {
        this.entries.delete(scopedKey);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }

  prune(now: number = Date.now()): number {
    let count = 0;
    for (const [key, entry] of this.entries) {
      const expiresAt = entry.createdAt + entry.ttl + entry.swr;
      if (now > expiresAt) {
        this.entries.delete(key);
        count += 1;
      }
    }
    return count;
  }

  close(): void {
    // no-op
  }

  count(): number {
    return this.entries.size;
  }

  countByNamespace(namespace: string): number {
    let count = 0;
    for (const scopedKey of this.entries.keys()) {
      if (this.parseNamespace(scopedKey) === namespace) {
        count += 1;
      }
    }
    return count;
  }

  enforceMaxItemsForNamespace(namespace: string, maxItems: number): number {
    const scoped = [...this.entries.entries()]
      .filter(([scopedKey]) => this.parseNamespace(scopedKey) === namespace)
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    const overflow = Math.max(0, scoped.length - maxItems);
    for (let i = 0; i < overflow; i += 1) {
      this.entries.delete(scoped[i][0]);
    }
    return overflow;
  }
}
