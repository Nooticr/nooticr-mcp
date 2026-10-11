import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    // Each test spins up an in-process MCP server; on a loaded CI runner the 5s
    // defaults give false timeouts (and worker-RPC timeouts) on tests that pass.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // worker_threads RPC (onTaskUpdate) times out when the runner starves the
    // event loop; child processes, one at a time, avoid that.
    pool: "forks",
    maxWorkers: 1,
  },
});
