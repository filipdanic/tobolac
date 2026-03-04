import type { CacheDriver, CacheEntry } from "../types";
import {
  normalizeBlobValue,
  type SqliteConnection,
  type SqliteRawRow,
  type SqliteStatement,
} from "./adapter/sqlite";
import {
  CLEAR_SQL,
  COUNT_BY_NAMESPACE_SQL,
  COUNT_SQL,
  CREATE_EXPIRY_INDEX_SQL,
  CREATE_TABLE_SQL,
  DROP_LEGACY_TABLE_SQL,
  DELETE_NAMESPACE_SQL,
  DELETE_SQL,
  GET_SQL,
  PRUNE_SQL,
  GET_TABLE_SCHEMA_SQL,
  SET_SQL,
} from "./sqlite-sql";

interface TableSchemaRow {
  sql: string;
}

export class SqliteL2Driver implements CacheDriver {
  private readonly getStmt: SqliteStatement<SqliteRawRow | null | undefined>;
  private readonly setStmt: SqliteStatement;
  private readonly beginStmt: SqliteStatement;
  private readonly commitStmt: SqliteStatement;
  private readonly rollbackStmt: SqliteStatement;
  private readonly deleteStmt: SqliteStatement;
  private readonly deleteNamespaceStmt: SqliteStatement;
  private readonly clearStmt: SqliteStatement;
  private readonly pruneStmt: SqliteStatement;
  private readonly countStmt: SqliteStatement<{ count: number }>;
  private readonly countByNamespaceStmt: SqliteStatement<{ count: number }>;

  constructor(private readonly db: SqliteConnection) {
    this.ensureSchema();

    this.db.prepare(CREATE_EXPIRY_INDEX_SQL).run();
    this.db.prepare("PRAGMA journal_mode = WAL;").run();

    this.getStmt = this.db.prepare<SqliteRawRow | null | undefined>(GET_SQL);
    this.setStmt = this.db.prepare(SET_SQL);
    this.beginStmt = this.db.prepare("BEGIN");
    this.commitStmt = this.db.prepare("COMMIT");
    this.rollbackStmt = this.db.prepare("ROLLBACK");
    this.deleteStmt = this.db.prepare(DELETE_SQL);
    this.deleteNamespaceStmt = this.db.prepare(DELETE_NAMESPACE_SQL);
    this.clearStmt = this.db.prepare(CLEAR_SQL);
    this.pruneStmt = this.db.prepare(PRUNE_SQL);
    this.countStmt = this.db.prepare<{ count: number }>(COUNT_SQL);
    this.countByNamespaceStmt = this.db.prepare<{ count: number }>(
      COUNT_BY_NAMESPACE_SQL,
    );
  }

  private ensureSchema(): void {
    const schema = this.db
      .prepare<TableSchemaRow | null>(GET_TABLE_SCHEMA_SQL)
      .get();
    if (!schema) {
      this.db.prepare(CREATE_TABLE_SQL).run();
      return;
    }
  }

  get(namespace: string, key: string): CacheEntry | null {
    const row = this.getStmt.get({ namespace, key });
    if (!row) {
      return null;
    }

    return {
      value: normalizeBlobValue(row.value),
      createdAt: row.created_at,
      ttl: row.ttl,
      swr: row.swr,
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
    });
  }

  setMany(
    writes: ReadonlyArray<{
      namespace: string;
      key: string;
      entry: CacheEntry;
    }>,
  ): void {
    if (writes.length === 0) {
      return;
    }

    this.beginStmt.run();
    try {
      for (let i = 0; i < writes.length; i += 1) {
        const write = writes[i];
        this.setStmt.run({
          namespace: write.namespace,
          key: write.key,
          value: write.entry.value,
          created_at: write.entry.createdAt,
          ttl: write.entry.ttl,
          swr: write.entry.swr,
        });
      }

      this.commitStmt.run();
    } catch (error) {
      this.rollbackStmt.run();
      throw error;
    }
  }

  delete(namespace: string, key: string): boolean {
    return this.deleteStmt.run({ namespace, key }).changes > 0;
  }

  deleteNamespace(namespace: string): void {
    this.deleteNamespaceStmt.run({ namespace });
  }

  clear(): void {
    this.clearStmt.run();
  }

  prune(now: number = Date.now()): number {
    return this.pruneStmt.run({ now }).changes;
  }

  close(): void {
    this.db.close();
  }

  count(): number {
    return this.countStmt.get().count;
  }

  countByNamespace(namespace: string): number {
    return this.countByNamespaceStmt.get({ namespace }).count;
  }
}
