import { performance } from "node:perf_hooks";
import { createCache, namespace } from "../dist/index.js";

function parseIterations() {
  const index = process.argv.indexOf("--iterations");
  if (index !== -1) {
    const rawValue = process.argv[index + 1];
    const parsed = Number.parseInt(rawValue ?? "", 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error("--iterations must be a positive integer");
    }
    return parsed;
  }

  const inline = process.argv.find((arg) => arg.startsWith("--iterations="));
  if (!inline) {
    return 100_000;
  }

  const parsed = Number.parseInt(inline.slice("--iterations=".length), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("--iterations must be a positive integer");
  }
  return parsed;
}

async function runScenario(
  name: string,
  iterations: number,
  task: (iteration: number) => Promise<void>,
) {
  const warmup = Math.floor(iterations * 0.05);
  let w = 0;
  while (w < warmup) {
    await task(w);
    w += 1;
  }

  const startedAt = performance.now();
  let i = 0;
  while (i < iterations) {
    await task(i);
    i += 1;
  }
  const elapsedMs = performance.now() - startedAt;
  const opsPerSec = (iterations / elapsedMs) * 1_000;

  console.log(
    `${name.padEnd(26)} ${opsPerSec.toFixed(0).padStart(10)} ops/s (${elapsedMs.toFixed(1)} ms)`,
  );
}

async function main() {
  const iterations = parseIterations();
  const runtime = process.versions.bun
    ? `bun ${process.versions.bun}`
    : `node ${process.version}`;

  console.log(`Runtime: ${runtime}`);
  console.log(`Iterations: ${iterations.toLocaleString()}`);

  let factoryCalls = 0;
  const sqlitePath = `.cache/bench-getorset-${Date.now()}-${process.pid}.db`;

  const hitCache = createCache({
    globalConfig: {
      sqlite: { path: sqlitePath },
    },
    namespaces: {
      value: namespace<number, [key: string]>({
        ttl: "5m",
        layer1: { maxItems: 10_000 },
        factoryGetter: async () => {
          factoryCalls += 1;
          return Math.random();
        },
      }),
    },
  });

  await runScenario("getOrSet; keyspace = 100", iterations, async () => {
    await hitCache.value.getOrSet(`key-${Math.floor(Math.random() * 100)}`);
  });
  console.log(`factory calls: ${factoryCalls}`);

  await hitCache.close();
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
