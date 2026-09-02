/**
 * Durable-Object-backed MCP task store.
 *
 * ## Why this exists
 *
 * `analyze_post`, `understand_social_post` and `analyze_creator_profile` are
 * registered as task tools: the call returns a `taskId` immediately and the
 * client polls `tasks/get` until the work lands. Those three import media and
 * run multimodal AI over it, which is measured in minutes, and the task TTL is
 * fifteen.
 *
 * The store was `InMemoryTaskStore`, built fresh inside `createMcpServer` —
 * which the Durable Object rebuilds every time it restarts. And it restarts
 * often: eviction, hibernation, and every Worker deploy ("Deploying a new
 * Worker version restarts every Durable Object", as eventStore.ts already
 * notes). So a task created before a restart is simply gone afterwards, and
 * the client polls a perfectly valid id into a "task not found" that looks
 * like the analysis failed.
 *
 * The spec is unambiguous that this is not allowed — "The task is durably
 * created before the response is sent", and clients are told to "Store task
 * IDs durably so polling can resume after a client crash or restart". A handle
 * whose whole purpose is to survive a disconnect must outlive the process.
 *
 * SQLite in the session's own Durable Object is the right home, for the same
 * reasons the event store lives there: tasks are session-scoped, DO storage is
 * strongly consistent, and it survives both eviction and a deploy. KV would be
 * the wrong choice — eventually consistent, so a poll could read back a status
 * older than the one just written.
 *
 * Nothing exercises this today: Claude Code declares only `roots` and
 * `elicitation`, so no client currently opts into tasks. That makes the bug
 * latent rather than live, and this the moment to fix it — before a client
 * turns tasks on and the failure arrives as "analysis silently broken".
 */
import type {
  CreateTaskOptions,
  TaskStore,
} from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import type { Request, RequestId, Result, Task } from "@modelcontextprotocol/sdk/types.js";

/** A task row as it is stored. `result` is null until the work finishes. */
interface Row extends Record<string, SqlStorageValue> {
  task_id: string;
  session_id: string | null;
  status: Task["status"];
  status_message: string | null;
  created_at: number;
  updated_at: number;
  ttl_ms: number | null;
  poll_interval_ms: number | null;
  request: string;
  result: string | null;
}

/** Ids are opaque to the client, so a random one is all that is required. */
function newTaskId(): string {
  return crypto.randomUUID();
}

/**
 * `sessionId` is optional throughout the SDK interface, and SQL comparison
 * against NULL is never true — so a task stored without one could not be read
 * back with the same `IS NULL` predicate written as `= ?`. Normalising to a
 * sentinel keeps one code path for both.
 */
const NO_SESSION = "";

export class DurableObjectTaskStore implements TaskStore {
  private sql: SqlStorage;
  private ready = false;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  private init() {
    if (this.ready) return;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS mcp_tasks (
         task_id          TEXT    PRIMARY KEY,
         session_id       TEXT    NOT NULL,
         status           TEXT    NOT NULL,
         status_message   TEXT,
         created_at       INTEGER NOT NULL,
         updated_at       INTEGER NOT NULL,
         ttl_ms           INTEGER,
         poll_interval_ms INTEGER,
         request          TEXT    NOT NULL,
         result           TEXT
       )`
    );
    this.ready = true;
  }

  /**
   * Drop tasks past their TTL. The spec asks for cleanup "after TTL expires,
   * regardless of task status", and a Durable Object has no scheduler running
   * on its own, so the work rides along on the next store operation.
   * A null TTL means unlimited and is never collected here.
   */
  private prune() {
    this.sql.exec(
      `DELETE FROM mcp_tasks
        WHERE ttl_ms IS NOT NULL AND created_at + ttl_ms < ?`,
      Date.now()
    );
  }

  private row(taskId: string, sessionId?: string): Row | undefined {
    this.init();
    const rows = this.sql
      .exec<Row>(
        `SELECT * FROM mcp_tasks WHERE task_id = ? AND session_id = ?`,
        taskId,
        sessionId ?? NO_SESSION
      )
      .toArray();
    return rows[0];
  }

  /** The wire shape, rebuilt from a row. */
  private toTask(row: Row): Task {
    const task: Task = {
      taskId: row.task_id,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      lastUpdatedAt: new Date(row.updated_at).toISOString(),
      ttl: row.ttl_ms,
    };
    if (row.poll_interval_ms !== null) task.pollInterval = row.poll_interval_ms;
    if (row.status_message !== null) task.statusMessage = row.status_message;
    return task;
  }

  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string
  ): Promise<Task> {
    this.init();
    this.prune();
    const taskId = newTaskId();
    const createdAt = Date.now();
    // `ttl` is a request from the caller that the store MAY override; we take
    // it as given, and null keeps the task until it is cleaned up by hand.
    const ttl = taskParams.ttl === undefined ? null : taskParams.ttl;
    this.sql.exec(
      `INSERT INTO mcp_tasks
         (task_id, session_id, status, status_message, created_at, updated_at,
          ttl_ms, poll_interval_ms, request, result)
       VALUES (?, ?, 'working', NULL, ?, ?, ?, ?, ?, NULL)`,
      taskId,
      sessionId ?? NO_SESSION,
      createdAt,
      createdAt,
      ttl,
      taskParams.pollInterval ?? null,
      JSON.stringify({ requestId, request })
    );
    const task: Task = {
      taskId,
      status: "working",
      createdAt: new Date(createdAt).toISOString(),
      lastUpdatedAt: new Date(createdAt).toISOString(),
      ttl,
    };
    if (taskParams.pollInterval !== undefined) task.pollInterval = taskParams.pollInterval;
    return task;
  }

  async getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    const row = this.row(taskId, sessionId);
    return row ? this.toTask(row) : null;
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: Result,
    sessionId?: string
  ): Promise<void> {
    this.init();
    this.sql.exec(
      `UPDATE mcp_tasks SET status = ?, result = ?, updated_at = ?
        WHERE task_id = ? AND session_id = ?`,
      status,
      JSON.stringify(result),
      Date.now(),
      taskId,
      sessionId ?? NO_SESSION
    );
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    const row = this.row(taskId, sessionId);
    // Matching InMemoryTaskStore: an unknown id and an unfinished task are
    // both errors here, and the caller turns them into a JSON-RPC error.
    if (!row) throw new Error(`Task not found: ${taskId}`);
    if (row.result === null) throw new Error(`Task has no result yet: ${taskId}`);
    return JSON.parse(row.result) as Result;
  }

  async updateTaskStatus(
    taskId: string,
    status: Task["status"],
    statusMessage?: string,
    sessionId?: string
  ): Promise<void> {
    this.init();
    this.sql.exec(
      `UPDATE mcp_tasks SET status = ?, status_message = ?, updated_at = ?
        WHERE task_id = ? AND session_id = ?`,
      status,
      statusMessage ?? null,
      Date.now(),
      taskId,
      sessionId ?? NO_SESSION
    );
  }

  /**
   * Newest first, which is the order a caller wants when the list is "what am
   * I waiting on". Paginated by created_at so a cursor stays valid as older
   * tasks are pruned out from under it.
   */
  async listTasks(
    cursor?: string,
    sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    this.init();
    this.prune();
    const PAGE = 50;
    const before = cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER;
    const rows = this.sql
      .exec<Row>(
        `SELECT * FROM mcp_tasks
          WHERE session_id = ? AND created_at < ?
          ORDER BY created_at DESC
          LIMIT ?`,
        sessionId ?? NO_SESSION,
        Number.isFinite(before) ? before : Number.MAX_SAFE_INTEGER,
        PAGE + 1
      )
      .toArray();
    const page = rows.slice(0, PAGE);
    const tasks = page.map((r) => this.toTask(r));
    return rows.length > PAGE
      ? { tasks, nextCursor: String(page[page.length - 1].created_at) }
      : { tasks };
  }
}
