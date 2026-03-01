import { createRequire } from "node:module";
import type { SqliteConnection, SqliteStatement } from "./sqlite";

interface BunQuery<T = unknown> {
  get(params?: Record<string, unknown>): T;
  run(params?: Record<string, unknown>): { changes: number };
}

interface BunDatabase {
  query<T = unknown>(sql: string): BunQuery<T>;
  close(): void;
}

type BunDatabaseCtor = new (path: string) => BunDatabase;

function resolveBunDatabaseCtor(): BunDatabaseCtor {
  const require = createRequire(import.meta.url);
  const moduleExports = require("bun:sqlite") as { Database?: BunDatabaseCtor };
  const maybeCtor = moduleExports.Database;
  if (!maybeCtor) {
    throw new Error(
      "Bun runtime detected but bun:sqlite Database constructor is unavailable",
    );
  }
  return maybeCtor;
}

function normalizeBunParams(
  params?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!params) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    normalized[`$${key}`] = value;
  }
  return normalized;
}

function normalizeBunSql(sql: string): string {
  return sql.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name: string) => `$${name}`);
}

export function createBunSqliteConnection(path: string): SqliteConnection {
  const Database = resolveBunDatabaseCtor();
  const db = new Database(path);

  return {
    prepare<T = unknown>(sql: string): SqliteStatement<T> {
      const stmt = db.query<T>(normalizeBunSql(sql));
      return {
        get(params) {
          const normalized = normalizeBunParams(params);
          return normalized === undefined ? stmt.get() : stmt.get(normalized);
        },
        run(params) {
          const normalized = normalizeBunParams(params);
          return normalized === undefined ? stmt.run() : stmt.run(normalized);
        },
      };
    },
    close() {
      db.close();
    },
  };
}
