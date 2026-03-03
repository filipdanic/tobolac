import type {
  CacheDriver,
  CacheEntry,
} from "../types";
import {
  normalizeBlobValue,
  type SqliteConnection,
  type SqliteRawRow,
  type SqliteStatement,
} from "./adapter/sqlite";
import {
  CLEAR_SQL,
  COPY_LEGACY_ROWS_SQL,
  COUNT_BY_NAMESPACE_SQL,
  COUNT_SQL,
  CREATE_MIGRATION_TABLE_SQL,
  CREATE_EXPIRY_INDEX_SQL,
  CREATE_TABLE_SQL,
  DROP_LEGACY_TABLE_SQL,
  DELETE_NAMESPACE_SQL,
  DELETE_SQL,
  GET_SQL,
  PRUNE_SQL,
  GET_TABLE_SCHEMA_SQL,
  RENAME_MIGRATED_TABLE_SQL,
  SET_SQL,
  TOUCH_SQL,
} from "./sqlite-sql";

interface TableSchemaRow {
  sql: string;
}

interface PendingTouch {
  namespace: string;
  key: string;
  lastAccessedAt: number;
}

const NAMESPACE_SEPARATOR = "\u0000";

export class SqliteL2Driver implements CacheDriver {
  private readonly getStmt: SqliteStatement<SqliteRawRow | null | undefined>;
  private readonly setStmt: SqliteStatement;
  private readonly deleteStmt: SqliteStatement;
  private readonly deleteNamespaceStmt: SqliteStatement;
  private readonly clearStmt: SqliteStatement;
  private readonly pruneStmt: SqliteStatement;
  private readonly countStmt: SqliteStatement<{ count: number }>;
  private readonly countByNamespaceStmt: SqliteStatement<{ count: number }>;
  private readonly touchStmt: SqliteStatement;
  private readonly pendingTouches = new Map<string, PendingTouch>();
  private flushTouchesTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushingTouches = false;

  constructor(private readonly db: SqliteConnection) {
    this.ensureSchema();

    this.db.prepare(CREATE_EXPIRY_INDEX_SQL).run();

    this.getStmt = this.db.prepare<SqliteRawRow | null | undefined>(GET_SQL);
    this.setStmt = this.db.prepare(SET_SQL);
    this.deleteStmt = this.db.prepare(DELETE_SQL);
    this.deleteNamespaceStmt = this.db.prepare(DELETE_NAMESPACE_SQL);
    this.clearStmt = this.db.prepare(CLEAR_SQL);
    this.pruneStmt = this.db.prepare(PRUNE_SQL);
    this.countStmt = this.db.prepare<{ count: number }>(COUNT_SQL);
    this.countByNamespaceStmt = this.db.prepare<{ count: number }>(
      COUNT_BY_NAMESPACE_SQL,
    );
    this.touchStmt = this.db.prepare(TOUCH_SQL);
  }

  private ensureSchema(): void {
    const schema = this.db.prepare<TableSchemaRow | null>(GET_TABLE_SCHEMA_SQL).get();
    if (!schema) {
      this.db.prepare(CREATE_TABLE_SQL).run();
      return;
    }

    if (!schema.sql.includes("namespace")) {
      this.db.prepare(CREATE_MIGRATION_TABLE_SQL).run();
      this.db.prepare(COPY_LEGACY_ROWS_SQL).run();
      this.db.prepare(DROP_LEGACY_TABLE_SQL).run();
      this.db.prepare(RENAME_MIGRATED_TABLE_SQL).run();
    }
  }

  private makeScopedKey(namespace: string, key: string): string {
    return `${namespace}${NAMESPACE_SEPARATOR}${key}`;
  }

  private scheduleTouchFlush(delayMs: number = 0): void {
    if (this.flushTouchesTimer) {
      return;
    }

    this.flushTouchesTimer = setTimeout(() => {
      this.flushTouchesTimer = null;
      this.flushTouches();
    }, delayMs);
  }

  private queueTouch(namespace: string, key: string, lastAccessedAt: number): void {
    const scopedKey = this.makeScopedKey(namespace, key);
    const existing = this.pendingTouches.get(scopedKey);
    if (!existing || lastAccessedAt > existing.lastAccessedAt) {
      this.pendingTouches.set(scopedKey, {
        namespace,
        key,
        lastAccessedAt,
      });
    }

    this.scheduleTouchFlush(0);
  }

  private flushTouches(): void {
    if (this.isFlushingTouches || this.pendingTouches.size === 0) {
      return;
    }

    this.isFlushingTouches = true;
    const batch = [...this.pendingTouches.values()];
    this.pendingTouches.clear();

    for (let i = 0; i < batch.length; i += 1) {
      const touch = batch[i];
      try {
        this.touchStmt.run({
          namespace: touch.namespace,
          key: touch.key,
          last_accessed_at: touch.lastAccessedAt,
        });
      } catch {
        for (let j = i; j < batch.length; j += 1) {
          const pending = batch[j];
          this.pendingTouches.set(
            this.makeScopedKey(pending.namespace, pending.key),
            pending,
          );
        }
        this.isFlushingTouches = false;
        this.scheduleTouchFlush(10);
        return;
      }
    }

    this.isFlushingTouches = false;
    if (this.pendingTouches.size > 0) {
      this.scheduleTouchFlush(0);
    }
  }

  get(namespace: string, key: string): CacheEntry | null {
    const row = this.getStmt.get({ namespace, key });
    if (!row) {
      return null;
    }

    const now = Date.now();
    this.queueTouch(namespace, key, now);

    return {
      value: normalizeBlobValue(row.value),
      createdAt: row.created_at,
      ttl: row.ttl,
      swr: row.swr,
      lastAccessedAt: now,
    };
  }

  set(namespace: string, key: string, entry: CacheEntry): void {
    this.setStmt.run({
      namespace,
      key,
      value: entry.value,
      created_at: entry.createdAt,
      ttl: entry.ttl,
      swr: entry.swr,
      last_accessed_at: entry.lastAccessedAt,
    });
  }

  delete(namespace: string, key: string): boolean {
    this.pendingTouches.delete(this.makeScopedKey(namespace, key));
    return this.deleteStmt.run({ namespace, key }).changes > 0;
  }

  deleteNamespace(namespace: string): void {
    const prefix = `${namespace}${NAMESPACE_SEPARATOR}`;
    for (const scopedKey of this.pendingTouches.keys()) {
      if (scopedKey.startsWith(prefix)) {
        this.pendingTouches.delete(scopedKey);
      }
    }

    this.deleteNamespaceStmt.run({ namespace });
  }

  clear(): void {
    this.pendingTouches.clear();
    this.clearStmt.run();
  }

  prune(now: number = Date.now()): number {
    return this.pruneStmt.run({ now }).changes;
  }

  close(): void {
    if (this.flushTouchesTimer) {
      clearTimeout(this.flushTouchesTimer);
      this.flushTouchesTimer = null;
    }
    this.flushTouches();
    this.db.close();
  }

  count(): number {
    return this.countStmt.get().count;
  }

  countByNamespace(namespace: string): number {
    return this.countByNamespaceStmt.get({ namespace }).count;
  }
}
