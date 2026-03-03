export interface SqliteStatement<T = unknown> {
  get(params?: Record<string, unknown>): T;
  run(params?: Record<string, unknown>): { changes: number };
}

export interface SqliteConnection {
  prepare<T = unknown>(sql: string): SqliteStatement<T>;
  close(): void;
}

export interface SqliteRawRow {
  value: Buffer | Uint8Array;
  created_at: number;
  ttl: number;
  swr: number;
}

export function normalizeBlobValue(value: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}
