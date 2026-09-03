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
 * WHERE THIS SHOULD LIVE EVENTUALLY: in the nooticr account, not here. The two
 * transports keep it in different places — a file beside the credentials for
 * stdio, KV for the worker — so the same person on ChatGPT and on Claude
 * Desktop today has two watchlists. Both implementations sit behind WatchStore
 * so that when the backend grows an endpoint there is one thing to replace.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { NooticrClient } from "./nooticr.js";
import { confirmSpend, declinedResult, CREDITS_PER_CREATOR } from "./spend.js";

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

const norm = (h: string) => h.trim().replace(/^@/, "").toLowerCase();
const entryId = (platform: string, handle: string) => `${platform}:${norm(handle)}`;

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
  // The watchlist belongs to the nooticr account, not to the connection: the
  // same person on two hosts should see one list. me() is the only identity
  // both transports already have.
  const ownerOf = async (client: NooticrClient): Promise<string> => {
    try {
      const me = await client.me();
      return String(me?.id || me?.email || "anonymous");
    } catch {
      return "anonymous";
    }
  };

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
          platform: z.string().optional().describe("Platform (default tiktok)."),
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
          platform: z.string().optional().describe("Platform (default tiktok)."),
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
