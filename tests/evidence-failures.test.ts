/**
 * What the fetch costs, and what happens when it cannot be made.
 *
 * This file used to pin a fallback: the AI pass failed, and the tool ran the
 * evidence plan to rescue it. There is no AI pass any more, so the rescue is
 * gone — but what it was rescuing *to* is now the only path, and the
 * assertions that mattered were always about that: which upstream calls a tool
 * makes, that it never reaches its own expensive endpoint, and that a failure
 * is reported as a failure rather than dressed up as an answer.
 *
 * Every entry in `calls` below is money. That is why the fan-out is asserted
 * call by call rather than by counting images: a second fetch nobody noticed
 * is a second charge on someone's balance.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { NooticrError, type NooticrClient } from "../src/shared/nooticr.js";

const FRAME = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQ==";
const URL = "https://www.youtube.com/watch?v=abc";

type Call = { name: string; args: Record<string, unknown> };

/** The cheap calls every evidence plan is built from. */
function evidenceData(name: string) {
  if (name === "get_post_frames") {
    return {
      contentBlocks: [],
      structured: {
        url: URL,
        frameCount: 2,
        frames: [
          { data: FRAME, mimeType: "image/jpeg", atFraction: 0.25, atSeconds: 15 },
          { data: FRAME, mimeType: "image/jpeg", atFraction: 0.75, atSeconds: 45 },
        ],
        mcpCredits: { cost: 2, balance: 40 },
      },
    };
  }
  if (name === "get_post_transcript") {
    return { contentBlocks: [], structured: { available: true, transcript: "the words" } };
  }
  if (name === "get_post_comments") {
    return {
      contentBlocks: [],
      structured: {
        platform: "youtube",
        comments: [{ text: "this changed how I film", author: "@a", likes: 4 }],
        themes: [{ term: "price" }],
        mcpCredits: { cost: 2, balance: 38 },
      },
    };
  }
  return { contentBlocks: [], structured: { post: { id: "1", caption: "hi" } } };
}

/**
 * A server whose data calls work and whose every other call is a trap: if a
 * handler ever reaches its own backend endpoint again, `calls` records it and
 * the assertions below fail.
 */
async function connect(fail?: (name: string) => unknown) {
  const calls: Call[] = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    startVideoAnalysis: async () => {
      calls.push({ name: "startVideoAnalysis", args: {} });
      return { ok: true, jobId: "j1", state: "pending" };
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const thrown = fail?.(name);
      if (thrown instanceof Error) throw thrown;
      return evidenceData(name);
    },
  } as unknown as NooticrClient;

  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return { client, calls };
}

const call = (client: Client, name: string, args: Record<string, unknown>) =>
  client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });

const text = (res: { content: unknown }) =>
  (res.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("\n");

const images = (res: { content: unknown }) =>
  (res.content as Array<{ type: string }>).filter((b) => b.type === "image");

describe("a tool spends exactly the calls its plan names", () => {
  it("analyze_post fetches the frames and the transcript, and returns both", async () => {
    const { client, calls } = await connect();
    const res = await call(client, "analyze_post", { url: URL });

    expect(res.isError).toBeFalsy();
    // The frames arrive as pixels, which is the whole reason this tool can be
    // a fetch rather than an analysis.
    expect(images(res).length).toBeGreaterThanOrEqual(2);
    expect(text(res)).toContain("the words");
    // Two calls, two charges — 2 credits for the frames and 1 for the
    // transcript — and never the 6-credit video job.
    expect(calls.map((c) => c.name)).toEqual(["get_post_frames", "get_post_transcript"]);
  });

  it("understand_social_post fans out to the same two calls", async () => {
    const { client, calls } = await connect();
    const res = await call(client, "understand_social_post", { url: URL });

    expect(res.isError).toBeFalsy();
    expect(images(res).length).toBeGreaterThanOrEqual(2);
    expect(calls.map((c) => c.name)).toEqual(["get_post_frames", "get_post_transcript"]);
  });

  it("says in the result what the fan-out actually cost", async () => {
    const { client } = await connect();
    const res = await call(client, "analyze_post", { url: URL });
    // The `mcpCredits` note in the payload comes from the first fetch alone, so
    // on a tool that fans out it understates the charge. The text block is the
    // only place the caller is told the total.
    expect(text(res)).toContain("3 credits in total");
    expect(text(res)).toContain("get_post_frames and get_post_transcript");
  });

  it("charges nothing when there is nothing to fetch", async () => {
    const { client, calls } = await connect();
    // write_hooks takes a topic instead of a url. Fetching with an empty url
    // would bill a credit for a call that could only fail.
    const res = await call(client, "write_hooks", { topic: "cold plunges" });

    expect(res.isError).toBeFalsy();
    expect(calls).toEqual([]);
    expect(text(res)).toMatch(/nothing was charged/i);
  });

  it("analyze_comments reads the comments and classifies nothing itself", async () => {
    const { client, calls } = await connect();
    const res = await call(client, "analyze_comments", { url: URL });

    expect(calls.map((c) => c.name)).toEqual(["get_post_comments"]);
    const out = res.structuredContent as Record<string, unknown>;
    expect(out.commentCount).toBe(1);
    // The taxonomy is the deliverable: prose cannot be filtered or counted.
    expect(text(res)).toMatch(/bug_report/);
  });
});

describe("a failed fetch is reported as a failure", () => {
  it("does not pretend to have material it could not get", async () => {
    const { client, calls } = await connect((name) =>
      name === "get_post_frames" ? new Error("frame extraction is down") : undefined,
    );
    const res = await call(client, "analyze_post", { url: URL });

    // Nothing was returned because nothing could be fetched. There is no
    // second path left to fall back to, so saying so is the whole job.
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/frame extraction is down/);
    // And no retry loop: one attempt, one charge at most.
    expect(calls.filter((c) => c.name === "get_post_frames")).toHaveLength(1);
  });

  it("still answers when only the optional second fetch fails", async () => {
    const { client, calls } = await connect((name) =>
      name === "get_post_transcript" ? new Error("no caption track") : undefined,
    );
    const res = await call(client, "analyze_post", { url: URL });

    // A silent film is still worth looking at. The transcript improves the
    // answer; it is not a precondition for one.
    expect(res.isError).toBeFalsy();
    expect(images(res).length).toBeGreaterThanOrEqual(2);
    expect(calls.map((c) => c.name)).toEqual(["get_post_frames", "get_post_transcript"]);
  });

  it("passes a paywall through in the words the backend used", async () => {
    // "You are out of credits" is not an outage, and it already says what to
    // do about it. Nothing should be retried or substituted here.
    const { client, calls } = await connect((name) =>
      name === "get_social_media"
        ? new NooticrError(402, "Insufficient MCP credits", { paywall: { cost: 2, used: 20, max: 20 } })
        : undefined,
    );
    const res = await call(client, "analyze_post_fast", { url: URL });

    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/Insufficient MCP credits/);
    expect(calls.map((c) => c.name)).toEqual(["get_social_media"]);
  });

  it("keeps the sign-in message when the session has expired", async () => {
    const { client } = await connect((name) =>
      name === "get_social_media" ? new NooticrError(401, "No nooticr access token available.") : undefined,
    );
    const res = await call(client, "analyze_post_fast", { url: URL });

    expect(res.isError).toBe(true);
    // nooticr_login re-runs the interrupted call, which is what makes "no need
    // to ask twice" true rather than a platitude.
    expect(text(res)).toMatch(/sign in again/i);
    expect(text(res)).toContain("nooticr_login");
  });
});

describe("score_draft costs nothing because it fetches nothing", () => {
  it("returns the draft with the rubric and makes no call", async () => {
    const { client, calls } = await connect();
    const res = await call(client, "score_draft", { draft: "I bought a sauna so you don't have to" });

    expect(res.isError).toBeFalsy();
    expect(calls).toEqual([]);
    const said = text(res);
    // The rubric is the whole product: without named axes two runs of this are
    // not comparable, and a model asked only to "review" writes prose.
    for (const axis of ["hook", "clarity", "payoff", "specificity", "fit"]) {
      expect(said).toContain(axis);
    }
    expect(said).toContain("I bought a sauna so you don't have to");
    const out = res.structuredContent as { mcpCredits: { cost: number } };
    expect(out.mcpCredits.cost).toBe(0);
  });
});
