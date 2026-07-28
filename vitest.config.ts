import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    /*
     * Well above vitest's 5s default. Several suites are exhaustive rather than
     * illustrative — every double-out score from 2 to 170, every level of the AI
     * ladder over simulated legs — and they finish in a second or two here while
     * brushing the default on a shared CI runner. A generous ceiling keeps a
     * genuine hang detectable without failing honest work on a slow machine.
     */
    testTimeout: 30_000,
  },
});
