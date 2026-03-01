import { createRequire } from "node:module";
import type { SqliteConnection, SqliteStatement } from "./sqlite";

interface BetterSqlite3Statement<T = unknown> {
  get(params?: Record<string, unknown>): T;
  run(params?: Record<string, unknown>): { changes: number };
}

interface BetterSqlite3Database {
  prepare<T = unknown>(sql: string): BetterSqlite3Statement<T>;
  close(): void;
}

function requireBetterSqlite3(path: string): BetterSqlite3Database {
  const require = createRequire(import.meta.url);
  const BetterSqlite3 = require("better-sqlite3") as new (
    path: string,
  ) => BetterSqlite3Database;
  return new BetterSqlite3(path);
}

export function createNodeSqliteConnection(path: string): SqliteConnection {
  const db = requireBetterSqlite3(path);

  return {
    prepare<T = unknown>(sql: string): SqliteStatement<T> {
      const stmt = db.prepare<T>(sql);
      return {
        get(params) {
          return params === undefined ? stmt.get() : stmt.get(params);
        },
        run(params) {
          return params === undefined ? stmt.run() : stmt.run(params);
        },
      };
    },
    close() {
      db.close();
    },
  };
}
