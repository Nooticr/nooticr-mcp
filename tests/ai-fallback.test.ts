/**
 * When orchyn's own analysis cannot be delivered, the tool serves the request
 * anyway.
 *
 * The reported bug: a user asked for a post to be analyzed, the tool answered
 * "AI service not configured or request failed", and the model relayed that
 * and told the user to call `get_post_frames` so it could look at the images
 * itself. The model had that tool. The frames and the transcript are exactly
 * what EVIDENCE_PLANS fetches, so a failed AI pass is a reason to run the plan
 * — not a reason to hand the user homework.
 *
 * Two failure shapes have to be caught, and only one of them looks like a
 * failure. The backend either errors, or returns a degraded payload as an
 * ordinary success: `analyzed: false`, `degraded: true`, a `provider` of
 * "stub", or — for the one shape with no flag at all — fields containing the
 * words "stub data (AI service not configured)".
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { detectAiFailure } from "../src/shared/evidence.js";
import { OrchynError, type OrchynClient } from "../src/shared/orchyn.js";

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
  return { contentBlocks: [], structured: { post: { id: "1", caption: "hi" } } };
}

/**
 * A server whose AI path does whatever the test says, and whose data path
 * always works. `calls` is the billing record: every entry is a charge.
 */
async function connect(ai: (name: string, args: Record<string, unknown>) => unknown) {
  const calls: Call[] = [];
  const orchyn = {
    me: async () => ({ id: "u1" }),
    startVideoAnalysis: async (url: string) => {
      calls.push({ name: "analyze_post", args: { url } });
      const out = ai("analyze_post", { url });
      if (out instanceof Error) throw out;
      return { ok: true, jobId: "j1", state: "pending", platform: "youtube", post: { id: "1" } };
    },
    getJob: async () => {
      const out = ai("job", {});
      if (out instanceof Error) throw out;
      return out as Record<string, unknown>;
    },
    callTool: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "get_post_frames" || name === "get_post_transcript" || name === "get_social_media"
        || name === "get_user_posts" || name === "discover_social_posts") {
        return evidenceData(name);
      }
      const out = ai(name, args);
      if (out instanceof Error) throw out;
      return { contentBlocks: [], structured: out as Record<string, unknown> };
    },
  } as unknown as OrchynClient;

  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => orchyn);
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

/** A job that finished with a real analysis in it. */
const healthyJob = {
  ok: true,
  jobId: "j1",
  state: "done",
  provider: "gemini",
  analysis: { analyzed: true, summary: "a real reading of the video", hookStrength: 8 },
};

describe("a failed AI call falls back to the evidence", () => {
  it("returns frames when the analysis throws", async () => {
    const { client, calls } = await connect((name) =>
      name === "analyze_post"
        ? new Error("AI service not configured or request failed")
        : healthyJob,
    );
    const res = await call(client, "analyze_post", { url: URL });

    // The whole point: a question asked, a question answered.
    expect(res.isError).toBeFalsy();
    expect(images(res)).toHaveLength(2);
    expect(calls.map((c) => c.name)).toEqual([
      "analyze_post",
      "get_post_frames",
      "get_post_transcript",
    ]);
  });

  it("returns frames when the job comes back degraded", async () => {
    // The shape that is not an error: the backend keeps the charge and hands
    // back metadata with the analysis fields emptied out.
    const degraded = {
      ok: true,
      jobId: "j1",
      state: "done",
      provider: "degraded",
      analysis: {
        summary: "Post titled 'x'",
        analyzed: false,
        degraded: true,
        error: "AI service not configured or video analysis request failed",
      },
    };
    const { client, calls } = await connect((name) => (name === "analyze_post" ? {} : degraded));
    const res = await call(client, "analyze_post", { url: URL });

    expect(res.isError).toBeFalsy();
    expect(images(res)).toHaveLength(2);
    // One attempt, one rescue. A fallback that re-entered the AI path would
    // charge twice and could loop.
    expect(calls.filter((c) => c.name === "analyze_post")).toHaveLength(1);
  });

  it("catches a degraded payload from a proxied tool", async () => {
    const { client, calls } = await connect((name) =>
      name === "understand_social_post"
        ? {
            platform: "youtube",
            post: { id: "1" },
            analyzed: false,
            warning: "AI service not configured — returning media metadata only, no AI analysis",
            mcpCredits: { cost: 6, balance: 34 },
          }
        : {},
    );
    const res = await call(client, "understand_social_post", { url: URL });

    expect(res.isError).toBeFalsy();
    expect(images(res)).toHaveLength(2);
    expect(calls.map((c) => c.name)).toEqual([
      "understand_social_post",
      "get_post_frames",
      "get_post_transcript",
    ]);
  });

  it("catches the stub that carries no flag at all, only its marker text", async () => {
    // `crates/server/src/ai/handlers.rs` returns this one with no `analyzed`,
    // no `degraded` and no `warning` — just fields that say what they are.
    const { client } = await connect((name) =>
      name === "analyze_post_fast"
        ? {
            post: { id: "1" },
            formatType: "talking head hook + b-roll",
            hookTechnique:
              "Opens on a direct, specific claim in the first 2 seconds — stub data (AI service not configured).",
            whyItWorks: "Stub reasoning — AI service not configured.",
          }
        : {},
    );
    const res = await call(client, "analyze_post_fast", { url: URL });

    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as Record<string, unknown>;
    expect(out.mode).toBe("evidence");
    expect((out.aiFallback as Record<string, unknown>).detail).toMatch(/stub marker/i);
  });

  it("says in the result that this is not the analysis that was asked for", async () => {
    const { client } = await connect((name) =>
      name === "analyze_post" ? new Error("AI service not configured or request failed") : healthyJob,
    );
    const res = await call(client, "analyze_post", { url: URL });

    // The note lands where the model reads: the first text block, ahead of the
    // guidance, so it explains rather than silently changing the deliverable.
    const said = text(res);
    expect(said).toMatch(/analysis was unavailable/i);
    expect(said).toMatch(/AI service not configured or request failed/);
    expect(said).toMatch(/Do not ask anyone to call another tool/i);
    // And a machine-readable copy beside it.
    const fallback = (res.structuredContent as Record<string, unknown>).aiFallback as Record<string, unknown>;
    expect(fallback.tool).toBe("analyze_post");
    expect(fallback.reason).toBe("the AI call failed");
  });

  it("still tries the AI first when the caller asked for mode 'ai'", async () => {
    const { client, calls } = await connect(() => healthyJob);
    const res = await call(client, "analyze_post", { url: URL, mode: "ai" });

    // A rescue, not a redirect: the AI ran, succeeded, and nothing was fetched.
    expect(calls.map((c) => c.name)).toEqual(["analyze_post"]);
    expect(images(res)).toHaveLength(0);
    expect((res.structuredContent as Record<string, unknown>).mode).toBeUndefined();
    expect(text(res)).toContain("a real reading of the video");
  });

  it("leaves a healthy result exactly as it was", async () => {
    const { client, calls } = await connect((name) =>
      name === "write_hooks" ? { hooks: [{ hook: "one", mechanism: "number" }] } : {},
    );
    const res = await call(client, "write_hooks", { url: URL });
    expect(calls.map((c) => c.name)).toEqual(["write_hooks"]);
    expect((res.structuredContent as Record<string, unknown>).hooks).toHaveLength(1);
  });
});

describe("the fallback does not hide a real failure", () => {
  it("names both failures when the evidence fails too", async () => {
    const calls: Call[] = [];
    const orchyn = {
      me: async () => ({ id: "u1" }),
      startVideoAnalysis: async () => {
        calls.push({ name: "analyze_post", args: {} });
        throw new Error("AI service not configured or request failed");
      },
      callTool: async (name: string) => {
        calls.push({ name, args: {} });
        throw new Error("frame extraction is down");
      },
    } as unknown as OrchynClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => orchyn);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    await client.listTools();

    const res = await call(client, "analyze_post", { url: URL });
    expect(res.isError).toBe(true);
    const said = text(res);
    expect(said).toMatch(/AI service not configured or request failed/);
    expect(said).toMatch(/frame extraction is down/);
    // Two attempts total. Never a third, and never a loop.
    expect(calls.filter((c) => c.name === "analyze_post")).toHaveLength(1);
    expect(calls.filter((c) => c.name === "get_post_frames")).toHaveLength(1);
  });

  it("does not spend the rest of a short balance on a substitute", async () => {
    // "You are out of credits" is not an outage, and it already says what to
    // do about it. Fetching frames the caller never asked for, with the last
    // credits they have, is not a rescue.
    const { client, calls } = await connect((name) =>
      name === "analyze_post_fast"
        ? new OrchynError(402, "Insufficient MCP credits", { paywall: { cost: 2, used: 20, max: 20 } })
        : {},
    );
    const res = await call(client, "analyze_post_fast", { url: URL });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/Insufficient MCP credits/);
    expect(calls.map((c) => c.name)).toEqual(["analyze_post_fast"]);
  });

  it("keeps the sign-in message when the session has expired", async () => {
    const { client, calls } = await connect((name) =>
      name === "analyze_post_fast" ? new OrchynError(401, "No orchyn access token available.") : {},
    );
    const res = await call(client, "analyze_post_fast", { url: URL });
    expect(res.isError).toBe(true);
    // orchyn_login re-runs the interrupted call; the fetch would have failed
    // the same way, so there is nothing to rescue here.
    expect(text(res)).toMatch(/sign in again/i);
    expect(calls.map((c) => c.name)).toEqual(["analyze_post_fast"]);
  });
});

describe("the fallback is billed honestly", () => {
  it("charges the AI call once and the fetch once, and says which", async () => {
    const { client, calls } = await connect((name) =>
      name === "understand_social_post"
        ? {
            post: { id: "1" },
            analyzed: false,
            error: "multimodal understanding failed",
            mcpCredits: { cost: 6, balance: 34 },
          }
        : {},
    );
    const res = await call(client, "understand_social_post", { url: URL });

    // Every entry in `calls` is money. The AI tool must appear exactly once —
    // the fallback re-running it would charge the caller twice for one ask.
    expect(calls.filter((c) => c.name === "understand_social_post")).toHaveLength(1);
    expect(calls.filter((c) => c.name === "get_post_frames")).toHaveLength(1);

    const fallback = (res.structuredContent as Record<string, unknown>).aiFallback as Record<string, unknown>;
    // What the failed call actually charged, carried through rather than
    // guessed at: the backend keeps the charge on a degraded result, and
    // nothing on this side can refund it.
    expect(fallback.aiCharge).toEqual({ cost: 6, balance: 34 });
    expect(String(fallback.billing)).toMatch(/cannot refund/i);
  });

  it("says the fetch is the only charge when the AI call errored", async () => {
    const { client } = await connect((name) =>
      name === "analyze_post" ? new Error("AI service not configured or request failed") : healthyJob,
    );
    const res = await call(client, "analyze_post", { url: URL });
    const fallback = (res.structuredContent as Record<string, unknown>).aiFallback as Record<string, unknown>;
    // A tool call that errors is refunded by the backend before this runs.
    expect(fallback.aiCharge).toBeNull();
    expect(String(fallback.billing)).toMatch(/refunds an MCP tool call/i);
  });

  it("bills evidence mode as the fetch, exactly as an explicit request does", async () => {
    const { client, calls } = await connect((name) =>
      name === "analyze_post" ? new Error("down") : healthyJob,
    );
    await call(client, "analyze_post", { url: URL });
    const rescued = calls.map((c) => c.name).slice(1);

    const asked = await connect(() => healthyJob);
    await call(asked.client, "analyze_post", { url: URL, mode: "evidence" });
    // The rescue is the same two data calls the priced evidence mode makes —
    // no extra fetch smuggled in on the failure path.
    expect(rescued).toEqual(asked.calls.map((c) => c.name));
  });
});

describe("detectAiFailure knows an analysis when it sees one", () => {
  it("passes a real result through", () => {
    expect(detectAiFailure({ analyzed: true, analysis: { summary: "real" }, provider: "gemini" })).toBeNull();
    expect(detectAiFailure({ hooks: [{ hook: "one" }], sourceUrl: "https://x/1" })).toBeNull();
    expect(detectAiFailure({ posts: [{ id: "1" }], analyzed: true, comparison: { winner: "a" } })).toBeNull();
    // Not an object, and nothing to judge.
    expect(detectAiFailure(null)).toBeNull();
    expect(detectAiFailure("text")).toBeNull();
  });

  it("catches each shape the backend actually returns", () => {
    // crates/mcp/src/tools.rs — the four warning-and-flag shapes.
    expect(detectAiFailure({ analyzed: false, warning: "AI service not configured — returning posts only." })?.kind)
      .toBe("degraded");
    expect(detectAiFailure({ posts: [], profileReport: null })?.kind).toBe("degraded");
    expect(detectAiFailure({ posts: [], comparison: null })?.kind).toBe("degraded");
    // crates/ai/src/mock.rs — the stub, which flags itself.
    expect(detectAiFailure({ degraded: true, degradedReason: "AI stub fallback — LLM endpoint unreachable" })?.kind)
      .toBe("degraded");
    // video.ts — a job that ended badly, returned rather than thrown.
    expect(detectAiFailure({ ok: false, state: "error", error: "job failed" })?.kind).toBe("error");
    // A provider that is not a model.
    expect(detectAiFailure({ provider: "stub", analysis: {} })?.kind).toBe("degraded");
    // The nesting the video job uses.
    expect(detectAiFailure({ ok: true, state: "done", analysis: { analyzed: false, error: "no key" } })?.detail)
      .toMatch(/analysis\.analyzed is false/);
  });
});

describe("analyze_comments has no evidence plan and needs none", () => {
  it("hands back the comments the degraded payload already carried", async () => {
    const { client, calls } = await connect((name) =>
      name === "analyze_comments"
        ? {
            platform: "youtube",
            url: URL,
            themes: [{ term: "price" }],
            comments: [{ text: "this changed how I film", author: "@a", likes: 4 }],
            analyzed: false,
            warning: "AI service not configured — returning comments and themes only.",
            mcpCredits: { cost: 6, balance: 30 },
          }
        : {},
    );
    const res = await call(client, "analyze_comments", { url: URL });
    const out = res.structuredContent as Record<string, unknown>;

    expect(out.mode).toBe("evidence");
    expect(out.commentCount).toBe(1);
    expect(text(res)).toMatch(/analysis was unavailable/i);
    // The degraded payload stops before the classification, not before the
    // fetch. Re-fetching the comments would charge for what was already sent.
    expect(calls.map((c) => c.name)).toEqual(["analyze_comments"]);
    expect(String((out.aiFallback as Record<string, unknown>).billing)).toMatch(/added no charge/i);
  });

  it("leaves a post with no comments alone", async () => {
    const { client, calls } = await connect((name) =>
      name === "analyze_comments"
        ? { platform: "youtube", url: URL, analyzed: false, reason: "No comments to analyze on this post." }
        : {},
    );
    const res = await call(client, "analyze_comments", { url: URL });
    // Nothing to hand over is not an outage — and nothing here should provoke
    // a second paid call to prove it.
    expect((res.structuredContent as Record<string, unknown>).mode).toBeUndefined();
    expect(text(res)).toMatch(/No comments to analyze/);
    expect(calls.map((c) => c.name)).toEqual(["analyze_comments"]);
  });
});
