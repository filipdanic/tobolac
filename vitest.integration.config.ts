import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    globals: true,
    coverage: {
      enabled: false,
    },
  },
});
