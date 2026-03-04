import type { CacheDriver, CacheEntry } from "../types";

interface PendingWrite {
  scopedKey: string;
  namespace: string;
  key: string;
  entry: CacheEntry;
}

const NAMESPACE_SEPARATOR = "\u0000";

export class WriteBehindCacheDriver implements CacheDriver {
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  constructor(private readonly inner: CacheDriver) {}

  private makeScopedKey(namespace: string, key: string): string {
    return `${namespace}${NAMESPACE_SEPARATOR}${key}`;
  }

  private scheduleFlush(delayMs: number = 0): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPending();
    }, delayMs);
  }

  private flushPending(): void {
    if (this.isFlushing || this.pendingWrites.size === 0) {
      return;
    }

    this.isFlushing = true;
    const batch = [...this.pendingWrites.values()];
    this.pendingWrites.clear();

    if (this.inner.setMany) {
      try {
        this.inner.setMany(batch);
      } catch {
        for (let i = 0; i < batch.length; i += 1) {
          this.pendingWrites.set(batch[i].scopedKey, batch[i]);
        }
        this.isFlushing = false;
        this.scheduleFlush(10);
        return;
      }

      this.isFlushing = false;
      if (this.pendingWrites.size > 0) {
        this.scheduleFlush(0);
      }
      return;
    }

    for (let i = 0; i < batch.length; i += 1) {
      const write = batch[i];
      try {
        this.inner.set(write.namespace, write.key, write.entry);
      } catch {
        for (let j = i; j < batch.length; j += 1) {
          this.pendingWrites.set(batch[j].scopedKey, batch[j]);
        }
        this.isFlushing = false;
        this.scheduleFlush(10);
        return;
      }
    }

    this.isFlushing = false;
    if (this.pendingWrites.size > 0) {
      this.scheduleFlush(0);
    }
  }

  get(namespace: string, key: string): CacheEntry | null {
    const pending = this.pendingWrites.get(this.makeScopedKey(namespace, key));
    if (pending) {
      return { ...pending.entry };
    }

    return this.inner.get(namespace, key);
  }

  set(namespace: string, key: string, entry: CacheEntry): void {
    const scopedKey = this.makeScopedKey(namespace, key);
    this.pendingWrites.set(scopedKey, {
      scopedKey,
      namespace,
      key,
      entry: { ...entry },
    });
    this.scheduleFlush(0);
  }

  delete(namespace: string, key: string): boolean {
    this.pendingWrites.delete(this.makeScopedKey(namespace, key));
    return this.inner.delete(namespace, key);
  }

  deleteNamespace(namespace: string): void {
    const prefix = `${namespace}${NAMESPACE_SEPARATOR}`;
    for (const scopedKey of this.pendingWrites.keys()) {
      if (scopedKey.startsWith(prefix)) {
        this.pendingWrites.delete(scopedKey);
      }
    }

    this.inner.deleteNamespace(namespace);
  }

  clear(): void {
    this.pendingWrites.clear();
    this.inner.clear();
  }

  prune(now?: number): number {
    this.flushPending();
    return this.inner.prune(now);
  }

  close(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.flushPending();
    this.inner.close();
  }

  count(): number {
    this.flushPending();
    return this.inner.count();
  }

  countByNamespace(namespace: string): number {
    this.flushPending();
    return this.inner.countByNamespace(namespace);
  }
}
