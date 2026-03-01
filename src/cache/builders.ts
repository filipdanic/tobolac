import { getNamespaceKeyBuilder, makeNamespaceKey, parseGetOrSetCall, parseSetCall } from "./key";
import { readFromLayers, resolveNamespaceSettings, writeToLayers } from "./layers";
import type { AnyNamespace, CacheRuntimeDeps } from "./internal-types";

export function createNamespaceApi(
  deps: CacheRuntimeDeps,
  namespaceName: string,
  namespace: AnyNamespace,
) {
  const keyBuilder = getNamespaceKeyBuilder(namespace);

  const get = async (...args: unknown[]) => {
    const namespaceKey = makeNamespaceKey(args, keyBuilder);
    const cached = readFromLayers(deps, namespaceName, namespace, namespaceKey);

    if (!cached) {
      deps.stats.miss(namespaceName);
      return null;
    }

    deps.stats.hit(namespaceName);
    return cached.value;
  };

  const getOrSet = async (...params: unknown[]) => {
    const parsed = parseGetOrSetCall(params);
    const namespaceKey = makeNamespaceKey(parsed.keyArgs, keyBuilder);
    const stampedeKey = `${namespaceName}:${namespaceKey}`;

    const cached = readFromLayers(deps, namespaceName, namespace, namespaceKey);
    if (cached) {
      deps.stats.hit(namespaceName);

      if (cached.state === "stale") {
        deps.stats.stale(namespaceName);
        void deps.stampede
          .run(stampedeKey, async () => {
            try {
              const refreshed = await Promise.resolve(parsed.factory());
              const effectiveSettings = resolveNamespaceSettings(
                namespace,
                deps.globalSettings,
                parsed.options,
              );
              writeToLayers(deps, namespaceName, namespaceKey, refreshed, effectiveSettings);
              return refreshed;
            } catch (error) {
              deps.options.onRevalidateError?.(namespaceName, namespaceKey, error);
              throw error;
            }
          })
          .catch(() => {
            // handled by callback for observability; stale value remains available within SWR window
          });
      }

      return cached.value;
    }

    deps.stats.miss(namespaceName);

    return deps.stampede.run(stampedeKey, async () => {
      const effectiveSettings = resolveNamespaceSettings(
        namespace,
        deps.globalSettings,
        parsed.options,
      );
      const value = await Promise.resolve(parsed.factory());
      writeToLayers(deps, namespaceName, namespaceKey, value, effectiveSettings);
      return value;
    });
  };

  const set = async (...params: unknown[]) => {
    const parsed = parseSetCall(params);
    const namespaceKey = makeNamespaceKey(parsed.keyArgs, keyBuilder);
    const effectiveSettings = resolveNamespaceSettings(
      namespace,
      deps.globalSettings,
      parsed.options,
    );

    writeToLayers(deps, namespaceName, namespaceKey, parsed.value, effectiveSettings);
  };

  const del = async (...args: unknown[]) => {
    const namespaceKey = makeNamespaceKey(args, keyBuilder);
    const layer1 = deps.layer1ByNamespace.get(namespaceName);
    if (!layer1) {
      throw new Error(`Missing Layer 1 cache for namespace "${namespaceName}"`);
    }

    const l1Deleted = layer1.delete(namespaceKey);
    const l2Deleted = deps.layer2.delete(namespaceName, namespaceKey);

    if (l1Deleted || l2Deleted) {
      deps.stats.eviction(namespaceName, "manual");
      deps.options.onEvict?.(namespaceName, namespaceKey, "manual");
    }

    return l1Deleted || l2Deleted;
  };

  const clear = async () => {
    const layer1 = deps.layer1ByNamespace.get(namespaceName);
    if (!layer1) {
      throw new Error(`Missing Layer 1 cache for namespace "${namespaceName}"`);
    }

    const l2Count = deps.layer2.countByNamespace(namespaceName);
    const l1Count = layer1.count();
    layer1.clear();
    deps.layer2.deleteNamespace(namespaceName);

    const total = Math.max(l2Count, l1Count);
    for (let i = 0; i < total; i += 1) {
      deps.stats.eviction(namespaceName, "manual");
    }
    if (total > 0) {
      deps.options.onEvict?.(namespaceName, namespaceName, "manual");
    }
  };

  return {
    get,
    getOrSet,
    set,
    delete: del,
    clear,
    stats: deps.stats.namespaceAccessor(namespaceName),
  };
}

export function createGlobalApi(deps: CacheRuntimeDeps, namespaceNames: string[]) {
  const clear = async () => {
    for (const namespaceName of namespaceNames) {
      const layer1 = deps.layer1ByNamespace.get(namespaceName);
      const layer1Count = layer1?.count() ?? 0;
      const layer2Count = deps.layer2.countByNamespace(namespaceName);
      const total = Math.max(layer1Count, layer2Count);

      layer1?.clear();

      for (let i = 0; i < total; i += 1) {
        deps.stats.eviction(namespaceName, "manual");
      }
    }

    deps.layer2.clear();
  };

  const close = async () => {
    deps.layer2.close();
  };

  return {
    clear,
    close,
    stats: deps.stats.globalAccessor(),
  };
}
