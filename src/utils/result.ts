import type { CacheErr, CacheErrorKind, CacheResult } from "../types";

export function ok<T>(value: T): CacheResult<T> {
  return { ok: true, value };
}

export function err(
  kind: CacheErrorKind,
  message: string,
  details?: { cause?: unknown; namespace?: string; key?: string },
): CacheErr {
  return {
    ok: false,
    error: {
      kind,
      message,
      cause: details?.cause,
      namespace: details?.namespace,
      key: details?.key,
    },
  };
}

export function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return fallback;
}
