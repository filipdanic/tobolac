export type Duration = `${number}${"ms" | "s" | "m" | "h" | "d"}` | number;

export interface CacheEntry {
  value: Buffer;
  createdAt: number;
  ttl: number;
  swr: number;
  lastAccessedAt: number;
}

export interface CacheDriver {
  get(namespace: string, key: string): CacheEntry | null;
  set(namespace: string, key: string, entry: CacheEntry): void;
  delete(namespace: string, key: string): boolean;
  deleteNamespace(namespace: string): void;
  clear(): void;
  prune(now?: number): number;
  close(): void;
  count(): number;
  countByNamespace(namespace: string): number;
}

export type EvictionReason = "ttl" | "lru" | "manual";

export interface CacheStatsSnapshot {
  hits: number;
  misses: number;
  stales: number;
  evictions: {
    ttl: number;
    lru: number;
    manual: number;
  };
  hitRate: number;
}

export type StatsAccessor = (() => CacheStatsSnapshot) & { reset(): void };

export interface OperationOptions {
  ttl?: Duration;
  swr?: Duration;
}

export interface Layer1Options {
  maxItems?: number;
}

export interface Layer2Options {
  maxItems?: number;
}

export interface NamespaceOptions<T, Args extends unknown[] = unknown[]> extends OperationOptions {
  layer1?: Layer1Options;
  layer2?: Layer2Options;
  schema?: { parse(value: unknown): T };
  key?: (...args: Args) => string;
}

export interface NamespaceDefinition<T, Args extends unknown[] = []> {
  readonly __kind: "namespace";
  readonly options: NamespaceOptions<T, Args>;
}

export type NamespacesShape = Record<string, NamespaceDefinition<any, any[]>>;

export interface NamespaceApi<T, Args extends unknown[]> {
  getOrSet: (
    ...params: [...args: Args, factory: () => T | Promise<T>, options?: OperationOptions]
  ) => Promise<T>;
  get: (...args: Args) => Promise<T | null>;
  set: (...params: [...args: Args, value: T, options?: OperationOptions]) => Promise<void>;
  delete: (...args: Args) => Promise<boolean>;
  clear: () => Promise<void>;
  stats: StatsAccessor;
}

export type CacheApi<S extends NamespacesShape> = {
  [K in keyof S]: S[K] extends NamespaceDefinition<infer T, infer A> ? NamespaceApi<T, A> : never;
} & {
  clear: () => Promise<void>;
  stats: StatsAccessor;
  close: () => Promise<void>;
};

export interface GlobalConfig extends OperationOptions {
  layer1?: Layer1Options;
  layer2?: Layer2Options;
  sqlite?: {
    path?: string;
    pruneInterval?: Duration;
  };
}

export interface CacheOptions<S extends NamespacesShape> {
  namespaces: S;
  globalConfig?: GlobalConfig;
  serializer?: "json";
  onRevalidateError?: (namespaceName: string, key: string, error: unknown) => void;
  onValidationError?: (namespaceName: string, key: string, error: unknown) => void;
  onEvict?: (namespaceName: string, key: string, reason: EvictionReason) => void;
  driver?: CacheDriver;
}

export interface DriverWithNamespaceMaxItems extends CacheDriver {
  enforceMaxItemsForNamespace(namespace: string, maxItems: number): number;
}
