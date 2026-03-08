import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createCache, type CacheResult, namespace } from "../src";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTempDbPath(): string {
  const suffix = randomBytes(6).toString("hex");
  return `.cache/integration-${Date.now()}-${process.pid}-${suffix}.db`;
}

function cleanupDbFiles(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

function expectOk<T>(result: CacheResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe("black-box cache integration", () => {
  it("persists values across cache instances and isolates namespaces", async () => {
    const dbPath = createTempDbPath();

    try {
      const cacheA = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            users: namespace<{ id: string }, [id: string]>(),
            posts: namespace<{ id: string }, [id: string]>(),
          },
        }),
      );

      await cacheA.users.set("same", { id: "u1" });
      await cacheA.posts.set("same", { id: "p1" });
      await cacheA.close();

      const cacheB = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            users: namespace<{ id: string }, [id: string]>(),
            posts: namespace<{ id: string }, [id: string]>(),
          },
        }),
      );

      await expect(cacheB.users.get("same")).resolves.toEqual({
        ok: true,
        value: { id: "u1" },
      });
      await expect(cacheB.posts.get("same")).resolves.toEqual({
        ok: true,
        value: { id: "p1" },
      });

      await cacheB.close();
    } finally {
      cleanupDbFiles(dbPath);
    }
  });

  it("flushes pending writes when close is called", async () => {
    const dbPath = createTempDbPath();

    try {
      const cacheA = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            values: namespace<number, [key: string]>(),
          },
        }),
      );

      for (let i = 0; i < 64; i += 1) {
        await cacheA.values.set(`k${i}`, i);
      }

      await cacheA.close();

      const cacheB = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            values: namespace<number, [key: string]>(),
          },
        }),
      );

      for (let i = 0; i < 64; i += 1) {
        await expect(cacheB.values.get(`k${i}`)).resolves.toEqual({
          ok: true,
          value: i,
        });
      }

      await cacheB.close();
    } finally {
      cleanupDbFiles(dbPath);
    }
  });

  it("serves stale values, revalidates in background, then refreshes after expiry", async () => {
    const dbPath = createTempDbPath();

    try {
      let factoryCalls = 0;
      const cache = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            value: namespace<number, [key: string]>({
              ttl: "30ms",
              swr: "120ms",
              factoryGetter: async () => {
                factoryCalls += 1;
                await sleep(20);
                return factoryCalls;
              },
            }),
          },
        }),
      );

      const first = await cache.value.getOrSet("key");
      expect(first).toEqual({ ok: true, value: 1 });

      await sleep(40);
      const stale = await cache.value.getOrSet("key");
      expect(stale).toEqual({ ok: true, value: 1 });

      await sleep(60);
      await expect(cache.value.get("key")).resolves.toEqual({ ok: true, value: 2 });

      await sleep(180);
      const refreshedAfterExpiry = await cache.value.getOrSet("key");
      expect(refreshedAfterExpiry).toEqual({ ok: true, value: 3 });
      expect(factoryCalls).toBe(3);

      await cache.close();
    } finally {
      cleanupDbFiles(dbPath);
    }
  });

  it("invalid persisted data returns validation result with zod message", async () => {
    const dbPath = createTempDbPath();

    try {
      const cacheA = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            item: namespace<{ id: number }, [id: string]>(),
          },
        }),
      );

      await cacheA.item.set("a", { id: "bad" } as unknown as { id: number });
      await cacheA.close();

      const cacheB = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            item: namespace.schema(z.object({ id: z.number() }))<[id: string]>(),
          },
        }),
      );

      const value = await cacheB.item.get("a");
      expect(value.ok).toBe(false);
      if (!value.ok) {
        expect(value.error.kind).toBe("validation");
        expect(value.error.message).toContain("Expected number");
      }

      await expect(cacheB.item.get("a")).resolves.toEqual({
        ok: true,
        value: undefined,
      });

      await cacheB.close();
    } finally {
      cleanupDbFiles(dbPath);
    }
  });

  it("clears only one namespace via namespace.clear", async () => {
    const dbPath = createTempDbPath();

    try {
      const cache = expectOk(
        createCache({
          globalConfig: {
            sqlite: { path: dbPath },
          },
          namespaces: {
            users: namespace<{ id: string }, [id: string]>(),
            posts: namespace<{ id: string }, [id: string]>(),
          },
        }),
      );

      await cache.users.set("1", { id: "u1" });
      await cache.posts.set("1", { id: "p1" });

      await cache.users.clear();

      await expect(cache.users.get("1")).resolves.toEqual({
        ok: true,
        value: undefined,
      });
      await expect(cache.posts.get("1")).resolves.toEqual({
        ok: true,
        value: { id: "p1" },
      });

      await cache.close();
    } finally {
      cleanupDbFiles(dbPath);
    }
  });
});
