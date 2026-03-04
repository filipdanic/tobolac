import { performance } from "node:perf_hooks";
import { createCache, namespace } from "../dist/index.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const startedAt = performance.now();
  let i = 0;
  while (i < iterations / 1000) {
    await Promise.allSettled(Array.from({ length: 1000 }).map(() => task(i)));
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
        ttl: "5s",
        swr: "5s",
        layer1: { maxItems: 10_000 },
        factoryGetter: async () => {
          factoryCalls += 1;
          await sleep(180);
          return Math.random();
        },
      }),
    },
  });

  await runScenario("getOrSet; keyspace = 100_000", iterations, async () => {
    await hitCache.value.getOrSet(`key-${Math.floor(Math.random() * 100_000)}`);
  });
  console.log(`factory calls: ${factoryCalls}`);

  // await hitCache.close();
  return;
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
