import { MemoryCache } from "../layer1/memory";
import { jsonSerializer } from "../serializer";
import { StampedeGuard } from "../stampede";
import { StatsTracker } from "../stats";
import type {
  CacheDriver,
  CacheOptions,
  NamespaceDefinition,
  NamespacesShape,
  OperationOptions,
} from "../types";

export type AnyNamespace = NamespaceDefinition<unknown, unknown[]>;
export type KeyBuilder = ((...args: unknown[]) => string) | undefined;

export interface NamespaceResolvedSettings {
  ttl: number;
  swr: number;
  layer1MaxItems: number;
}

export interface GlobalResolvedSettings {
  ttl: number;
  swr: number;
  layer1MaxItems: number;
}

export interface RuntimeResolvedSettings {
  pruneInterval: number;
}

export interface CacheRuntimeDeps {
  layer2: CacheDriver;
  layer1ByNamespace: Map<string, MemoryCache>;
  stats: StatsTracker;
  stampede: StampedeGuard;
  serializer: typeof jsonSerializer;
  options: CacheOptions<NamespacesShape>;
  globalSettings: GlobalResolvedSettings;
  runtimeSettings: RuntimeResolvedSettings;
}

export interface ParsedGetOrSetCall {
  keyArgs: unknown[];
  factory: () => unknown | Promise<unknown>;
  options?: OperationOptions;
}

export interface ParsedSetCall {
  keyArgs: unknown[];
  value: unknown;
  options?: OperationOptions;
}
