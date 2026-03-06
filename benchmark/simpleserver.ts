/**
 * @fileoverview A simple Bun server, for testing the library UX/DX and
 * custom scenarios during development.
 */
import { createCache, namespace } from "../dist/index.js";

type Product = {
  id: string;
  status: "in-house";
  title: string;
  price: number;
};

type ExternalProduct = Omit<Product, "status"> & {
  status: "external";
  partner: string;
};

type SalesReport = {
  type: "in-house" | "external";
  from: number;
  to: number;
  totalRevenue: number;
};

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const isProductInHouse = (): boolean => Math.random() > 0.5;

const cache = createCache({
  namespaces: {
    salesReport: namespace<
      SalesReport,
      [type: SalesReport["type"], from: number, to: number]
    >({
      factoryGetter: async (type, from, to) => {
        await sleep(2000);
        return {
          type,
          from,
          to,
          totalRevenue: Math.floor(Math.random() * 100000),
        };
      },
    }),
    inHouseProducts: namespace<Product, [id: string]>({
      factoryGetter: async (productId) => {
        await sleep(2000);
        return {
          id: productId,
          status: "in-house",
          title: `In House Product ${productId}`,
          price: Math.floor(Math.random() * 10000),
        };
      },
    }),
    externalProducts: namespace<ExternalProduct, [id: string]>({
      factoryGetter: async (productId) => {
        await sleep(220);
        return {
          id: productId,
          status: "external",
          title: `External Product ${productId}`,
          price: Math.floor(Math.random() * 10000),
          partner: "External",
        };
      },
    }),
  },
});

const server = Bun.serve({
  routes: {
    // e.g curl localhost:3000/product/1
    "/product/:id": {
      GET: async (req) => {
        const productId = req.params.id as unknown as string;
        const isInHouse = isProductInHouse();
        if (isInHouse) {
          const res = await cache.inHouseProducts.getOrSet(productId);
          return Response.json(res);
        } else {
          const res = await cache.externalProducts.getOrSet(productId);
          return Response.json(res);
        }
      },
    },
    // e.g curl localhost:3000/salesReport/external/0/10
    "/salesReport/:type/:from/:to": {
      GET: async (req) => {
        const type = req.params.id as unknown as "in-house" | "external";
        const from = Number.parseInt(req.params.from);
        const to = Number.parseInt(req.params.to);
        const res = await cache.salesReport.getOrSet(type, from, to);
        return Response.json(res);
      },
    },
  },
});

console.log(`Server running at ${server.url}`);
