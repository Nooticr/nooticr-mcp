/**
 * Long calls, made honest.
 *
 * Every tool here declared `taskSupport: "forbidden"` — the SDK default, never
 * chosen — including the ones that watch a video. POLL_TIMEOUT_MS is five
 * minutes, so analyze_post could hold a synchronous tools/call open for that
 * long and a host had no way to put it in the background. Measured against the
 * live server, discover_social_posts takes 10.3s and compare_posts 10.4s; the
 * multimodal tools wrapped here are the slow ones above them.
 *
 * The three tools that run longest now accept a task. What they do is
 * unchanged: the existing handler is moved onto a background run and its
 * result stored, so a client that asks for a task gets a task id it can poll,
 * and a client that does not is auto-polled by the SDK and sees exactly the
 * same result it saw before. That compatibility is the reason for `optional`
 * rather than `required`.
 *
 * The store is in memory, per session. A task does not survive a restart —
 * neither did the synchronous call it replaces, so nothing regresses, and the
 * result outliving the request by fifteen minutes is new ground either way.
 * When these need to survive a deploy, the store is the piece to replace: the
 * worker already has a SQLite Durable Object under the session.
 *
 * The task APIs are experimental in SDK 1.30 and may change under us. They are
 * contained here for that reason — one file to fix rather than three handlers.
 */
import { InMemoryTaskStore } from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";

/** How long a finished result stays fetchable. */
export const TASK_TTL_MS = 900_000;
/**
 * How often a client is told to poll — and, because the SDK auto-polls at this
 * interval for a client that asked for no task, a floor on how fast those
 * calls can now return. Measured: a plain call that would have answered
 * instantly takes one interval. The SDK's default is 5s; these tools import
 * media and run multimodal AI over it, so 2s is a rounding error against the
 * work and cheap enough to poll over HTTP for the five minutes it may run.
 * Only the three slowest tools are wrapped, so nothing quick pays this.
 */
export const TASK_POLL_MS = 2_000;

/** Fresh store per server, which is per session on both transports. */
export function createTaskStore(): InMemoryTaskStore {
  return new InMemoryTaskStore();
}

/** What the handlers below already receive, plus the task bookkeeping. */
type TaskStoreFns = {
  createTask: (o: { ttl?: number; pollInterval?: number }) => Promise<{ taskId: string }>;
  getTask: (id: string) => Promise<unknown>;
  getTaskResult: (id: string) => Promise<unknown>;
  storeTaskResult: (id: string, status: "completed" | "failed", result: unknown) => Promise<void>;
};
type Extra = RequestHandlerExtra<ServerRequest, ServerNotification> & {
  taskStore: TaskStoreFns;
  taskId: string;
};
type ToolResult = { content: unknown[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/**
 * Registers a tool whose work is slow enough to deserve a task, keeping the
 * handler exactly as it was written for the synchronous path.
 */
export function registerSlowTool<A>(
  server: McpServer,
  name: string,
  config: Record<string, unknown>,
  run: (args: A, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => Promise<ToolResult>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (server as any).experimental.tasks;
  tasks.registerToolTask(
    name,
    { ...config, execution: { taskSupport: "optional" } },
    {
      createTask: async (args: A, extra: Extra) => {
        const task = await extra.taskStore.createTask({ ttl: TASK_TTL_MS, pollInterval: TASK_POLL_MS });
        // Deliberately not awaited: createTask must return the id now, and the
        // work carries on past the end of this request. Nothing in these
        // handlers reads extra.signal, and makeClient takes only plain values
        // off extra (authInfo, requestId, arguments), so none of it goes stale
        // when the request that started it completes.
        void (async () => {
          try {
            const result = await run(args, extra);
            await extra.taskStore.storeTaskResult(
              task.taskId,
              result?.isError ? "failed" : "completed",
              result,
            );
          } catch (err) {
            // A throw here has nowhere to go — the request is long gone — so
            // it has to land in the task or the client polls a task that never
            // finishes.
            const message = err instanceof Error ? err.message : String(err);
            await extra.taskStore.storeTaskResult(task.taskId, "failed", {
              content: [{ type: "text", text: `${name} failed: ${message}` }],
              isError: true,
            });
          }
        })();
        return { task };
      },
      getTask: async (_args: A, extra: Extra) => extra.taskStore.getTask(extra.taskId),
      getTaskResult: async (_args: A, extra: Extra) => extra.taskStore.getTaskResult(extra.taskId),
    },
  );
}
