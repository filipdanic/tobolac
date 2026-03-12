import { describe, expect, it } from "vitest";
import { parseDuration } from "../src/utils/duration";

describe("parseDuration", () => {
  it("parses supported units", () => {
    expect(parseDuration("100ms", 0)).toBe(100);
    expect(parseDuration("5s", 0)).toBe(5000);
    expect(parseDuration("2m", 0)).toBe(120000);
    expect(parseDuration("1h", 0)).toBe(3600000);
    expect(parseDuration("1d", 0)).toBe(86400000);
  });

  it("returns fallback for undefined", () => {
    expect(parseDuration(undefined, 123)).toBe(123);
  });

  it("rejects invalid format", () => {
    expect(() => parseDuration("1h30m" as never, 0)).toThrowError();
    expect(() => parseDuration("abc" as never, 0)).toThrowError();
  });
});
