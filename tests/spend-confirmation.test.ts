/**
 * Asking before spending credits.
 *
 * `search_mentions` bills per network swept, so "monitor my brand" with no
 * `platforms` argument sweeps all nine for 21 credits — a number the caller
 * never saw, because it is not in the tool description and cannot be, since it
 * depends on an argument. `catch_up_watchlist` has the same shape, priced by
 * the length of a list the prompt does not mention.
 *
 * These go through a real Client over a real transport, because the whole
 * feature is a client→server negotiation: a client that never declared
 * `elicitation` must not be sent one, and one that did must be able to say no
 * and have that mean no credits.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../src/shared/tools.js";
import {
  CONFIRM_ABOVE_CREDITS,
  searchMentionsCost,
  SEARCH_PLATFORMS,
} from "../src/shared/spend.js";
import type { OrchynClient } from "../src/shared/orchyn.js";

/**
 * @param answer  what the user does, or null for a client with no elicitation
 *                capability at all.
 */
async function connect(answer: "accept" | "decline" | "cancel" | "reject-form" | null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const asked: string[] = [];
  const orchyn = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: { term: "nike", threads: [], totalMentions: 0 } };
    },
  } as unknown as OrchynClient;

  const client = new Client(
    { name: "test", version: "1.0.0" },
    // The capability is the whole gate: without it the server must not ask.
    answer === null ? {} : { capabilities: { elicitation: {} } },
  );
  if (answer !== null) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      asked.push(req.params.message);
      if (answer === "reject-form") return { action: "accept", content: { proceed: false } };
      if (answer === "accept") return { action: "accept", content: { proceed: true } };
      return { action: answer };
    });
  }
  const server = createMcpServer(async () => orchyn);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return { client, calls, asked };
}

const sweep = (args: Record<string, unknown>) => ({ name: "search_mentions", arguments: args });

describe("what a sweep costs", () => {
  it("prices the default — every network — at 21", () => {
    // 8 networks at 2, plus Xiaohongshu at 5. Mirrors mcp_tool_cost_for.
    expect(searchMentionsCost(undefined)).toBe(21);
    expect(searchMentionsCost([])).toBe(21);
    expect(searchMentionsCost([...SEARCH_PLATFORMS])).toBe(21);
  });

  it("prices a narrowed sweep by what was asked for", () => {
    expect(searchMentionsCost(["reddit"])).toBe(2);
    expect(searchMentionsCost(["reddit", "youtube", "tiktok"])).toBe(6);
    expect(searchMentionsCost(["xiaohongshu"])).toBe(5);
    expect(searchMentionsCost(["reddit", "xiaohongshu"])).toBe(7);
    // Case and junk are the server's problem too, and it ignores both.
    expect(searchMentionsCost(["REDDIT", "not-a-network"])).toBe(2);
  });
});

describe("a client that can be asked", () => {
  it("asks before a nine-network sweep, and names the price", async () => {
    const { client, calls, asked } = await connect("accept");
    const res = await client.callTool(sweep({ term: "nike" }));
    expect(asked).toHaveLength(1);
    // The number is the point — it is what the caller could not have known.
    expect(asked[0]).toContain("21 orchyn credits");
    expect(asked[0]).toContain("nike");
    // And a way out that is cheaper rather than nothing.
    expect(asked[0]).toMatch(/fewer platforms/i);
    expect(res.isError).toBeFalsy();
    expect(calls.map((c) => c.name)).toEqual(["search_mentions"]);
  });

  it("spends nothing when the user declines", async () => {
    const { client, calls } = await connect("decline");
    const res = await client.callTool(sweep({ term: "nike" }));
    // The tool must not reach the backend at all — that is where billing is.
    expect(calls, "a declined sweep must not be charged").toEqual([]);
    expect(res.isError, "saying no is a choice, not a failure").toBeFalsy();
    const text = String((res.content as Array<{ text: string }>)[0].text);
    expect(text).toMatch(/no credits were spent/i);
    expect(text).toContain("21");
  });

  it("spends nothing when the user dismisses the prompt", async () => {
    const { client, calls } = await connect("cancel");
    await client.callTool(sweep({ term: "nike" }));
    expect(calls).toEqual([]);
  });

  it("spends nothing when the form comes back with proceed false", async () => {
    // A user who read the form and unticked the box said no just as clearly
    // as one who closed it.
    const { client, calls } = await connect("reject-form");
    await client.callTool(sweep({ term: "nike" }));
    expect(calls).toEqual([]);
  });

  it("does not ask about a sweep small enough not to matter", async () => {
    const { client, calls, asked } = await connect("accept");
    // Three networks is 6 credits, which is at the threshold, not over it.
    await client.callTool(sweep({ term: "nike", platforms: ["reddit", "youtube", "tiktok"] }));
    expect(searchMentionsCost(["reddit", "youtube", "tiktok"])).toBe(CONFIRM_ABOVE_CREDITS);
    expect(asked, "a prompt here costs more attention than the credits").toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("asks as soon as the sweep goes over the line", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(
      sweep({ term: "nike", platforms: ["reddit", "youtube", "tiktok", "weibo"] }),
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("8 orchyn credits");
  });
});

describe("a client that cannot be asked", () => {
  it("runs the sweep rather than refusing to work", async () => {
    const { client, calls, asked } = await connect(null);
    const res = await client.callTool(sweep({ term: "nike" }));
    // Sending an elicitation to a client that never declared it is forbidden,
    // and blocking the call would be a worse answer than the behaviour this
    // replaced — the price is still in the tool description.
    expect(asked).toEqual([]);
    expect(res.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
  });

  it("runs the sweep when the client declares elicitation then breaks", async () => {
    const calls: Array<{ name: string }> = [];
    const orchyn = {
      me: async () => ({ id: "u1" }),
      callTool: async (name: string) => {
        calls.push({ name });
        return { contentBlocks: [], structured: {} };
      },
    } as unknown as OrchynClient;
    const client = new Client(
      { name: "test", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => {
      throw new Error("the client's dialog crashed");
    });
    const server = createMcpServer(async () => orchyn);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.listTools();
    const res = await client.callTool(sweep({ term: "nike" }), undefined, { timeout: 30_000 });
    // A broken confirmation should degrade to the behaviour we had before it,
    // not to a tool that stopped working.
    expect(res.isError).toBeFalsy();
    expect(calls).toHaveLength(1);
  });
});
