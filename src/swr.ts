import type { CacheEntry } from "./types";

export type EntryState = "fresh" | "stale" | "expired";

export function getEntryState(entry: Pick<CacheEntry, "createdAt" | "ttl" | "swr">, now: number): EntryState {
  const freshUntil = entry.createdAt + entry.ttl;
  if (now <= freshUntil) {
    return "fresh";
  }

  const staleUntil = freshUntil + entry.swr;
  if (entry.swr > 0 && now <= staleUntil) {
    return "stale";
  }

  return "expired";
}
