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
import type { NooticrClient } from "../src/shared/nooticr.js";

/**
 * @param answer  what the user does, or null for a client with no elicitation
 *                capability at all.
 */
async function connect(answer: "accept" | "decline" | "cancel" | "reject-form" | null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const asked: string[] = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: { term: "nike", threads: [], totalMentions: 0 } };
    },
  } as unknown as NooticrClient;

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
  const server = createMcpServer(async () => nooticr);
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
    expect(asked[0]).toContain("21 nooticr credits");
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
    expect(asked[0]).toContain("8 nooticr credits");
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
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async (name: string) => {
        calls.push({ name });
        return { contentBlocks: [], structured: {} };
      },
    } as unknown as NooticrClient;
    const client = new Client(
      { name: "test", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => {
      throw new Error("the client's dialog crashed");
    });
    const server = createMcpServer(async () => nooticr);
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

/**
 * The recurring charge, which is a different problem from the ones above.
 *
 * `create_brand_watch` already had a quote-then-confirm protocol, and the
 * backend half of it is real: the first call creates nothing and mints a
 * token, and confirming without a matching token creates nothing either. What
 * the protocol could not do is make a person see the quote — the only thing
 * between "504 credits a day, forever" and a created watch was the model
 * choosing to say it out loud, and a model that calls twice in a row with the
 * token it was just handed satisfies every server-side check with no human
 * anywhere in the loop.
 */
describe("a watch that bills until someone stops it", () => {
  const create = (args: Record<string, unknown>) => ({
    name: "create_brand_watch",
    arguments: { term: "nike", ...args },
  });
  const created = (calls: Array<{ name: string }>) =>
    calls.filter((c) => c.name === "create_brand_watch").length;

  it("asks before the call that actually starts it, quoting run and period", async () => {
    const { client, calls, asked } = await connect("accept");
    await client.callTool(create({ cadence: "hourly", confirm: true, confirmationToken: "t" }));
    expect(asked).toHaveLength(1);
    // 21 a run across all nine networks, 24 runs a day.
    expect(asked[0]).toMatch(/21 credits every run/);
    expect(asked[0]).toMatch(/about 504 a day/);
    expect(asked[0]).toMatch(/until the watch is stopped/);
    expect(created(calls)).toBe(1);
  });

  it("creates nothing when the user declines", async () => {
    const { client, calls, asked } = await connect("decline");
    await client.callTool(create({ cadence: "hourly", confirm: true, confirmationToken: "t" }));
    expect(asked).toHaveLength(1);
    expect(created(calls)).toBe(0);
  });

  // "accept" with proceed:false is someone who read the form and said no.
  it("creates nothing when the form comes back refused", async () => {
    const { client, calls } = await connect("reject-form");
    await client.callTool(create({ cadence: "daily", confirm: true, confirmationToken: "t" }));
    expect(created(calls)).toBe(0);
  });

  it("does not ask on the quoting call, which creates nothing anyway", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(create({ cadence: "hourly" }));
    expect(asked).toEqual([]);
  });

  it("does not ask when confirm arrives without the token the backend requires", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(create({ cadence: "hourly", confirm: true }));
    expect(asked).toEqual([]);
  });

  // The threshold that lets a cheap one-off through is a judgement about a
  // charge that happens once, and it does not transfer to one that repeats.
  it("asks even when a single period costs less than the one-off threshold", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(
      create({ platforms: ["tiktok"], cadence: "weekly", confirm: true, confirmationToken: "t" }),
    );
    expect(2).toBeLessThan(CONFIRM_ABOVE_CREDITS);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/2 credits every run, about 2 a week/);
  });

  it("quotes the budget ceiling rather than the untrimmed sweep", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(
      create({ cadence: "daily", budgetCredits: 4, confirm: true, confirmationToken: "t" }),
    );
    // The server trims a sweep to what fits the ceiling and never widens it,
    // so 4 is what a run bills, not the 21 the full sweep would have cost.
    expect(asked[0]).toMatch(/4 credits every run/);
  });
});

/**
 * A competitor watch is not a mentions sweep, and must not be quoted like
 * one. It runs a single flat-priced get_user_posts call per run — 2 credits,
 * regardless of platform or of how many networks a mentions watch would have
 * searched — so gateRecurringCharge has to price it off that call, not off
 * searchMentionsCost, or the dialog would show a number nobody is actually
 * being charged.
 */
describe("a competitor watch, priced differently from a mentions watch", () => {
  const competitor = (args: Record<string, unknown> = {}) => ({
    name: "create_brand_watch",
    arguments: {
      kind: "competitor",
      handle: "rival",
      platform: "tiktok",
      cadence: "daily",
      confirm: true,
      confirmationToken: "t",
      ...args,
    },
  });

  it("quotes the flat get_user_posts price, not a nine-network sweep", async () => {
    const { client, calls, asked } = await connect("accept");
    await client.callTool(competitor());
    expect(asked).toHaveLength(1);
    // Not 21 — a competitor watch never runs search_mentions at all.
    expect(asked[0]).toMatch(/2 credits every run, about 2 a day/);
    expect(asked[0]).not.toContain("21");
    expect(calls.filter((c) => c.name === "create_brand_watch")).toHaveLength(1);
  });

  it("still asks even though 2 credits a run is under the one-off threshold", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(competitor({ cadence: "weekly" }));
    expect(2).toBeLessThan(CONFIRM_ABOVE_CREDITS);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/2 credits every run, about 2 a week/);
  });

  it("names the creator, not a search term, in the summary", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(competitor());
    expect(asked[0]).toContain("@rival");
    expect(asked[0].toLowerCase()).toContain("median");
  });

  it("creates nothing when the user declines, same as a mentions watch", async () => {
    const { client, calls } = await connect("decline");
    await client.callTool(competitor());
    expect(calls.filter((c) => c.name === "create_brand_watch")).toHaveLength(0);
  });

  it("a high budgetCredits ceiling does not inflate the flat price", async () => {
    const { client, asked } = await connect("accept");
    // get_user_posts is flat-priced — a generous ceiling must not be read as
    // a per-network multiplier the way it would for a mentions watch.
    await client.callTool(competitor({ budgetCredits: 1000 }));
    expect(asked[0]).toMatch(/2 credits every run/);
  });
});

/**
 * deliverTo is the argument that can carry the answer somewhere the user did
 * not choose, on a schedule. The model picks it, and the model spends its day
 * reading captions and comments written by strangers.
 */
describe("where the digest is sent", () => {
  const create = (args: Record<string, unknown>) => ({
    name: "create_brand_watch",
    arguments: { term: "nike", confirm: true, confirmationToken: "t", ...args },
  });

  it("shows the destination to the person approving it", async () => {
    const { client, asked } = await connect("accept");
    await client.callTool(create({ deliverTo: "ops@example.com" }));
    expect(asked[0]).toContain("ops@example.com");
  });

  it("refuses to redirect the digest when no one can be shown the address", async () => {
    // A client with no elicitation capability at all.
    const { client, calls } = await connect(null);
    const res = (await client.callTool(create({ deliverTo: "attacker@example.com" }))) as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    };
    expect(res.isError).toBe(true);
    expect(res.content?.[0]?.text).toContain("attacker@example.com");
    expect(calls.filter((c) => c.name === "create_brand_watch")).toHaveLength(0);
  });

  // The safe default has to keep working everywhere, or the refusal above
  // just pushes people onto a worse path.
  it("still creates a watch delivered to the account's own email", async () => {
    const { client, calls } = await connect(null);
    await client.callTool(create({}));
    expect(calls.filter((c) => c.name === "create_brand_watch")).toHaveLength(1);
  });
});

/**
 * The gap between "we asked" and "someone answered".
 *
 * A client can declare `elicitation` and then throw when one arrives, which
 * confirmSpend deliberately treats as carry-on — for a spend that is right,
 * because the price was in the description either way. It is not right for a
 * delivery address: there, proceeding unasked is the whole failure, so the
 * redirect is gated on a person having actually accepted rather than on
 * whether the attempt was possible.
 */
describe("a client that declares elicitation and then breaks", () => {
  async function brokenClient() {
    const calls: Array<{ name: string }> = [];
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async (name: string) => {
        calls.push({ name });
        return { contentBlocks: [], structured: {} };
      },
    } as unknown as NooticrClient;
    const client = new Client(
      { name: "test", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => {
      throw new Error("the client's dialog crashed");
    });
    const server = createMcpServer(async () => nooticr);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.listTools();
    return { client, calls };
  }

  it("still creates a watch delivered to the account's own address", async () => {
    const { client, calls } = await brokenClient();
    await client.callTool(
      {
        name: "create_brand_watch",
        arguments: { term: "nike", confirm: true, confirmationToken: "t" },
      },
      undefined,
      { timeout: 30_000 },
    );
    expect(calls.filter((c) => c.name === "create_brand_watch")).toHaveLength(1);
  });

  it("refuses to redirect the digest nobody managed to approve", async () => {
    const { client, calls } = await brokenClient();
    const res = (await client.callTool(
      {
        name: "create_brand_watch",
        arguments: {
          term: "nike",
          confirm: true,
          confirmationToken: "t",
          deliverTo: "attacker@example.com",
        },
      },
      undefined,
      { timeout: 30_000 },
    )) as { isError?: boolean; content?: Array<{ text?: string }> };
    expect(res.isError).toBe(true);
    expect(res.content?.[0]?.text).toContain("attacker@example.com");
    expect(calls.filter((c) => c.name === "create_brand_watch")).toHaveLength(0);
  });
});
