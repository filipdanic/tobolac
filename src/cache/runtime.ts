import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { detectRuntime } from "../detect";
import { parseDuration } from "../duration";
import { MemoryCache } from "../layer1/memory";
import { BunSqliteDriver } from "../layer2/driver/bun-sqlite";
import { NodeSqliteDriver } from "../layer2/driver/node-sqlite";
import { jsonSerializer } from "../serializer";
import { StampedeGuard } from "../stampede";
import { StatsTracker } from "../stats";
import type { CacheDriver, CacheOptions, NamespacesShape } from "../types";
import type {
  CacheRuntimeDeps,
  GlobalResolvedSettings,
  RuntimeResolvedSettings,
} from "./internal-types";

const DEFAULT_GLOBAL_TTL = "10m";
const DEFAULT_PRUNE_INTERVAL = "5m";
const DEFAULT_LAYER1_MAX_ITEMS = 1_000;
const DEFAULT_LAYER2_MAX_ITEMS = 20_000;

function resolveDriver(options: CacheOptions<NamespacesShape>): CacheDriver {
  if (options.driver) {
    return options.driver;
  }

  const runtime = detectRuntime();
  const path = options.globalConfig?.sqlite?.path ?? ".cache/cache.db";
  mkdirSync(dirname(path), { recursive: true });

  if (runtime === "bun") {
    return new BunSqliteDriver(path);
  }

  return new NodeSqliteDriver(path);
}

export function resolveGlobalSettings(
  options: CacheOptions<NamespacesShape>,
): GlobalResolvedSettings {
  return {
    ttl: parseDuration(
      options.globalConfig?.ttl,
      parseDuration(DEFAULT_GLOBAL_TTL, 600_000),
    ),
    swr: parseDuration(options.globalConfig?.swr, 0),
    layer1MaxItems:
      options.globalConfig?.layer1?.maxItems ?? DEFAULT_LAYER1_MAX_ITEMS,
    layer2MaxItems:
      options.globalConfig?.layer2?.maxItems ?? DEFAULT_LAYER2_MAX_ITEMS,
  };
}

export function resolveRuntimeSettings(
  options: CacheOptions<NamespacesShape>,
): RuntimeResolvedSettings {
  return {
    pruneInterval: parseDuration(
      options.globalConfig?.sqlite?.pruneInterval,
      parseDuration(DEFAULT_PRUNE_INTERVAL, 300_000),
    ),
  };
}

export function createRuntimeDeps(
  options: CacheOptions<NamespacesShape>,
  globalSettings: GlobalResolvedSettings,
  runtimeSettings: RuntimeResolvedSettings,
): CacheRuntimeDeps {
  const stats = new StatsTracker();
  const layer2 = resolveDriver(options);
  const layer1ByNamespace = new Map<string, MemoryCache>();

  for (const [namespaceName, namespaceDef] of Object.entries(
    options.namespaces,
  )) {
    const maxItems =
      namespaceDef.options.layer1?.maxItems ?? globalSettings.layer1MaxItems;
    layer1ByNamespace.set(
      namespaceName,
      new MemoryCache(maxItems, (namespaceKey) => {
        stats.eviction(namespaceName, "lru");
        options.onEvict?.(namespaceName, namespaceKey, "lru");
      }),
    );
  }

  return {
    layer2,
    layer1ByNamespace,
    stats,
    stampede: new StampedeGuard(),
    serializer: jsonSerializer,
    options,
    globalSettings,
    runtimeSettings,
  };
}
