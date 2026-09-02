/**
 * The parts of the server a host reads before it calls anything: the hints it
 * uses to decide whether a tool needs a confirmation, and the prompts it offers
 * a user who does not know any tool names.
 *
 * Both were measured against the live server before this existed: 11 of 24
 * tools carried annotations and `prompts/list` returned an empty array. The
 * gaps were invisible because nothing failed — a host simply prompted more
 * often than it needed to, and offered nothing up front.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { OrchynClient } from "../src/shared/orchyn.js";

function dummyClient(structured: unknown = {}): OrchynClient {
  return { callTool: async () => ({ contentBlocks: [], structured }) } as unknown as OrchynClient;
}

async function connect(structured: unknown = {}) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => dummyClient(structured));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

// The one tool with a side effect: it opens a Stripe checkout session, and a
// second call is a second session.
const NOT_READ_ONLY = [
  "buy_orchyn_credits",
  // The watchlist tools write: two change stored state, and the catch-up also
  // moves every baseline forward, which is why it is not idempotent either.
  "watch_creator",
  "unwatch_creator",
  "catch_up_watchlist",
];

describe("tool annotations", () => {
  it("every tool carries them", async () => {
    const { tools } = await (await connect()).listTools();
    const bare = tools.filter((t) => !t.annotations || Object.keys(t.annotations).length === 0);
    expect(bare.map((t) => t.name), "tools a host cannot reason about").toEqual([]);
    expect(tools).toHaveLength(28);
  });

  it("marks read-only exactly where it is true", async () => {
    const { tools } = await (await connect()).listTools();
    const writes = tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name).sort();
    // A host auto-approves on readOnlyHint, so a wrong `true` here is worse
    // than a missing annotation: it waves through a real side effect.
    expect(writes).toEqual([...NOT_READ_ONLY].sort());
  });

  it("does not claim a checkout is idempotent", async () => {
    const { tools } = await (await connect()).listTools();
    const buy = tools.find((t) => t.name === "buy_orchyn_credits");
    expect(buy?.annotations?.idempotentHint).toBe(false);
    expect(buy?.annotations?.destructiveHint).toBe(false);
  });

  it("says which tools reach outside orchyn", async () => {
    const { tools } = await (await connect()).listTools();
    const closed = tools.filter((t) => t.annotations?.openWorldHint === false).map((t) => t.name);
    // Only the account tools stay inside orchyn; everything else hits a platform.
    // The watchlist tools that only touch stored state are closed-world too.
    expect(closed.sort()).toEqual([
      "check_orchyn_credits",
      "orchyn_login",
      "unwatch_creator",
      "watch_creator",
    ]);
  });
});

describe("prompts", () => {
  it("offers the workflows a user cannot guess tool names for", async () => {
    const { prompts } = await (await connect()).listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "check_my_draft",
      "niche_briefing",
      "post_teardown",
      "repurpose_everywhere",
      "teardown_creator",
      "what_to_make_next",
      "why_this_won",
    ]);
    for (const p of prompts) {
      expect(p.title, `${p.name} has no title to show`).toBeTruthy();
      expect(p.description, `${p.name} has no description`).toBeTruthy();
    }
  });

  it("asks only for what it cannot infer", async () => {
    const { prompts } = await (await connect()).listPrompts();
    const required = Object.fromEntries(
      prompts.map((p) => [p.name, (p.arguments ?? []).filter((a) => a.required).map((a) => a.name)]),
    );
    expect(required).toEqual({
      teardown_creator: ["handle"],
      niche_briefing: ["niche"],
      check_my_draft: ["draft"],
      post_teardown: ["url"],
      why_this_won: ["urls"],
      what_to_make_next: ["url"],
      repurpose_everywhere: ["url"],
    });
  });

  it("orders the work cheapest-evidence-first", async () => {
    const client = await connect();
    const got = await client.getPrompt({
      name: "post_teardown",
      arguments: { url: "https://www.tiktok.com/@a/video/1" },
    });
    const text = got.messages.map((m) => (m.content as { text: string }).text).join("\n");
    // The transcript is the cheap exact evidence, so it must come before the
    // analysis that would otherwise paraphrase it.
    expect(text.indexOf("get_post_transcript")).toBeLessThan(text.indexOf("analyze_post_fast"));
    expect(text).toContain("https://www.tiktok.com/@a/video/1");
  });

  it("only spends the expensive visual pass when asked for it", async () => {
    const client = await connect();
    const cheap = await client.getPrompt({
      name: "post_teardown",
      arguments: { url: "https://x.com/a/1" },
    });
    const rich = await client.getPrompt({
      name: "post_teardown",
      arguments: { url: "https://x.com/a/1", visuals: "yes" },
    });
    const textOf = (r: Awaited<ReturnType<Client["getPrompt"]>>) =>
      r.messages.map((m) => (m.content as { text: string }).text).join("\n");
    expect(textOf(cheap)).toContain("Skip analyze_post");
    expect(textOf(rich)).not.toContain("Skip analyze_post");
  });
});

describe("output schemas", () => {
  it("every tool says what it returns", async () => {
    const { tools } = await (await connect()).listTools();
    const undeclared = tools.filter((t) => !t.outputSchema).map((t) => t.name);
    expect(undeclared, "tools an agent has to call before it can plan").toEqual([]);
  });

  // The shape belongs to the orchyn backend, not to this repo. The SDK throws
  // on structuredContent that fails its schema, so a schema that constrained
  // would turn a field added upstream into a tool that stopped working for
  // everyone — a self-inflicted outage on someone else's deploy schedule.
  it("survives a field the backend adds tomorrow", async () => {
    const client = await connect({
      platform: "tiktok",
      posts: [{ externalUrl: "https://www.tiktok.com/@a/video/1", views: 5, somethingNew: true }],
      mcpCredits: { cost: 2 },
      aFieldInventedNextQuarter: { nested: [1, 2, 3] },
    });
    const res = await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "fitness" },
    });
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
    expect((res.structuredContent as { platform?: string })?.platform).toBe("tiktok");
  });

  it("accepts an empty result rather than failing the call", async () => {
    // A niche with no posts is an answer, not an error.
    const client = await connect({});
    const res = await client.callTool({ name: "discover_social_posts", arguments: { niche: "zzz" } });
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
  });

  it("describes the fields callers actually chain on", async () => {
    const { tools } = await (await connect()).listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    // externalUrl is the join key: it is what you feed from a feed tool into
    // an analysis one, so it has to be in the declared shape.
    const feed = JSON.stringify(byName.discover_social_posts.outputSchema);
    expect(feed).toContain("externalUrl");
    expect(JSON.stringify(byName.get_post_transcript.outputSchema)).toContain("transcript");
    expect(JSON.stringify(byName.compare_posts.outputSchema)).toContain("winner");
  });
});

// Every tool declared taskSupport "forbidden" — the SDK default, never chosen —
// including analyze_post, which polls a video job for up to POLL_TIMEOUT_MS
// (five minutes). A host had no way to put that in the background.
describe("long-running tools", () => {
  const SLOW = ["analyze_post", "analyze_creator_profile", "understand_social_post"];

  it("accepts a task on the tools that watch a video", async () => {
    const { tools } = await (await connect()).listTools();
    const support = Object.fromEntries(
      tools.map((t) => [t.name, (t as { execution?: { taskSupport?: string } }).execution?.taskSupport]),
    );
    for (const name of SLOW) expect(support[name], name).toBe("optional");
  });

  it("leaves the quick tools alone", async () => {
    const { tools } = await (await connect()).listTools();
    // taskSupport is a floor on how fast a call can return, since the SDK
    // auto-polls at that interval. A tool that answers in a second should not
    // start waiting for one.
    const quick = tools.filter((t) => !SLOW.includes(t.name));
    for (const t of quick) {
      const support = (t as { execution?: { taskSupport?: string } }).execution?.taskSupport;
      expect(support, `${t.name} should not have been made a task tool`).not.toBe("optional");
    }
  });

  // "optional" rather than "required" is the whole compatibility story: a
  // client that knows nothing about tasks must see exactly what it saw before.
  it("still answers a client that asks for no task", async () => {
    const client = await connect({ post: { externalUrl: "https://x/1" }, analysis: { summary: "s" } });
    const res = await client.callTool({
      name: "understand_social_post",
      arguments: { url: "https://www.tiktok.com/@a/video/1" },
    });
    expect(res.isError, JSON.stringify(res.content)).toBeFalsy();
    expect((res.structuredContent as { analysis?: { summary?: string } })?.analysis?.summary).toBe("s");
  }, 30_000);
});

// The view is sandboxed: a host enforcing the CSP blocks any media host not on
// this list, and ChatGPT logged exactly that ("violates ... media-src"). Adding
// a platform without adding its CDNs ships cards whose media silently fails.
describe("media CSP allowlist", () => {
  const cdnDomains = async () => {
    const client = await connect();
    const res = await client.readResource({ uri: "ui://orchyn/discover_social_posts" });
    const meta = res.contents[0]._meta as { ui?: { csp?: { resourceDomains?: string[] } } };
    return meta?.ui?.csp?.resourceDomains ?? [];
  };

  it.each([
    ["reddit", ["redd.it", "redditstatic.com"]],
    ["weibo", ["sinaimg.cn", "weibocdn.com"]],
    ["tiktok", ["tiktokcdn.com", "tiktokcdn-us.com"]],
    ["instagram", ["cdninstagram.com", "fbcdn.net"]],
  ])("%s media hosts are allowed", async (_platform, hosts) => {
    const domains = (await cdnDomains()).join(" ");
    for (const h of hosts) {
      expect(domains, `${h} is not in the CSP allowlist, so its media is blocked`).toContain(h);
    }
  });

  it("covers every platform the tools advertise", async () => {
    const domains = (await cdnDomains()).join(" ");
    // One representative CDN per platform we let a caller pick.
    const perPlatform: Record<string, string> = {
      tiktok: "tiktokcdn", instagram: "cdninstagram", youtube: "ytimg",
      douyin: "douyinpic", xiaohongshu: "xhscdn", bilibili: "hdslb",
      reddit: "redd.it", weibo: "sinaimg",
    };
    const missing = Object.entries(perPlatform)
      .filter(([, cdn]) => !domains.includes(cdn))
      .map(([p]) => p);
    expect(missing, "platforms whose media the view cannot load").toEqual([]);
  });
});
