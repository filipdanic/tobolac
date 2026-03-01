import type { AnyNamespace, KeyBuilder, ParsedGetOrSetCall, ParsedSetCall } from "./internal-types";
import type { OperationOptions } from "../types";

const SINGLETON_NAMESPACE_KEY = "__namespace_singleton__";

export function isOperationOptions(value: unknown): value is OperationOptions {
  return (
    !!value &&
    typeof value === "object" &&
    ("ttl" in (value as object) || "swr" in (value as object))
  );
}

export function makeNamespaceKey(args: unknown[], keyBuilder?: KeyBuilder): string {
  if (args.length === 0) {
    return SINGLETON_NAMESPACE_KEY;
  }

  return keyBuilder ? keyBuilder(...args) : args.map((arg) => String(arg)).join(":");
}

export function getNamespaceKeyBuilder(namespace: AnyNamespace): KeyBuilder {
  return namespace.options.key as KeyBuilder;
}

export function parseGetOrSetCall(params: unknown[]): ParsedGetOrSetCall {
  if (params.length === 0) {
    throw new Error("getOrSet requires at least a factory function");
  }

  const last = params[params.length - 1];
  if (typeof last === "function") {
    return {
      factory: last as () => unknown | Promise<unknown>,
      keyArgs: params.slice(0, -1),
    };
  }

  const maybeFactory = params[params.length - 2];
  if (typeof maybeFactory !== "function") {
    throw new Error("getOrSet requires a factory function");
  }

  return {
    factory: maybeFactory as () => unknown | Promise<unknown>,
    keyArgs: params.slice(0, -2),
    options: isOperationOptions(last) ? (last as OperationOptions) : undefined,
  };
}

export function parseSetCall(params: unknown[]): ParsedSetCall {
  if (params.length === 0) {
    throw new Error("set requires key args and value");
  }

  if (params.length >= 2 && isOperationOptions(params[params.length - 1])) {
    return {
      keyArgs: params.slice(0, -2),
      value: params[params.length - 2],
      options: params[params.length - 1] as OperationOptions,
    };
  }

  return {
    keyArgs: params.slice(0, -1),
    value: params[params.length - 1],
  };
}
