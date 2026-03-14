# tobolac

Type-safe, Zod-compatible two-layer cache for TypeScript with a small API and fast defaults. Works with Bun and Node out of the box. Comes with:

- **Layer 1 cache:** in-memory LRU (hot reads)
- **Layer 2 cache:** local SQLite (durable process restarts)
- **Typed namespaces:** everything inferred end-to-end; never throw, all responses are a Rust-like `Result` type
- **SWR:** stale-while-revalidate supported
- **Stampede protection:** hot keys will never hammer your API

## Why it feels good

- You define cache contracts, called `namespaces` once.
- Schema validation support—works with `zod` out of the box, or any compatible API.
- `get`, `set`, `delete`, and `getOrSet` are fully typed per namespace.
- Optional `factoryGetter` removes `getOrSet` boilerplate while still allowing per-call overrides.
- Lovely return types, like Rust’s `Result`.
- No dependencies if using `bun`! (for `nodejs` you need to install `better-sqlite3`, sorry!)

But most importantly, `tobolac` is _really_ fast and can handle 2.5-5x more ops/s than a Redis-based cache, on a **single node**. Look at the [benchmarks,](https://github.com/filipdanic/cache_benchmarks) they cover 2 unique, real-world scenarios at 3 levels of scale.

The single-node part is important: `tobolac` is not better than Redis or anything else in essence, but simply optimized to work very well in single-node use-cases where we can avoid network overhead. Think of things like: data/etl pipelines, mobile/desktop apps trying to avoid heavy compute, local simulation software, ML inference caches, small-scale web servers, dev/pre-prod environments (dependency inject to avoid spinning up Redis), and parser/graph caching for build tools.

## Quick Start

```ts
import { createCache, namespace } from "tobolac";
import type { Product, DashboardStats } from "../yourapp/services/types";
import { getProduct, getReport } from "../yourapp/services/getters";

const cacheSetup = createCache({
  namespaces: {
    products: namespace<Product, [id: string]>({
      factoryGetter: async (id) => getProduct(id),
    }),
    reports: namespace<DashboardStats, [name: string, from: number, to: number ]>({
      factoryGetter: async (name, from, to) => getReport(name, from, to),
    }),
  },
});

if (!cacheSetup.ok) {
  // something went wrong with setting up your cache
  console.error(cacheSetup.error.message);
}

const appCache = cacheSetup.value;

const productResult = await appCache.products.getOrSet("b651113bf96a5e3543d7");
if (!productResult.ok) {
  // error handling
} {
  // do something with productResult.value, already inferred as 'Product' type
}

const weeklyReport = await appCache.reports.getOrSet("sales-total", 1771545600000, 1772150400000);
if (!weeklyReport.ok) {
  // error handling
} {
  // do something with weeklyReport.value, already inferred as 'DashboardStats' type
}

// if you need to kill it and free up memory/cpu
await appCache.close();
```

Pick your poison:

```bash
# if using bun
bun install tobolac

# if using nodejs/npm
npm install tobolac better-sqlite3
# or nodejs/yarn
yarn install tobolac better-sqlite3
```

## Advanced Config

```ts
import { createCache, namespace } from "tobolac";
import type { Product, DashboardStats, User } from "../yourapp/services/types";
import { getProduct, getReport } from "../yourapp/services/getters";

const cacheSetup = createCache({
  // these will be applied to every namespace, unless the namespace setup
  // configured an override
  globalConfig: {
    ttl: '1m',
    swr: '5m',
    layer1: { maxItems: 5_000 },
    sqlite: {
      // persists with your disk across process restarts!
      path: './cache/sqlite/cache.db', 
      pruneInterval: '1h',
    },
  },
  namespaces: {
     // you can override some or all global defaults
    products: namespace<Product, [id: string]>({
      ttl: '10m',
      layer1: { maxItems: 10_000 },
      factoryGetter: async (id) => getProduct(id),
    }),
    // you can have complex keys
    reports: namespace<DashboardStats, [name: string, from: number, to: number ]>({
      factoryGetter: async (name, from, to) => getReport(name, from, to),
    }),
    // factoryGetter is optional, you can micromanage the get/set behavior yourself
    users: namespace<User, [id: string]>(), 
  },
});
```

## Result API and schema validation

Every public API returns a `CacheResult<T>` instead of throwing:

- `{ ok: true, value }` for success
- `{ ok: false, error }` for failure

`get()` returns `{ ok: true, value: undefined }` on cache miss.

For schema-enabled namespaces, validation failures return:

- `error.kind = "validation"`
- `error.message` with the validator message (for example from zod)

## Zod Example

```ts
import { z } from "zod";
import { createCache, namespace } from "tobolac";

const cache = createCache({
  namespaces: {
    product: namespace.schema(z.object({ id: z.number() }))<[id: string]>(),
  },
});

if (cache.ok) {
  const result = await cache.value.product.get("p1");
  if (!result.ok) {
    console.error(result.error.kind, result.error.message);
  }
}
