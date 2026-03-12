import { describe, expect, it } from "vitest";
import { detectRuntime } from "../src/utils/detect";

describe("detectRuntime", () => {
  it("detects the active runtime", () => {
    const expected = typeof Bun !== "undefined" ? "bun" : "node";
    expect(detectRuntime()).toBe(expected);
  });
});
