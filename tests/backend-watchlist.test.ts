/**
 * The watchlist, once it lives in the nooticr account.
 *
 * Two properties matter more than the rest and neither is visible from the
 * tool layer: a person's existing per-connection list must survive the move,
 * and a baseline must not be re-stamped on a write that did not change it —
 * `capturedAt` is what "new since you last looked" is measured from, so
 * touching it on every save turns the answer into "nothing, you just looked".
 */
import { describe, it, expect } from "vitest";
import {
  BackendWatchStore,
  MemoryWatchStore,
  type WatchEntry,
} from "../src/shared/watchlist.js";

interface Call {
  tool: string;
  args: Record<string, unknown>;
}

/** A backend that keeps rows the way the real one does, and records calls. */
function fakeBackend(opts: { fail?: Error } = {}) {
  const rows = new Map<string, WatchEntry>();
  const calls: Call[] = [];
  const id = (p: string, h: string) => `${p}:${h.replace(/^@/, "").toLowerCase()}`;

  const client = {
    async callTool(tool: string, args: Record<string, unknown>) {
      calls.push({ tool, args });
      if (opts.fail) throw opts.fail;
      const platform = String(args.platform ?? "tiktok");
      const handle = String(args.handle ?? args.username ?? "");
      const key = id(platform, handle);
      if (tool === "list_watchlist") {
        return { structured: { watching: rows.size, entries: [...rows.values()] } };
      }
      if (tool === "watch_creator") {
        const existing = rows.get(key);
        // upsert: never clears a baseline a previous run recorded.
        rows.set(key, {
          ...(existing ?? { id: key, platform, handle, addedAt: "2026-01-01T00:00:00.000Z" }),
          ...(args.note ? { note: String(args.note) } : {}),
        } as WatchEntry);
        return { structured: { watching: rows.size, entries: [...rows.values()] } };
      }
      if (tool === "unwatch_creator") {
        const removed = rows.delete(key);
        return { structured: { removed, id: key } };
      }
      if (tool === "advance_watchlist_baseline") {
        const row = rows.get(key);
        if (!row) return { structured: { advanced: false } };
        const captured = { capturedAt: new Date().toISOString(), postIds: args.postIds as string[] };
        if (args.kind === "competitor") row.competitorBaseline = captured;
        else row.baseline = { ...captured, topViews: args.topViews as number | undefined };
        return { structured: { advanced: true } };
      }
      throw new Error(`unexpected tool ${tool}`);
    },
  };
  return { client, rows, calls, id };
}

const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
  id: "tiktok:dana",
  platform: "tiktok",
  handle: "dana",
  addedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

const storeOver = (b: ReturnType<typeof fakeBackend>, local = new MemoryWatchStore()) =>
  new BackendWatchStore(() => b.client as never, local);

describe("reading and writing through the account", () => {
  it("lists what the backend holds", async () => {
    const b = fakeBackend();
    await b.client.callTool("watch_creator", { handle: "dana", platform: "tiktok" });
    expect((await storeOver(b).list("u1")).map((e) => e.id)).toEqual(["tiktok:dana"]);
  });

  it("removes by the platform:handle id the local stores use", async () => {
    const b = fakeBackend();
    await b.client.callTool("watch_creator", { handle: "dana", platform: "tiktok" });
    const store = storeOver(b);
    await store.list("u1");
    expect(await store.remove("u1", "tiktok:dana")).toBe(true);
    // Gone means gone, and the same `false` a local store gives for a miss.
    expect(await store.remove("u1", "tiktok:dana")).toBe(false);
  });
});

describe("not re-stamping a baseline that did not move", () => {
  it("pushes a baseline the first time it appears", async () => {
    const b = fakeBackend();
    const store = storeOver(b);
    await store.list("u1");
    await store.put(
      "u1",
      entry({ baseline: { capturedAt: "2026-01-01T00:00:00.000Z", postIds: ["p1"], topViews: 10 } }),
    );
    const advances = b.calls.filter((c) => c.tool === "advance_watchlist_baseline");
    expect(advances).toHaveLength(1);
    expect(advances[0].args.kind).toBe("catch_up");
    expect(advances[0].args.postIds).toEqual(["p1"]);
  });

  it("does not push again when the same posts are written back", async () => {
    // The read-modify-write every caller does would otherwise move capturedAt
    // to now on each save, and "what is new since" would answer "nothing".
    const b = fakeBackend();
    const store = storeOver(b);
    const baseline = { capturedAt: "2026-01-01T00:00:00.000Z", postIds: ["p1", "p2"] };
    await store.list("u1");
    await store.put("u1", entry({ baseline }));
    const after = b.calls.filter((c) => c.tool === "advance_watchlist_baseline").length;
    await store.put("u1", entry({ baseline: { ...baseline } }));
    expect(b.calls.filter((c) => c.tool === "advance_watchlist_baseline")).toHaveLength(after);
  });

  it("pushes again as soon as the posts actually change", async () => {
    const b = fakeBackend();
    const store = storeOver(b);
    await store.list("u1");
    await store.put("u1", entry({ baseline: { capturedAt: "x", postIds: ["p1"] } }));
    await store.put("u1", entry({ baseline: { capturedAt: "x", postIds: ["p1", "p2"] } }));
    expect(b.calls.filter((c) => c.tool === "advance_watchlist_baseline")).toHaveLength(2);
  });

  it("keeps the two baselines on separate markers", async () => {
    // The bug the two-column split exists to prevent: a catch-up must not
    // consume track_competitor's answer, so they advance independently.
    const b = fakeBackend();
    const store = storeOver(b);
    await store.list("u1");
    await store.put(
      "u1",
      entry({
        baseline: { capturedAt: "x", postIds: ["p1"] },
        competitorBaseline: { capturedAt: "x", postIds: ["p9"] },
      }),
    );
    const kinds = b.calls
      .filter((c) => c.tool === "advance_watchlist_baseline")
      .map((c) => c.args.kind);
    expect(kinds.sort()).toEqual(["catch_up", "competitor"]);
  });
});

describe("moving an existing list into the account", () => {
  it("uploads what the local store had, once", async () => {
    const local = new MemoryWatchStore();
    await local.put("u1", entry({ note: "rival" }));
    await local.put("u1", entry({ id: "youtube:kai", platform: "youtube", handle: "kai" }));
    const b = fakeBackend();
    const store = storeOver(b, local);

    expect((await store.list("u1")).map((e) => e.id).sort()).toEqual(["tiktok:dana", "youtube:kai"]);
    const uploads = b.calls.filter((c) => c.tool === "watch_creator").length;
    // A second list must not upload them all over again.
    await store.list("u1");
    expect(b.calls.filter((c) => c.tool === "watch_creator")).toHaveLength(uploads);
  });

  it("carries a baseline across, so a catch-up does not start over", async () => {
    const local = new MemoryWatchStore();
    await local.put("u1", entry({ baseline: { capturedAt: "x", postIds: ["p1", "p2"], topViews: 7 } }));
    const b = fakeBackend();
    const [moved] = await storeOver(b, local).list("u1");
    expect(moved.baseline?.postIds).toEqual(["p1", "p2"]);
  });

  it("never overwrites a backend that already has a list", async () => {
    // The account's list is the real one. A stale per-connection copy landing
    // on top of it would be the migration losing data rather than moving it.
    const local = new MemoryWatchStore();
    await local.put("u1", entry({ id: "tiktok:stale", handle: "stale" }));
    const b = fakeBackend();
    await b.client.callTool("watch_creator", { handle: "real", platform: "tiktok" });
    const ids = (await storeOver(b, local).list("u1")).map((e) => e.id);
    expect(ids).toEqual(["tiktok:real"]);
    expect(ids).not.toContain("tiktok:stale");
  });
});

describe("when the account cannot serve this session", () => {
  it("falls back to the local store for a session with no workspace", async () => {
    const local = new MemoryWatchStore();
    await local.put("u1", entry());
    const b = fakeBackend({ fail: new Error("this session has no workspace") });
    const store = storeOver(b, local);
    expect((await store.list("u1")).map((e) => e.id)).toEqual(["tiktok:dana"]);
    // And keeps writing there rather than retrying every call.
    await store.put("u1", entry({ id: "youtube:kai", platform: "youtube", handle: "kai" }));
    expect((await local.list("u1")).map((e) => e.id).sort()).toEqual(["tiktok:dana", "youtube:kai"]);
  });

  it("falls back on a backend too old to have the tools", async () => {
    const local = new MemoryWatchStore();
    const b = fakeBackend({ fail: new Error("Method not found (-32601)") });
    await storeOver(b, local).put("u1", entry());
    expect((await local.list("u1")).map((e) => e.id)).toEqual(["tiktok:dana"]);
  });

  it("stops calling the backend once it has answered that way", async () => {
    const local = new MemoryWatchStore();
    const b = fakeBackend({ fail: new Error("this session has no workspace") });
    const store = storeOver(b, local);
    await store.list("u1");
    const tried = b.calls.length;
    await store.list("u1");
    await store.put("u1", entry());
    expect(b.calls).toHaveLength(tried);
  });

  it("rethrows a transient failure instead of quietly writing somewhere else", async () => {
    // Falling back here would split the list in half: read from one store,
    // written to another, with nothing saying so.
    const local = new MemoryWatchStore();
    const b = fakeBackend({ fail: new Error("socket hang up") });
    await expect(storeOver(b, local).list("u1")).rejects.toThrow(/socket hang up/);
    expect(await local.list("u1")).toEqual([]);
  });
});
