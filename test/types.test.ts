import { describe, expectTypeOf, it } from "vitest";
import { createCache, namespace, type CacheResult } from "../src";

describe("type inference", () => {
  it("infers namespace value and args", async () => {
    const reportNamespace = namespace.type<{ id: string }>();

    const cacheResult = createCache({
      namespaces: {
        user: namespace<{ name: string }, [id: string]>({ ttl: "1m" }),
        reports: reportNamespace<[region: string]>({ ttl: "1m" }),
        singleton: namespace<number>({ ttl: "1m" }),
        userByFactoryGetter: namespace<{ id: string }, [id: string]>({
          ttl: "1m",
          factoryGetter: (id) => ({ id }),
        }),
      },
      globalConfig: {
        layer1: { maxItems: 500 },
      },
      driver: {
        get: () => null,
        set: () => undefined,
        delete: () => false,
        deleteNamespace: () => undefined,
        clear: () => undefined,
        prune: () => 0,
        close: () => undefined,
        count: () => 0,
        countByNamespace: () => 0,
      },
    });

    if (!cacheResult.ok) {
      return;
    }

    const cache = cacheResult.value;
    const user = await cache.user.getOrSet("u1", () => ({ name: "Ada" }));
    const singleton = await cache.singleton.getOrSet(() => 1);
    const report = await cache.reports.getOrSet("eu", () => ({ id: "r1" }));
    const userFromGetter = await cache.userByFactoryGetter.getOrSet("u1");

    if (false) {
      // @ts-expect-error user namespace does not define factoryGetter
      cache.user.getOrSet("u1");
    }

    expectTypeOf(user).toEqualTypeOf<CacheResult<{ name: string }>>();
    expectTypeOf(singleton).toEqualTypeOf<CacheResult<number>>();
    expectTypeOf(report).toEqualTypeOf<CacheResult<{ id: string }>>();
    expectTypeOf(userFromGetter).toEqualTypeOf<CacheResult<{ id: string }>>();
  });
});
