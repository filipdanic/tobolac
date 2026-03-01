# Layer 2 SQLite Drivers

This folder uses a shared SQLite driver with small runtime adapters.

## File map

- `/adapter`:
  - `node-sqlite.ts`: Adapts `better-sqlite3` to the normalized adapter interface.
  - `bun-sqlite.ts`: Adapts Bun's SQLite API to the normalized adapter interface.
  - `sqlite.ts`: Normalized adapter interfaces (`SqliteConnection`, `SqliteStatement`) and row/blob normalization helpers.
- `/driver:`
  - `node-sqlite.ts`: Thin Node adapter with `createNodeSqliteConnection` called 
  - `bun-sqlite.ts`: Thin Bun wrapper with `createBunSqliteConnection` called
- `sqlite-driver.ts`: Single implementation of cache CRUD, pruning, counts, migration, and per-namespace LRU-cap enforcement.
- `sqlite-sql.ts`: Centralized SQL statements used by the shared driver.

## Data flow

1. `createCache()` selects Bun or Node runtime.
2. Runtime wrapper (`bun-sqlite.ts` / `node-sqlite.ts`) builds the runtime adapter.
3. `SqliteL2Driver` runs all cache operations through the normalized adapter.
4. SQL is sourced from `sqlite-sql.ts`, so behavior stays consistent across runtimes.

## Storage model

- A single shared SQLite table stores all namespaces.
- Primary key is `(namespace, key)` to avoid cross-namespace key collisions.
- Legacy single-key tables are migrated automatically on startup.

## Why this structure

- Avoids SQL/logic duplication between Bun and Node.
- Keeps runtime-specific code minimal and isolated.
- Makes behavior changes safer: update once in `sqlite-driver.ts` and `sqlite-sql.ts`.
