import type { CacheDriver, CacheEntry } from "../types";

interface PendingWrite {
  scopedKey: string;
  namespace: string;
  key: string;
  entry: CacheEntry;
}

const NAMESPACE_SEPARATOR = "\u0000";
const FLUSH_CHUNK_SIZE = 1024;

export class WriteBehindCacheDriver implements CacheDriver {
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;
  private isClosing = false;
  private isClosed = false;

  constructor(private readonly inner: CacheDriver) {}

  private makeScopedKey(namespace: string, key: string): string {
    return `${namespace}${NAMESPACE_SEPARATOR}${key}`;
  }

  private scheduleFlush(delayMs: number = 0): void {
    if (this.flushTimer || this.isClosing || this.isClosed) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushPending();
    }, delayMs);
    this.flushTimer.unref?.();
  }

  private takePendingChunk(maxItems: number): PendingWrite[] {
    const chunk: PendingWrite[] = [];
    const iterator = this.pendingWrites.entries();
    while (chunk.length < maxItems) {
      const next = iterator.next();
      if (next.done) {
        break;
      }
      const [scopedKey, write] = next.value;
      this.pendingWrites.delete(scopedKey);
      chunk.push(write);
    }
    return chunk;
  }

  private flushChunk(chunk: PendingWrite[]): boolean {
    if (chunk.length === 0) {
      return true;
    }

    if (this.inner.setMany) {
      try {
        this.inner.setMany(chunk);
        return true;
      } catch {
        for (let i = 0; i < chunk.length; i += 1) {
          this.pendingWrites.set(chunk[i].scopedKey, chunk[i]);
        }
        return false;
      }
    }

    for (let i = 0; i < chunk.length; i += 1) {
      const write = chunk[i];
      try {
        this.inner.set(write.namespace, write.key, write.entry);
      } catch {
        for (let j = i; j < chunk.length; j += 1) {
          this.pendingWrites.set(chunk[j].scopedKey, chunk[j]);
        }
        return false;
      }
    }

    return true;
  }

  private flushPending(): void {
    if (this.isFlushing || this.pendingWrites.size === 0) {
      return;
    }

    this.isFlushing = true;
    while (this.pendingWrites.size > 0) {
      const chunk = this.takePendingChunk(FLUSH_CHUNK_SIZE);
      const flushed = this.flushChunk(chunk);
      if (!flushed) {
        this.isFlushing = false;
        if (!this.isClosing && !this.isClosed) {
          this.scheduleFlush(10);
        }
        return;
      }
    }

    this.isFlushing = false;
    if (this.pendingWrites.size > 0 && !this.isClosing && !this.isClosed) {
      this.scheduleFlush(0);
    }
  }

  get(namespace: string, key: string): CacheEntry | null {
    const pending = this.pendingWrites.get(this.makeScopedKey(namespace, key));
    if (pending) {
      return pending.entry;
    }

    return this.inner.get(namespace, key);
  }

  set(namespace: string, key: string, entry: CacheEntry): void {
    const scopedKey = this.makeScopedKey(namespace, key);
    this.pendingWrites.set(scopedKey, {
      scopedKey,
      namespace,
      key,
      entry,
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
    if (this.isClosed) {
      return;
    }

    this.isClosing = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    this.flushPending();
    this.isClosed = true;
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
