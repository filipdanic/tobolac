import { describe, expect, it, vi } from "vitest";
import { createCache, namespace } from "../src";
import { InMemoryDriver } from "./helpers/in-memory-driver";

async function flushMicrotasks(times: number = 3): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

describe("cache core behavior", () => {
  it("runs getOrSet miss->hit cycle", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
      },
    });

    const factory = vi.fn(async () => ({ id: "u1" }));

    const first = await cache.user.getOrSet("u1", factory);
    const second = await cache.user.getOrSet("u1", factory);

    expect(first).toEqual({ id: "u1" });
    expect(second).toEqual({ id: "u1" });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("uses namespace factoryGetter when getOrSet factory is omitted", async () => {
    const driver = new InMemoryDriver();
    const factoryGetter = vi.fn(async (id: string) => ({ id }));
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({
          ttl: "1m",
          factoryGetter,
        }),
      },
    });

    const first = await cache.user.getOrSet("u1");
    const second = await cache.user.getOrSet("u1");

    expect(first).toEqual({ id: "u1" });
    expect(second).toEqual({ id: "u1" });
    expect(factoryGetter).toHaveBeenCalledTimes(1);
    expect(factoryGetter).toHaveBeenCalledWith("u1");
  });

  it("prefers call factory over namespace factoryGetter", async () => {
    const driver = new InMemoryDriver();
    const factoryGetter = vi.fn(async () => ({ id: "from-default" }));
    const callFactory = vi.fn(async () => ({ id: "from-call" }));
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({
          ttl: "1m",
          factoryGetter,
        }),
      },
    });

    const value = await cache.user.getOrSet("u1", callFactory);

    expect(value).toEqual({ id: "from-call" });
    expect(callFactory).toHaveBeenCalledTimes(1);
    expect(factoryGetter).not.toHaveBeenCalled();
  });

  it("throws when no call factory or namespace factoryGetter is available", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
      },
    });

    await expect(
      (cache.user.getOrSet as (...params: unknown[]) => Promise<unknown>)("u1"),
    ).rejects.toThrow(
      "getOrSet requires a factory function or namespace factoryGetter",
    );
  });

  it("supports set/get/delete", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
      },
    });

    await cache.user.set("u1", { id: "u1" });
    await expect(cache.user.get("u1")).resolves.toEqual({ id: "u1" });

    await cache.user.delete("u1");
    await expect(cache.user.get("u1")).resolves.toBeNull();
  });

  it("clears only one namespace on namespace.clear", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
        post: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
      },
    });

    await cache.user.set("u1", { id: "u1" });
    await cache.post.set("p1", { id: "p1" });

    await cache.user.clear();

    await expect(cache.user.get("u1")).resolves.toBeNull();
    await expect(cache.post.get("p1")).resolves.toEqual({ id: "p1" });
  });

  it("deduplicates concurrent miss factories", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        value: namespace<number, [key: string]>({ ttl: "1m" }),
      },
    });

    const factory = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return 42;
    });

    const results = await Promise.all([
      cache.value.getOrSet("k1", factory),
      cache.value.getOrSet("k1", factory),
      cache.value.getOrSet("k1", factory),
    ]);

    expect(results).toEqual([42, 42, 42]);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("serves stale value and performs background SWR revalidation", async () => {
    vi.useFakeTimers();
    try {
      const driver = new InMemoryDriver();
      const cache = createCache({
        driver,
        namespaces: {
          value: namespace<number, [key: string]>({ ttl: "10ms", swr: "1s" }),
        },
      });

      await cache.value.set("k1", 1);
      vi.advanceTimersByTime(20);

      const factory = vi.fn(async () => 2);
      const staleValue = await cache.value.getOrSet("k1", factory);
      await flushMicrotasks();

      expect(staleValue).toBe(1);
      expect(factory).toHaveBeenCalledTimes(1);
      await expect(cache.value.get("k1")).resolves.toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps serving stale value on revalidation failure until SWR expires", async () => {
    vi.useFakeTimers();
    try {
      const onRevalidateError = vi.fn();
      const driver = new InMemoryDriver();
      const cache = createCache({
        driver,
        onRevalidateError,
        namespaces: {
          value: namespace<number, [key: string]>({
            ttl: "10ms",
            swr: "100ms",
          }),
        },
      });

      await cache.value.set("k1", 1);
      vi.advanceTimersByTime(20);

      await expect(
        cache.value.getOrSet("k1", async () => {
          throw new Error("boom");
        }),
      ).resolves.toBe(1);

      await flushMicrotasks();
      expect(onRevalidateError).toHaveBeenCalledTimes(1);

      await expect(cache.value.get("k1")).resolves.toBe(1);
      vi.advanceTimersByTime(200);
      await expect(cache.value.get("k1")).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalid schema data in L2 triggers callback and refetch", async () => {
    const driver = new InMemoryDriver();
    const onValidationError = vi.fn();
    const schema = {
      parse(v: unknown) {
        if (
          !v ||
          typeof v !== "object" ||
          typeof (v as { id?: unknown }).id !== "number"
        ) {
          throw new Error("invalid");
        }
        return v as { id: number };
      },
    };

    const cacheA = createCache({
      driver,
      namespaces: {
        item: namespace<{ id: number }, [id: string]>({ ttl: "1m" }),
      },
    });

    await cacheA.item.set("a", { id: "bad" } as unknown as { id: number });

    const cacheB = createCache({
      driver,
      onValidationError,
      namespaces: {
        item: namespace<{ id: number }, [id: string]>({ ttl: "1m", schema }),
      },
    });

    const factory = vi.fn(async () => ({ id: 1 }));
    const value = await cacheB.item.getOrSet("a", factory);

    expect(value).toEqual({ id: 1 });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(onValidationError).toHaveBeenCalledTimes(1);
  });

  it("tracks stats and reset", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
      },
    });

    await cache.user.get("u1");
    await cache.user.getOrSet("u1", async () => ({ id: "u1" }));
    await cache.user.get("u1");

    const namespaceStats = cache.user.stats();
    expect(namespaceStats.misses).toBe(2);
    expect(namespaceStats.hits).toBe(1);

    cache.user.stats.reset();
    expect(cache.user.stats().hits).toBe(0);
    expect(cache.user.stats().misses).toBe(0);
  });

  it("fires L1 LRU eviction callback when maxItems is exceeded", async () => {
    const onEvict = vi.fn();
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      onEvict,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({
          ttl: "1m",
          layer1: { maxItems: 1 },
        }),
      },
    });

    await cache.user.set("u1", { id: "u1" });
    await cache.user.set("u2", { id: "u2" });

    expect(onEvict).toHaveBeenCalledWith("user", "u1", "lru");
  });

  it("isolates Layer 2 keys by namespace when key args are identical", async () => {
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      namespaces: {
        user: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
        post: namespace<{ id: string }, [id: string]>({ ttl: "1m" }),
      },
    });

    await cache.user.set("same", { id: "u1" });
    await cache.post.set("same", { id: "p1" });

    await expect(cache.user.get("same")).resolves.toEqual({ id: "u1" });
    await expect(cache.post.get("same")).resolves.toEqual({ id: "p1" });
  });

  it("uses globalConfig defaults for namespace layer settings", async () => {
    const onEvict = vi.fn();
    const driver = new InMemoryDriver();
    const cache = createCache({
      driver,
      onEvict,
      globalConfig: {
        ttl: "1m",
        layer1: { maxItems: 1 },
      },
      namespaces: {
        user: namespace<{ id: string }, [id: string]>(),
      },
    });

    await cache.user.set("u1", { id: "u1" });
    await cache.user.set("u2", { id: "u2" });

    expect(onEvict).toHaveBeenCalledWith("user", "u1", "lru");
  });
});
