export const GET_TABLE_SCHEMA_SQL = `
  SELECT sql
  FROM sqlite_master
  WHERE type = 'table' AND name = 'cache_entries'
`;

export const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS cache_entries (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    ttl INTEGER NOT NULL,
    swr INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(namespace, key)
  )
`;

export const CREATE_EXPIRY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_cache_expiry ON cache_entries (created_at, ttl, swr)
`;

export const GET_SQL = `
  SELECT value, created_at, ttl, swr
  FROM cache_entries
  WHERE namespace = :namespace AND key = :key
`;

export const SET_SQL = `
  INSERT INTO cache_entries(namespace, key, value, created_at, ttl, swr)
  VALUES (:namespace, :key, :value, :created_at, :ttl, :swr)
  ON CONFLICT(namespace, key) DO UPDATE SET
    value = excluded.value,
    created_at = excluded.created_at,
    ttl = excluded.ttl,
    swr = excluded.swr
`;

export const DELETE_SQL = `
  DELETE FROM cache_entries
  WHERE namespace = :namespace AND key = :key
`;

export const DELETE_NAMESPACE_SQL = `
  DELETE FROM cache_entries
  WHERE namespace = :namespace
`;

export const CLEAR_SQL = `DELETE FROM cache_entries`;

export const PRUNE_SQL = `
  DELETE FROM cache_entries
  WHERE (created_at + ttl + swr) < :now
`;

export const COUNT_SQL = `
  SELECT COUNT(*) AS count FROM cache_entries
`;

export const COUNT_BY_NAMESPACE_SQL = `
  SELECT COUNT(*) AS count
  FROM cache_entries
  WHERE namespace = :namespace
`;

export const CREATE_MIGRATION_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS cache_entries_v2 (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    ttl INTEGER NOT NULL,
    swr INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(namespace, key)
  )
`;

export const COPY_LEGACY_ROWS_SQL = `
  INSERT INTO cache_entries_v2(namespace, key, value, created_at, ttl, swr)
  SELECT
    CASE
      WHEN instr(key, ':') > 0 THEN substr(key, 1, instr(key, ':') - 1)
      ELSE 'default'
    END AS namespace,
    CASE
      WHEN instr(key, ':') > 0 THEN substr(key, instr(key, ':') + 1)
      ELSE key
    END AS key,
    value,
    created_at,
    ttl,
    swr
  FROM cache_entries
`;

export const COPY_NAMESPACED_ROWS_SQL = `
  INSERT INTO cache_entries_v2(namespace, key, value, created_at, ttl, swr)
  SELECT namespace, key, value, created_at, ttl, swr
  FROM cache_entries
`;

export const DROP_LEGACY_TABLE_SQL = `DROP TABLE cache_entries`;
export const RENAME_MIGRATED_TABLE_SQL = `ALTER TABLE cache_entries_v2 RENAME TO cache_entries`;
