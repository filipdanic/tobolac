export type RuntimeKind = "bun" | "node";

export function detectRuntime(): RuntimeKind {
  return typeof Bun !== "undefined" ? "bun" : "node";
}
