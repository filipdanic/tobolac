import {
  getNamespaceKeyBuilder,
  makeNamespaceKey,
  parseGetOrSetCall,
  parseSetCall,
} from "./key";
import {
  readFromLayers,
  resolveNamespaceSettings,
  writeToLayers,
} from "./layers";
import { err, ok, toMessage } from "../utils/result";
import type { AnyNamespace, CacheRuntimeDeps } from "./internal-types";

export function createNamespaceApi(
  deps: CacheRuntimeDeps,
  namespaceName: string,
  namespace: AnyNamespace,
) {
  const keyBuilder = getNamespaceKeyBuilder(namespace);

  const get = async (...args: unknown[]) => {
    try {
      const namespaceKey = makeNamespaceKey(args, keyBuilder);
      const cached = readFromLayers(
        deps,
        namespaceName,
        namespace,
        namespaceKey,
      );

      if (cached.status === "error") {
        return err(cached.error.kind, cached.error.message, {
          cause: cached.error.cause,
          namespace: namespaceName,
          key: namespaceKey,
        });
      }

      if (cached.status === "miss") {
        deps.stats.miss(namespaceName);
        return ok(undefined);
      }

      deps.stats.hit(namespaceName);
      return ok(cached.value);
    } catch (error) {
      return err("runtime", toMessage(error, "Cache get failed"), {
        cause: error,
        namespace: namespaceName,
      });
    }
  };

  const getOrSet = async (...params: unknown[]) => {
    try {
      const parsed = parseGetOrSetCall(
        params,
        namespace.options.factoryGetter as
          | ((...keyArgs: unknown[]) => unknown | Promise<unknown>)
          | undefined,
      );
      const namespaceKey = makeNamespaceKey(parsed.keyArgs, keyBuilder);

      const cached = readFromLayers(
        deps,
        namespaceName,
        namespace,
        namespaceKey,
      );
      if (cached.status === "error") {
        return err(cached.error.kind, cached.error.message, {
          cause: cached.error.cause,
          namespace: namespaceName,
          key: namespaceKey,
        });
      }

      if (cached.status === "hit") {
        deps.stats.hit(namespaceName);

        if (cached.state === "stale") {
          deps.stats.stale(namespaceName);
          const stampedeKey = `${namespaceName}:${namespaceKey}`;
          if (!deps.stampede.has(stampedeKey)) {
            void deps.stampede.run(stampedeKey, async () => {
              try {
                const refreshed = await Promise.resolve(parsed.factory());
                const effectiveSettings = resolveNamespaceSettings(
                  namespace,
                  deps.globalSettings,
                  parsed.options,
                );
                writeToLayers(
                  deps,
                  namespaceName,
                  namespaceKey,
                  refreshed,
                  effectiveSettings,
                );
                return refreshed;
              } catch (error) {
                deps.options.onRevalidateError?.(
                  namespaceName,
                  namespaceKey,
                  error,
                );
                return cached.value;
              }
            });
          }
        }

        return ok(cached.value);
      }

      deps.stats.miss(namespaceName);

      const stampedeKey = `${namespaceName}:${namespaceKey}`;
      try {
        const value = await deps.stampede.run(stampedeKey, async () => {
          const effectiveSettings = resolveNamespaceSettings(
            namespace,
            deps.globalSettings,
            parsed.options,
          );
          const refreshed = await Promise.resolve(parsed.factory());
          writeToLayers(
            deps,
            namespaceName,
            namespaceKey,
            refreshed,
            effectiveSettings,
          );
          return refreshed;
        });
        return ok(value);
      } catch (error) {
        return err("factory", toMessage(error, "Cache factory failed"), {
          cause: error,
          namespace: namespaceName,
          key: namespaceKey,
        });
      }
    } catch (error) {
      const message = toMessage(error, "Invalid getOrSet arguments");
      const kind = message.includes("requires a factory")
        ? "invalid-args"
        : "runtime";
      return err(kind, message, {
        cause: error,
        namespace: namespaceName,
      });
    }
  };

  const set = async (...params: unknown[]) => {
    try {
      const parsed = parseSetCall(params);
      const namespaceKey = makeNamespaceKey(parsed.keyArgs, keyBuilder);
      const effectiveSettings = resolveNamespaceSettings(
        namespace,
        deps.globalSettings,
        parsed.options,
      );

      writeToLayers(
        deps,
        namespaceName,
        namespaceKey,
        parsed.value,
        effectiveSettings,
      );

      return ok(undefined);
    } catch (error) {
      const message = toMessage(error, "Cache set failed");
      const kind = message.includes("set requires")
        ? "invalid-args"
        : "runtime";
      return err(kind, message, {
        cause: error,
        namespace: namespaceName,
      });
    }
  };

  const del = async (...args: unknown[]) => {
    try {
      const namespaceKey = makeNamespaceKey(args, keyBuilder);
      const layer1 = deps.layer1ByNamespace.get(namespaceName);
      if (!layer1) {
        return err(
          "runtime",
          `Missing Layer 1 cache for namespace "${namespaceName}"`,
          {
            namespace: namespaceName,
            key: namespaceKey,
          },
        );
      }

      const layer1Deleted = layer1.delete(namespaceKey);
      const layer2Deleted = deps.layer2.delete(namespaceName, namespaceKey);

      if (layer1Deleted || layer2Deleted) {
        deps.stats.eviction(namespaceName, "manual");
        deps.options.onEvict?.(namespaceName, namespaceKey, "manual");
      }

      return ok(layer1Deleted || layer2Deleted);
    } catch (error) {
      return err("runtime", toMessage(error, "Cache delete failed"), {
        cause: error,
        namespace: namespaceName,
      });
    }
  };

  const clear = async () => {
    try {
      const layer1 = deps.layer1ByNamespace.get(namespaceName);
      if (!layer1) {
        return err(
          "runtime",
          `Missing Layer 1 cache for namespace "${namespaceName}"`,
          {
            namespace: namespaceName,
          },
        );
      }

      const layer2Count = deps.layer2.countByNamespace(namespaceName);
      const layer1Count = layer1.count();
      layer1.clear();
      deps.layer2.deleteNamespace(namespaceName);

      const total = Math.max(layer2Count, layer1Count);
      for (let i = 0; i < total; i += 1) {
        deps.stats.eviction(namespaceName, "manual");
      }
      if (total > 0) {
        deps.options.onEvict?.(namespaceName, namespaceName, "manual");
      }

      return ok(undefined);
    } catch (error) {
      return err("runtime", toMessage(error, "Cache clear failed"), {
        cause: error,
        namespace: namespaceName,
      });
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

export function createGlobalApi(
  deps: CacheRuntimeDeps,
  namespaceNames: string[],
) {
  const clear = async () => {
    try {
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
      return ok(undefined);
    } catch (error) {
      return err("runtime", toMessage(error, "Cache clear failed"), {
        cause: error,
      });
    }
  };

  const close = async () => {
    try {
      deps.layer2.close();
      return ok(undefined);
    } catch (error) {
      return err("runtime", toMessage(error, "Cache close failed"), {
        cause: error,
      });
    }
  };

  return {
    clear,
    close,
    stats: deps.stats.globalAccessor(),
  };
}
