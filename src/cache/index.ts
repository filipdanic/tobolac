import { createGlobalApi, createNamespaceApi } from "./builders";
import { createRuntimeDeps, resolveGlobalSettings, resolveRuntimeSettings } from "./runtime";
import type { CacheApi, CacheOptions, NamespacesShape } from "../types";
import type { AnyNamespace } from "./internal-types";

export function createCache<S extends NamespacesShape>(
  options: CacheOptions<S>,
): CacheApi<S> {
  const settings = resolveGlobalSettings(
    options as CacheOptions<NamespacesShape>,
  );
  const runtimeSettings = resolveRuntimeSettings(
    options as CacheOptions<NamespacesShape>,
  );
  const deps = createRuntimeDeps(
    options as CacheOptions<NamespacesShape>,
    settings,
    runtimeSettings,
  );

  const pruneTimer = setInterval(() => {
    deps.layer2.prune(Date.now());
  }, runtimeSettings.pruneInterval);
  pruneTimer.unref?.();

  const result: Record<string, unknown> = {};
  for (const [namespaceName, namespaceDef] of Object.entries(
    options.namespaces,
  )) {
    result[namespaceName] = createNamespaceApi(
      deps,
      namespaceName,
      namespaceDef as AnyNamespace,
    );
  }

  const globalApi = createGlobalApi(deps, Object.keys(options.namespaces));
  result.clear = globalApi.clear;
  result.stats = globalApi.stats;
  result.close = async () => {
    clearInterval(pruneTimer);
    await globalApi.close();
  };

  return result as CacheApi<S>;
}
