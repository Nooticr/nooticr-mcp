import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    setupFiles: ["tests/setup/output-validators.ts"],
    // Each test spins up an in-process MCP server; on a loaded CI runner the 5s
    // defaults give false timeouts (and worker-RPC timeouts) on tests that pass.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // worker_threads RPC (onTaskUpdate) times out when the runner starves the
    // event loop, so tests run in child processes. What starved it was every
    // client compiling 169 output validators on listTools(); the setup file
    // compiles each once per worker, which is what lets them run one per core
    // (8m25s on one worker before it, ~1 min on four after, on a 4-core box).
    pool: "forks",
    maxWorkers: "100%",
  },
});
