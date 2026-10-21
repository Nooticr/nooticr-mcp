/**
 * measure_audience_overlap (#31): two accounts' commenters, the ones under
 * both, and the share in each direction, measured rather than guessed.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const COMMENTERS: Record<string, string[]> = {
  alice: ["fan1", "fan2", "both1", "both2", "Alice", "@BOTH3"],
  bob: ["both1", "bob_fan", "both2", "both3", "bob"],
};

async function connect(opts: { elicit?: "accept" | "decline"; failComments?: boolean } = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_user_posts") {
        const u = String(args.username);
        const posts = u === "nobody" ? [] : [1, 2].map((i) => ({ externalUrl: `https://www.tiktok.com/@${u}/video/${i}` }));
        return { contentBlocks: [], structured: { posts, mcpCredits: { cost: 2 } } };
      }
      if (name === "get_post_comments") {
        if (opts.failComments) throw new Error("comments are off");
        const u = /@(\w+)\//.exec(String(args.url))![1];
        // Every commenter on both posts, so each counts twice per side.
        return { contentBlocks: [], structured: { comments: COMMENTERS[u].map((a) => ({ author: a, text: "hi" })), mcpCredits: { cost: 2 } } };
      }
      throw new Error(`unexpected ${name}`);
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: opts.elicit ? { elicitation: {} } : {} });
  if (opts.elicit) {
    client.setRequestHandler(ElicitRequestSchema, async () =>
      opts.elicit === "accept" ? { action: "accept", content: { proceed: true } } : { action: "decline" },
    );
  }
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const call = async (args: Record<string, unknown>) => {
    const res = await client.callTool({ name: "measure_audience_overlap", arguments: args });
    const text = (res.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    return { res, text, sc: res.structuredContent as Record<string, any> };
  };
  return { call, calls };
}

describe("measure_audience_overlap", () => {
  it("intersects the two commenter sets and reports the share in both directions", async () => {
    const { call, calls } = await connect();
    const { res, text, sc } = await call({ usernames: ["@Alice", "bob"], postsPerCreator: 2 });
    expect(res.isError).toBeFalsy();
    expect(calls.filter((c) => c.name === "get_user_posts").map((c) => c.args)).toEqual([
      { username: "alice", platform: "tiktok", limit: 2 },
      { username: "bob", platform: "tiktok", limit: 2 },
    ]);
    expect(calls.filter((c) => c.name === "get_post_comments")).toHaveLength(4);
    // The creators themselves are not their own audience; handles compare without @ or case.
    expect(sc.creators.map((c: any) => c.commenters)).toEqual([5, 4]);
    expect(sc.shared.map((s: any) => s.username).sort()).toEqual(["both1", "both2", "both3"]);
    expect(sc.overlap).toEqual([
      { from: "alice", to: "bob", commenters: 5, alsoUnderOther: 3, share: 0.6 },
      { from: "bob", to: "alice", commenters: 4, alsoUnderOther: 3, share: 0.75 },
    ]);
    expect(sc.measures).toBe("engaged_commenters");
    expect(sc.thinSample).toBe(true);
    expect(sc.creditsCharged).toBe(12);
    // Both channels carry the numbers and the shared handles (#59), and the caveat.
    expect(text).toContain("60% of @alice's commenters and 75% of @bob's");
    expect(text).toContain("@both1");
    expect(text).toContain("not followers");
    expect(sc.guidance).toContain("not followers");
  });

  it("asks before opening the posts and spends nothing on comments when declined", async () => {
    const { call, calls } = await connect({ elicit: "decline" });
    const { res, text } = await call({ usernames: ["alice", "bob"], postsPerCreator: 2 });
    expect(res.isError).toBeFalsy();
    expect(text).toMatch(/Cancelled — no credits were spent/);
    expect(text).toContain("postsPerCreator");
    expect(calls.some((c) => c.name === "get_post_comments")).toBe(false);
  });

  it("stops after the post lists when one account has nothing to read", async () => {
    const { call, calls } = await connect();
    const { text, sc } = await call({ usernames: ["alice", "nobody"] });
    expect(calls.some((c) => c.name === "get_post_comments")).toBe(false);
    expect(text).toContain("@nobody had no recent posts");
    expect(sc.overlap).toEqual([]);
  });

  it("returns what it got when comment fetches fail, and says so", async () => {
    const { call } = await connect({ failComments: true });
    const { res, sc } = await call({ usernames: ["alice", "bob"], postsPerCreator: 1 });
    expect(res.isError).toBeFalsy();
    expect(sc.unavailable).toHaveLength(2);
    expect(sc.sharedCount).toBe(0);
  });

  it("refuses the same handle twice and anything but two handles", async () => {
    const { call, calls } = await connect();
    expect((await call({ usernames: ["alice", "@ALICE"] })).res.isError).toBe(true);
    expect((await call({ usernames: ["alice"] })).res.isError).toBe(true);
    expect((await call({ usernames: ["a", "b", "c"] })).res.isError).toBe(true);
    expect(calls).toEqual([]);
  });
});
