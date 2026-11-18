import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    environment: "node",
    coverage: {
      include: ["packages/simulation-core/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts"]
    }
  }
});
