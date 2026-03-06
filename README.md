# tobolac

Type-safe, two-layer cache for TypeScript with a small API and fast defaults. Works with Bun and Node out of the box.

- **Layer 1:** in-memory LRU (hot reads)
- **Layer 2:** local SQLite (durable process restarts)
- **Typed namespaces:** everything inferred end-to-end
- **SWR:** stale-while-revalidate
- **Stampede protection:** hot keys will never hammer your API

## Why it feels good

- You define cache contracts, called `namespaces` once
- `get`, `set`, `delete`, and `getOrSet` are fully typed per namespace
- Optional `factoryGetter` removes `getOrSet` boilerplate while still allowing per-call overrides

## Quick Start

```ts
import { createCache, namespace } from "tobolac";
import type { Product, DashboardStats } from "../yourapp/services/types";
import { getProduct, getReport } from "../yourapp/services/getters";

const cache = createCache({
  namespaces: {
    products: namespace<Product, [id: string]>({
      factoryGetter: async (id) => getProduct(id),
    }),
    reports: namespace<DashboardStats, [name: string, from: number, to: number ]>({
      factoryGetter: async (name, from, to) => getReport(name, from, to),
    }),
  },
});

// in your api handlers, background jobs, etc
const user = await cache.products.getOrSet("b651113bf96a5e3543d7");
const weeklyReport = await cache.reports.getOrSet("sales-total", 1771545600000, 1772150400000)

// if you need to kill it and free up memory/cpu
await cache.close();
```

Pick your poison:

```bash
bun install tobolac
npm install tobolac
```

## Advanced

```ts
import { createCache, namespace } from "tobolac";
import type { Product, DashboardStats, User } from "../yourapp/services/types";
import { getProduct, getReport } from "../yourapp/services/getters";

const cache = createCache({
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
     // you can override all global defaults
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
