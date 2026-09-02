/**
 * The task store has one job that the in-memory one could not do: survive the
 * process that created it.
 *
 * `analyze_post` and its two siblings return a `taskId` and let the client poll
 * for minutes. The store was built inside `createMcpServer`, which the Durable
 * Object rebuilds on eviction, hibernation and every deploy — so the handle
 * outlived the thing holding it, and a client polling a valid id got "task not
 * found" that read as a failed analysis.
 *
 * So the test that matters is not "can it store a task". It is: throw the store
 * away, build a new one over the same storage, and ask again.
 *
 * Backed by real SQLite rather than a hand-written fake, because the bug is
 * about persistence and a fake that keeps a Map would pass while proving
 * nothing.
 */
import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { DurableObjectTaskStore } from "../cloudflare/src/taskStore.js";
import type { Request, Result } from "@modelcontextprotocol/sdk/types.js";

/**
 * The slice of Cloudflare's `SqlStorage` the store uses, over node:sqlite.
 * `exec` is variadic-bound and returns something with `.toArray()`/`.one()`.
 */
function sqlStorage(db: DatabaseSync) {
  return {
    exec(query: string, ...bindings: unknown[]) {
      const stmt = db.prepare(query);
      // node:sqlite refuses to `all()` a statement that returns nothing.
      const reads = /^\s*select/i.test(query);
      const rows = reads ? (stmt.all(...(bindings as never[])) as unknown[]) : [];
      if (!reads) stmt.run(...(bindings as never[]));
      return {
        toArray: () => rows,
        one: () => rows[0],
        [Symbol.iterator]: () => rows[Symbol.iterator](),
      };
    },
  } as unknown as SqlStorage;
}

const REQUEST = { method: "tools/call", params: { name: "analyze_post" } } as unknown as Request;
const RESULT = { content: [{ type: "text", text: "the analysis" }] } as unknown as Result;

function freshDb() {
  return new DatabaseSync(":memory:");
}

describe("a task outlives the server that created it", () => {
  it("is still there after the Durable Object restarts", async () => {
    const db = freshDb();
    // The DO boots, creates the server, starts a five-minute video analysis.
    const before = new DurableObjectTaskStore(sqlStorage(db));
    const task = await before.createTask({ ttl: 900_000, pollInterval: 2000 }, 1, REQUEST, "s1");
    expect(task.status).toBe("working");

    // A deploy lands. Every DO restarts; createMcpServer runs again and builds
    // a brand new store. This is exactly where the old one lost the task.
    const after = new DurableObjectTaskStore(sqlStorage(db));
    const found = await after.getTask(task.taskId, "s1");
    expect(found, "the client is holding a valid id and polling it").not.toBeNull();
    expect(found!.taskId).toBe(task.taskId);
    expect(found!.status).toBe("working");
    expect(found!.pollInterval).toBe(2000);
  });

  it("hands back the result stored by a different instance", async () => {
    const db = freshDb();
    const a = new DurableObjectTaskStore(sqlStorage(db));
    const task = await a.createTask({ ttl: 900_000 }, 1, REQUEST, "s1");
    await a.storeTaskResult(task.taskId, "completed", RESULT, "s1");

    const b = new DurableObjectTaskStore(sqlStorage(db));
    expect((await b.getTask(task.taskId, "s1"))!.status).toBe("completed");
    expect(await b.getTaskResult(task.taskId, "s1")).toEqual(RESULT);
  });

  it("moves lastUpdatedAt when something actually happens", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const task = await store.createTask({ ttl: 900_000 }, 1, REQUEST, "s1");
    // A polling client watches this field to know the work is progressing
    // rather than wedged; it must not stay frozen at creation time.
    await new Promise((r) => setTimeout(r, 5));
    await store.updateTaskStatus(task.taskId, "working", "importing media", "s1");
    const moved = (await store.getTask(task.taskId, "s1"))!;
    expect(moved.statusMessage).toBe("importing media");
    expect(new Date(moved.lastUpdatedAt).getTime()).toBeGreaterThan(
      new Date(task.createdAt).getTime(),
    );
    expect(moved.createdAt, "creation time is not a moving target").toBe(task.createdAt);
  });
});

describe("tasks belong to one session", () => {
  it("does not leak a task to another session", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const mine = await store.createTask({ ttl: 900_000 }, 1, REQUEST, "session-a");
    // Two sessions share a DO's storage only if something has gone wrong, but
    // the id is a bearer token for a result: it must not resolve elsewhere.
    expect(await store.getTask(mine.taskId, "session-b")).toBeNull();
    await expect(store.getTaskResult(mine.taskId, "session-b")).rejects.toThrow(/not found/i);
  });

  it("handles a task created without a session id", async () => {
    // sessionId is optional throughout the SDK interface, and `= NULL` matches
    // nothing in SQL — so an unsessioned task would have been unreadable.
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const task = await store.createTask({ ttl: 900_000 }, 1, REQUEST);
    expect((await store.getTask(task.taskId))!.taskId).toBe(task.taskId);
  });
});

describe("expiry", () => {
  it("stops serving a task past its ttl", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const dead = await store.createTask({ ttl: -1 }, 1, REQUEST, "s1");
    // Creating anything else runs the sweep; a DO has no scheduler of its own.
    await store.createTask({ ttl: 900_000 }, 2, REQUEST, "s1");
    expect(await store.getTask(dead.taskId, "s1")).toBeNull();
  });

  it("keeps a task with no ttl", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const forever = await store.createTask({ ttl: null }, 1, REQUEST, "s1");
    await store.createTask({ ttl: 1 }, 2, REQUEST, "s1");
    expect((await store.getTask(forever.taskId, "s1"))!.ttl).toBeNull();
  });
});

describe("listing", () => {
  it("returns the newest first and pages through the rest", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    for (let i = 0; i < 3; i++) {
      await store.createTask({ ttl: 900_000 }, i, REQUEST, "s1");
      await new Promise((r) => setTimeout(r, 2)); // distinct created_at
    }
    const { tasks } = await store.listTasks(undefined, "s1");
    expect(tasks).toHaveLength(3);
    const times = tasks.map((t) => new Date(t.createdAt).getTime());
    expect(times, "newest first — what am I still waiting on").toEqual(
      [...times].sort((a, b) => b - a),
    );
    // Another session's list is its own.
    expect((await store.listTasks(undefined, "s2")).tasks).toEqual([]);
  });
});

describe("an unfinished task", () => {
  it("says so rather than returning an empty result", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const task = await store.createTask({ ttl: 900_000 }, 1, REQUEST, "s1");
    // Returning `{}` here would look to the caller like an analysis that found
    // nothing, which is a different and much worse answer than "not yet".
    await expect(store.getTaskResult(task.taskId, "s1")).rejects.toThrow(/no result yet/i);
  });

  it("reports a failure with its result intact", async () => {
    const db = freshDb();
    const store = new DurableObjectTaskStore(sqlStorage(db));
    const task = await store.createTask({ ttl: 900_000 }, 1, REQUEST, "s1");
    const failure = { content: [{ type: "text", text: "upstream is down" }], isError: true };
    await store.storeTaskResult(task.taskId, "failed", failure as unknown as Result, "s1");
    expect((await store.getTask(task.taskId, "s1"))!.status).toBe("failed");
    expect(await store.getTaskResult(task.taskId, "s1")).toEqual(failure);
  });
});
