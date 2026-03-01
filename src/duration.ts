import type { Duration } from "./types";

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
};

export function parseDuration(input: Duration | undefined, fallbackMs: number): number {
  if (input === undefined) {
    return fallbackMs;
  }

  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error(`Invalid duration number: ${input}`);
    }
    return input;
  }

  const match = DURATION_RE.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${input}`);
  }

  const value = Number(match[1]);
  const unit = match[2];
  return value * UNIT_TO_MS[unit];
}
