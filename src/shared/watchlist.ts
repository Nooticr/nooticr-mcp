/**
 * A watchlist — the first thing here that remembers anything.
 *
 * Every other tool is one-shot. You can read a creator today and read them
 * again next week and nothing in between knows you did, so the question people
 * actually have — "what changed since I last looked" — could not be asked at
 * all. Answering it needs two things kept: who you are watching, and what was
 * true when you last checked.
 *
 * There is no scheduler on either transport, so nothing runs in the
 * background. The diff is computed when you ask for it, against a baseline
 * stored the last time you asked. That is enough for the question, and it
 * keeps the cost where the user can see it.
 *
 * Which is the reason for the split below: reading the watchlist resource is
 * free and touches only stored state, because a host may read a resource
 * whenever it likes and a resource read that quietly spends credits would be
 * indefensible. Catching up is a tool, because it fetches, and it says what it
 * costs.
 *
 * WHERE IT LIVES: in the nooticr account. It did not always — the two
 * transports each kept their own copy (a file beside the credentials for
 * stdio, KV for the worker), so the same person on ChatGPT and on Claude
 * Desktop had two lists and a server-side scheduler could read neither.
 * `BackendWatchStore` below is the swap: the same `WatchStore` interface, over
 * nooticr-server's workspace-scoped `list_watchlist` / `watch_creator` /
 * `unwatch_creator` / `get_watchlist_baseline` / `advance_watchlist_baseline`.
 *
 * Two things about that are worth knowing before changing anything here.
 *
 * The swap is at the store, not at the tool layer, and that was the point.
 * The backend registers tools with the same names this file already
 * registers, and only one registration under a name can win — but renaming
 * either side would break whichever hosts had already learned the old one,
 * for a tool whose whole promise is "what you called before still works". So
 * nothing about the surface moved. `watch_creator`, `unwatch_creator`,
 * `catch_up_watchlist` and `track_competitor` keep their names, arguments and
 * behaviour; only the bytes moved, and the backend's own twins stay
 * unregistered here because they would be a second, disconnected list.
 *
 * The stores above are still live and still matter. They are the fallback for
 * an account with no workspace or a backend too old to have the tools, and
 * they are what the one-time migration reads from. Deleting one because "the
 * watchlist is in the account now" would strand exactly those users.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient } from "./nooticr.js";
import { confirmSpend, declinedResult, CREDITS_PER_CREATOR } from "./spend.js";
import { PLATFORM_ARG } from "./evidence.js";

export const WATCHLIST_URI = "nooticr://watchlist";

export interface WatchEntry {
  /** `platform:handle` — stable, and what unwatch takes. */
  id: string;
  platform: string;
  handle: string;
  note?: string;
  addedAt: string;
  /** What was true at the last catch-up. Absent until the first one. */
  baseline?: {
    capturedAt: string;
    postIds: string[];
    topViews?: number;
  };
  /**
   * What track_competitor saw the last time it looked at this creator.
   *
   * Deliberately not the same field as `baseline`. Both tools answer "what has
   * changed since I last looked" and both move a marker forward when they do,
   * so sharing one marker would mean each tool silently consumed the other's
   * answer: run a catch-up and the next track_competitor reports nothing new,
   * which is wrong and looks like the creator stopped posting.
   */
  competitorBaseline?: {
    capturedAt: string;
    postIds: string[];
  };
}

export interface WatchStore {
  list(owner: string): Promise<WatchEntry[]>;
  put(owner: string, entry: WatchEntry): Promise<void>;
  remove(owner: string, id: string): Promise<boolean>;
}

/** Default, and what the tests use. Fine for a single process. */
export class MemoryWatchStore implements WatchStore {
  private readonly byOwner = new Map<string, Map<string, WatchEntry>>();
  private own(owner: string) {
    let m = this.byOwner.get(owner);
    if (!m) this.byOwner.set(owner, (m = new Map()));
    return m;
  }
  async list(owner: string) {
    return [...this.own(owner).values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  async put(owner: string, entry: WatchEntry) {
    this.own(owner).set(entry.id, entry);
  }
  async remove(owner: string, id: string) {
    return this.own(owner).delete(id);
  }
}

/** Minimal shape of a Cloudflare KV namespace, so this file needs no worker types. */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export class KvWatchStore implements WatchStore {
  constructor(private readonly kv: KvLike) {}
  private key(owner: string) {
    return `watchlist:${owner}`;
  }
  async list(owner: string): Promise<WatchEntry[]> {
    const raw = await this.kv.get(this.key(owner));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as WatchEntry[]) : [];
    } catch {
      // A corrupt value must not take the tool down with it.
      return [];
    }
  }
  async put(owner: string, entry: WatchEntry) {
    const all = (await this.list(owner)).filter((e) => e.id !== entry.id);
    all.push(entry);
    all.sort((a, b) => a.id.localeCompare(b.id));
    await this.kv.put(this.key(owner), JSON.stringify(all));
  }
  async remove(owner: string, id: string) {
    const all = await this.list(owner);
    const kept = all.filter((e) => e.id !== id);
    if (kept.length === all.length) return false;
    await this.kv.put(this.key(owner), JSON.stringify(kept));
    return true;
  }
}

/** stdio: one machine, one user, a file beside the credentials. */
export class FileWatchStore implements WatchStore {
  constructor(private readonly file: string) {}
  private async read(): Promise<Record<string, WatchEntry[]>> {
    try {
      const { readFile } = await import("node:fs/promises");
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, WatchEntry[]>;
    } catch {
      return {};
    }
  }
  private async write(all: Record<string, WatchEntry[]>) {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(all, null, 2), { mode: 0o600 });
  }
  async list(owner: string) {
    return (await this.read())[owner] ?? [];
  }
  async put(owner: string, entry: WatchEntry) {
    const all = await this.read();
    const mine = (all[owner] ?? []).filter((e) => e.id !== entry.id);
    mine.push(entry);
    mine.sort((a, b) => a.id.localeCompare(b.id));
    all[owner] = mine;
    await this.write(all);
  }
  async remove(owner: string, id: string) {
    const all = await this.read();
    const mine = all[owner] ?? [];
    const kept = mine.filter((e) => e.id !== id);
    if (kept.length === mine.length) return false;
    all[owner] = kept;
    await this.write(all);
    return true;
  }
}

/**
 * The watchlist, kept in the nooticr account rather than beside the client.
 *
 * This is what the docblock at the top of this file called the real fix. The
 * stores above keep a list per *connection* — a file next to the credentials
 * on stdio, a KV entry on the Worker — so the same person on Claude Desktop
 * and on ChatGPT had two, and a server-side scheduler could read neither.
 *
 * The swap is deliberately at `WatchStore` rather than at the tool layer.
 * `watch_creator`, `unwatch_creator`, `catch_up_watchlist` and
 * `track_competitor` keep their names, their arguments and their behaviour;
 * only where the bytes live changes. That is the whole reason the collision
 * with the backend's identically-named tools was not worth solving by
 * renaming anything: a host that already learned `watch_creator` keeps
 * working, and it now writes somewhere the other host can see.
 *
 * ## Why `put` diffs instead of writing
 *
 * `WatchStore.put` takes a whole entry, because a file store can just
 * overwrite one. The backend splits the same write in two: `watch_creator`
 * upserts the handle and note, `advance_watchlist_baseline` moves one of the
 * two markers. Replaying both on every `put` would work and would also reset
 * `capturedAt` to now each time — so "what is new since you last looked"
 * would answer "since a moment ago" and report nothing. So a baseline is
 * pushed only when its post ids actually changed, measured against the
 * snapshot the caller's own `list()` just returned.
 *
 * ## Why it can still fall back
 *
 * The backend tools need a workspace, and an account that has only ever used
 * the MCP surface may not have one; an older server does not have the tools
 * at all. Both are permanent facts about the session rather than blips, so on
 * either one this falls back to the local store for the rest of the process
 * and says so once. Anything else — a timeout, a 500 — is rethrown rather
 * than quietly redirected: silently writing to a different store than the one
 * that was read is how a watchlist ends up split in half, which is the exact
 * problem this class exists to end.
 */
export class BackendWatchStore implements WatchStore {
  /** What the last `list()` returned, so `put` can tell what changed. */
  private readonly seen = new Map<string, Map<string, WatchEntry>>();
  /** Owners whose local entries are all in the account now. */
  private readonly migrated = new Set<string>();
  /** Owners a migration has been tried for, so a retry knows it is one. */
  private readonly attempted = new Set<string>();
  /** Set once the backend has told us it cannot serve this session at all. */
  private unavailable: string | null = null;

  constructor(
    private readonly client: () => Promise<NooticrClient> | NooticrClient,
    private readonly local: WatchStore,
  ) {}

  /**
   * True for the two answers that mean "not now, and not later either".
   *
   * Matched on the message because that is all a JSON-RPC error carries back
   * through the proxy. Kept narrow on purpose: a wider match would swallow a
   * transient failure and silently split the list.
   */
  private static isPermanent(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      /has no workspace/i.test(msg) ||
      /method not found/i.test(msg) ||
      /unknown tool/i.test(msg) ||
      /-32601/.test(msg)
    );
  }

  private async call(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = await this.client();
    const res = await client.callTool(tool, args);
    return (res.structured ?? {}) as Record<string, unknown>;
  }

  /** Runs `fn` against the backend, or falls back for good if it cannot. */
  private async viaBackend<T>(fn: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    if (this.unavailable) return fallback();
    try {
      return await fn();
    } catch (err) {
      if (!BackendWatchStore.isPermanent(err)) throw err;
      this.unavailable = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[nooticr-mcp] watchlist: staying on local storage for this session (${this.unavailable})\n`,
      );
      return fallback();
    }
  }

  private static toEntry(raw: unknown): WatchEntry | null {
    const r = (raw ?? {}) as Record<string, unknown>;
    const platform = String(r.platform ?? "");
    const handle = String(r.handle ?? "");
    if (!platform || !handle) return null;
    const baseline = r.baseline as WatchEntry["baseline"] | null | undefined;
    const competitor = r.competitorBaseline as WatchEntry["competitorBaseline"] | null | undefined;
    return {
      id: String(r.id ?? watchEntryId(platform, handle)),
      platform,
      handle,
      note: r.note ? String(r.note) : undefined,
      addedAt: String(r.addedAt ?? new Date().toISOString()),
      ...(baseline ? { baseline } : {}),
      ...(competitor ? { competitorBaseline: competitor } : {}),
    };
  }

  /** Two baselines are the same when they cover the same posts. */
  private static sameIds(a?: { postIds?: string[] }, b?: { postIds?: string[] }): boolean {
    const x = a?.postIds ?? null;
    const y = b?.postIds ?? null;
    if (!x || !y) return x === y;
    return x.length === y.length && x.every((id, i) => id === y[i]);
  }

  /**
   * Hand the local list over once, and only into an empty backend.
   *
   * A non-empty backend already has the user's real list — overwriting it with
   * a stale per-connection copy would be the migration losing data rather than
   * moving it. Failure to migrate one entry is not failure to read the list,
   * so it is reported and stepped over.
   */
  private async migrateOnce(owner: string, remote: WatchEntry[]): Promise<WatchEntry[]> {
    if (this.migrated.has(owner)) return remote;
    const firstLook = !this.attempted.has(owner);
    this.attempted.add(owner);

    // On the first look a non-empty account wins outright: it already holds
    // the real list, and dropping a stale per-connection copy on top would be
    // the migration losing data rather than moving it.
    if (firstLook && remote.length) {
      this.migrated.add(owner);
      return remote;
    }

    const mine = await this.local.list(owner);
    // Anything already up there is not a candidate — which is what makes a
    // retry safe. After a partial migration the account is non-empty *because
    // of us*, so the rule above would otherwise strand whatever failed: the
    // account would have half the list and the rest would never be looked at
    // again.
    const present = new Set(remote.map((e) => e.id));
    const todo = mine.filter((e) => !present.has(e.id));
    if (!todo.length) {
      this.migrated.add(owner);
      return remote;
    }

    let moved = 0;
    for (const entry of todo) {
      try {
        await this.pushEntry(entry, undefined);
        moved += 1;
      } catch (err) {
        process.stderr.write(
          `[nooticr-mcp] watchlist: could not migrate ${entry.id}: ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
      }
    }
    // Only done when everything landed. Retrying is cheap — `watch_creator`
    // upserts and the baselines are diffed — so the safe direction is to try
    // the stragglers again on the next read.
    if (moved === todo.length) this.migrated.add(owner);
    process.stderr.write(
      `[nooticr-mcp] watchlist: moved ${moved} of ${todo.length} creator(s) into your nooticr ` +
        `account; they are now shared across every host you connect from\n`,
    );
    return this.readRemote();
  }

  private async readRemote(): Promise<WatchEntry[]> {
    const payload = await this.call("list_watchlist", {});
    const rows = Array.isArray(payload.entries) ? payload.entries : [];
    return rows
      .map((r) => BackendWatchStore.toEntry(r))
      .filter((e): e is WatchEntry => e !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** The upsert plus whichever baselines actually moved. */
  private async pushEntry(entry: WatchEntry, before: WatchEntry | undefined): Promise<void> {
    await this.call("watch_creator", {
      handle: entry.handle,
      platform: entry.platform,
      ...(entry.note ? { note: entry.note } : {}),
    });
    if (entry.baseline && !BackendWatchStore.sameIds(before?.baseline, entry.baseline)) {
      await this.call("advance_watchlist_baseline", {
        handle: entry.handle,
        platform: entry.platform,
        kind: "catch_up",
        postIds: entry.baseline.postIds,
        ...(entry.baseline.topViews === undefined ? {} : { topViews: entry.baseline.topViews }),
      });
    }
    if (
      entry.competitorBaseline &&
      !BackendWatchStore.sameIds(before?.competitorBaseline, entry.competitorBaseline)
    ) {
      await this.call("advance_watchlist_baseline", {
        handle: entry.handle,
        platform: entry.platform,
        kind: "competitor",
        postIds: entry.competitorBaseline.postIds,
      });
    }
  }

  async list(owner: string): Promise<WatchEntry[]> {
    return this.viaBackend(
      async () => {
        const entries = await this.migrateOnce(owner, await this.readRemote());
        this.seen.set(owner, new Map(entries.map((e) => [e.id, e])));
        return entries;
      },
      () => this.local.list(owner),
    );
  }

  async put(owner: string, entry: WatchEntry): Promise<void> {
    return this.viaBackend(
      async () => {
        await this.pushEntry(entry, this.seen.get(owner)?.get(entry.id));
        let mine = this.seen.get(owner);
        if (!mine) this.seen.set(owner, (mine = new Map()));
        mine.set(entry.id, entry);
      },
      () => this.local.put(owner, entry),
    );
  }

  async remove(owner: string, id: string): Promise<boolean> {
    return this.viaBackend(
      async () => {
        const [platform, ...rest] = id.split(":");
        const handle = rest.join(":");
        if (!platform || !handle) return false;
        const payload = await this.call("unwatch_creator", { handle, platform });
        this.seen.get(owner)?.delete(id);
        // `removed` is the backend's own boolean for "a row went away", which
        // is exactly the contract the local stores return.
        return payload.removed === true;
      },
      () => this.local.remove(owner, id),
    );
  }
}

/** Handles differ only by case and a leading @; the store keys on this. */
export const normaliseHandle = (h: string) => h.trim().replace(/^@/, "").toLowerCase();
/** `platform:handle` — stable, what unwatch takes, and what a lookup needs. */
export const watchEntryId = (platform: string, handle: string) =>
  `${platform}:${normaliseHandle(handle)}`;

const norm = normaliseHandle;
const entryId = watchEntryId;

/**
 * The account a stored list belongs to.
 *
 * The watchlist belongs to the nooticr account, not to the connection: the same
 * person on two hosts should see one list. me() is the only identity both
 * transports already have. Exported because jobs.ts reads the same store to
 * answer "what has this competitor shipped since I last checked", and two
 * different owner keys over one store would be two different watchlists.
 */
export async function watchlistOwner(client: NooticrClient): Promise<string> {
  try {
    const me = await client.me();
    return String(me?.id || me?.email || "anonymous");
  } catch {
    return "anonymous";
  }
}

/** Posts as get_user_posts returns them, reduced to what a baseline needs. */
function snapshot(posts: Array<Record<string, unknown>>) {
  const ids = posts
    .map((p) => String(p.id ?? p.externalUrl ?? ""))
    .filter(Boolean);
  const views = posts.map((p) => Number(p.views) || 0);
  return {
    capturedAt: new Date().toISOString(),
    postIds: ids,
    topViews: views.length ? Math.max(...views) : undefined,
  };
}

export function registerWatchlist(
  server: McpServer,
  makeClient: (ctx: {
    authInfo?: AuthInfo;
    requestId?: string | number;
    arguments?: unknown;
  }) => Promise<NooticrClient> | NooticrClient,
  store: WatchStore,
): void {
  const ownerOf = watchlistOwner;

  const text = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  });

  server.registerResource(
    "Nooticr Watchlist",
    WATCHLIST_URI,
    {
      mimeType: "application/json",
      description:
        "Creators you are watching, and what was true at the last catch-up. Reading this is free " +
        "and fetches nothing.",
    },
    async (uri, extra) => {
      const client = await makeClient({ ...(extra as object) });
      const entries = await store.list(await ownerOf(client));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ watching: entries.length, entries }, null, 2),
          },
        ],
        // Private and short-lived, unlike the view template. This is one
        // account's list, so a shared cache must never hand it to anyone else
        // — that is exactly what `cacheScope` is for. And it changes from
        // inside the same session (watch_creator, unwatch_creator), so the
        // window has to be small enough that a user who just added someone
        // does not look at a list without them.
        ttlMs: 30_000,
        cacheScope: "private" as const,
      };
    },
  );

  server.registerTool(
    "watch_creator",
    {
      title: "Watch Creator",
      description:
        "Add a creator to your watchlist so you can ask later what they have posted since. Stores " +
        "the handle only — nothing is fetched here, so there is no cost. Use catch_up_watchlist to " +
        "see what changed. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          username: z.string().describe("Creator handle, with or without @."),
          platform: z.string().optional().describe(PLATFORM_ARG),
          note: z.string().optional().describe("Why you are watching them — shown back to you later."),
        })
        .strict(),
      outputSchema: z
        .object({
          watching: z.number().nullish(),
          added: z.string().nullish(),
          entries: z.array(z.union([z.object({}).passthrough(), z.null()])).nullish(),
        })
        .passthrough(),
    },
    async (args: { username: string; platform?: string; note?: string }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      const owner = await ownerOf(client);
      const platform = (args.platform || "tiktok").toLowerCase();
      const id = entryId(platform, args.username);
      const existing = (await store.list(owner)).find((e) => e.id === id);
      await store.put(owner, {
        id,
        platform,
        handle: norm(args.username),
        note: args.note ?? existing?.note,
        addedAt: existing?.addedAt ?? new Date().toISOString(),
        // Re-watching keeps the baseline, so "since I last looked" still means
        // the last catch-up rather than the moment of re-adding.
        baseline: existing?.baseline,
      });
      const entries = await store.list(owner);
      return text({ added: id, watching: entries.length, entries });
    },
  );

  server.registerTool(
    "unwatch_creator",
    {
      title: "Unwatch Creator",
      description:
        "Remove a creator from your watchlist. Nothing is fetched, so there is no cost. No cost to call.",
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      inputSchema: z
        .object({
          username: z.string().describe("Creator handle, with or without @."),
          platform: z.string().optional().describe(PLATFORM_ARG),
        })
        .strict(),
      outputSchema: z
        .object({
          removed: z.boolean().nullish(),
          watching: z.number().nullish(),
          entries: z.array(z.union([z.object({}).passthrough(), z.null()])).nullish(),
        })
        .passthrough(),
    },
    async (args: { username: string; platform?: string }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      const owner = await ownerOf(client);
      const id = entryId((args.platform || "tiktok").toLowerCase(), args.username);
      const removed = await store.remove(owner, id);
      const entries = await store.list(owner);
      return text({ removed, id, watching: entries.length, entries });
    },
  );

  server.registerTool(
    "catch_up_watchlist",
    {
      title: "Catch Up On Watchlist",
      _meta: {
        ui: { resourceUri: "ui://nooticr/catch_up_watchlist" },
        "ui/resourceUri": "ui://nooticr/catch_up_watchlist",
        "openai/outputTemplate": "ui://nooticr/catch_up_watchlist.html",
      },
      description:
        "What the creators you watch have posted since you last checked. Fetches each one's recent " +
        "posts and compares them against the snapshot taken at your last catch-up, then moves the " +
        "snapshot forward — so this answers 'what is new' rather than 'what exists'. The first run " +
        "for a creator has nothing to compare against and just records the baseline. " +
        "Consumes 2 nooticr credits per creator checked.",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      inputSchema: z
        .object({
          limit: z.number().int().optional().describe("Posts to check per creator (default 6)."),
          platform: z.string().optional().describe("Only check creators on this platform."),
        })
        .strict(),
      outputSchema: z
        .object({
          checked: z.number().nullish(),
          creators: z.array(z.union([z.object({}).passthrough(), z.null()])).nullish(),
          posts: z.array(z.union([z.object({}).passthrough(), z.null()])).nullish().describe("Everything new, flattened, for the card view."),
          mcpCredits: z.object({}).passthrough().nullish(),
        })
        .passthrough(),
    },
    async (args: { limit?: number; platform?: string }, extra) => {
      const client = await makeClient({ ...extra, arguments: args });
      const owner = await ownerOf(client);
      const only = args.platform?.toLowerCase();
      let entries = await store.list(owner);
      if (only) entries = entries.filter((e) => e.platform === only);
      if (!entries.length) {
        return text({
          checked: 0,
          creators: [],
          hint: "Nothing on the watchlist yet — add someone with watch_creator.",
        });
      }

      // The other call whose price is an argument the caller never sees: the
      // watchlist length. Listing it is a free KV read, so nothing has been
      // spent by the time we ask.
      const credits = entries.length * CREDITS_PER_CREATOR;
      const decision = await confirmSpend(server.server, {
        credits,
        summary: `Check ${entries.length} watched creator${entries.length === 1 ? "" : "s"} for new posts.`,
        cheaper: 'Pass "platform" to check only one network.',
      });
      if (!decision.proceed) {
        return declinedResult(credits, `Checking ${entries.length} creators`);
      }

      const creators: Array<Record<string, unknown>> = [];
      for (const entry of entries) {
        try {
          const res = await client.callTool("get_user_posts", {
            username: entry.handle,
            platform: entry.platform,
            limit: args.limit ?? 6,
          });
          const structured = (res.structured ?? {}) as Record<string, unknown>;
          const posts = Array.isArray(structured.posts)
            ? (structured.posts as Array<Record<string, unknown>>)
            : [];
          const seen = new Set(entry.baseline?.postIds ?? []);
          const fresh = entry.baseline
            ? posts.filter((p) => !seen.has(String(p.id ?? p.externalUrl ?? "")))
            : [];
          creators.push({
            id: entry.id,
            handle: entry.handle,
            platform: entry.platform,
            note: entry.note,
            firstCheck: !entry.baseline,
            lastCheckedAt: entry.baseline?.capturedAt,
            newPosts: fresh.length,
            posts: fresh,
          });
          await store.put(owner, { ...entry, baseline: snapshot(posts) });
        } catch (err) {
          // One creator failing must not lose the rest of the catch-up.
          creators.push({
            id: entry.id,
            handle: entry.handle,
            platform: entry.platform,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      // Flattened for the view: the card renderer already knows how to draw a
      // `posts` array, so what is new shows as cards without teaching the
      // template a new shape. `creators` keeps the grouping for the model.
      const fresh = creators.flatMap((c) =>
        Array.isArray(c.posts) ? (c.posts as Array<Record<string, unknown>>) : [],
      );
      return text({ checked: creators.length, creators, posts: fresh });
    },
  );
}
