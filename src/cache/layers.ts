import { parseDuration } from "../duration";
import { getEntryState } from "../swr";
import type {
  CacheEntry,
  NamespaceDefinition,
  OperationOptions,
} from "../types";
import type {
  AnyNamespace,
  CacheRuntimeDeps,
  GlobalResolvedSettings,
  NamespaceResolvedSettings,
} from "./internal-types";

export function resolveNamespaceSettings(
  namespace: AnyNamespace,
  globalSettings: GlobalResolvedSettings,
  callOverrides?: OperationOptions,
): NamespaceResolvedSettings {
  const namespaceTtl = parseDuration(namespace.options.ttl, globalSettings.ttl);
  const namespaceSwr = parseDuration(namespace.options.swr, globalSettings.swr);

  return {
    ttl: parseDuration(callOverrides?.ttl, namespaceTtl),
    swr: parseDuration(callOverrides?.swr, namespaceSwr),
    layer1MaxItems:
      namespace.options.layer1?.maxItems ?? globalSettings.layer1MaxItems,
  };
}

function getNamespaceLayer1(deps: CacheRuntimeDeps, namespaceName: string) {
  const layer1 = deps.layer1ByNamespace.get(namespaceName);
  if (!layer1) {
    throw new Error(`Missing Layer 1 cache for namespace "${namespaceName}"`);
  }
  return layer1;
}

export function readFromLayers<T>(
  deps: CacheRuntimeDeps,
  namespaceName: string,
  namespace: NamespaceDefinition<T, unknown[]>,
  namespaceKey: string,
): { state: "fresh" | "stale"; value: T; source: "layer1" | "layer2" } | null {
  const now = Date.now();
  const layer1 = getNamespaceLayer1(deps, namespaceName);

  const layer1Entry = layer1.get(namespaceKey);
  if (layer1Entry) {
    const state = getEntryState(layer1Entry, now);
    if (state === "expired") {
      layer1.delete(namespaceKey);
      deps.stats.eviction(namespaceName, "ttl");
      deps.options.onEvict?.(namespaceName, namespaceKey, "ttl");
    } else {
      return {
        state,
        value: deps.serializer.deserialize<T>(layer1Entry.value),
        source: "layer1",
      };
    }
  }

  const l2Entry = deps.layer2.get(namespaceName, namespaceKey);
  if (!l2Entry) {
    return null;
  }

  const state = getEntryState(l2Entry, now);
  if (state === "expired") {
    deps.layer2.delete(namespaceName, namespaceKey);
    deps.stats.eviction(namespaceName, "ttl");
    deps.options.onEvict?.(namespaceName, namespaceKey, "ttl");
    return null;
  }

  const deserialized = deps.serializer.deserialize<unknown>(l2Entry.value);
  let validated = deserialized;

  if (namespace.options.schema) {
    try {
      validated = namespace.options.schema.parse(deserialized);
    } catch (error) {
      deps.options.onValidationError?.(namespaceName, namespaceKey, error);
      deps.layer2.delete(namespaceName, namespaceKey);
      return null;
    }
  }

  layer1.set(namespaceKey, l2Entry);

  return {
    state,
    value: validated as T,
    source: "layer2",
  };
}

export function writeToLayers<T>(
  deps: CacheRuntimeDeps,
  namespaceName: string,
  namespaceKey: string,
  value: T,
  effectiveSettings: NamespaceResolvedSettings,
): void {
  const now = Date.now();
  const layer1 = getNamespaceLayer1(deps, namespaceName);
  const entry: CacheEntry = {
    value: deps.serializer.serialize(value),
    createdAt: now,
    ttl: effectiveSettings.ttl,
    swr: effectiveSettings.swr,
    lastAccessedAt: now,
  };

  layer1.set(namespaceKey, entry);
  deps.layer2.set(namespaceName, namespaceKey, entry);
}
