/**
 * search_spoken_mentions — brand monitoring over what is *said*, not typed.
 *
 * Text monitoring finds a brand when someone writes its name. This tool finds
 * it when someone says it out loud, which is where the mentions that actually
 * hurt tend to live: a rant, a "things I regret buying", a comparison whose
 * caption reads "watch till the end".
 *
 * Two things can go badly wrong here and both are tested below. The first is
 * matching: a term that fires inside a longer word turns a monitoring feed into
 * noise, and "nike" inside "nikeisha" is the canonical way that happens. The
 * second is spend. Every other fan-out in this repo can price itself once a
 * cheap first call returns — the watchlist has a length, a feed has a post
 * count. A transcript search cannot: there is no way to know how many
 * candidates say the term without transcribing them, so the candidate count can
 * never set the price and the ceiling has to hold against whatever the caller
 * asks for.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { matchExcerpts } from "../src/shared/jobs.js";
import { MAX_SPOKEN_HANDLE_CALLS, MAX_SPOKEN_TRANSCRIPTS } from "../src/shared/spend.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

/** Minimal version of jobs.test.ts's harness — a client wired straight to the
 *  real MCP server, with the nooticr backend replaced by scripted handlers. */
async function connect(backend: { [tool: string]: (args: Row) => Row }) {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      const handler = backend[name];
      if (!handler) throw new Error(`no stub for ${name}`);
      return { contentBlocks: [], structured: handler(args) };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: { elicitation: {} } });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return { client, calls };
}

describe("matchExcerpts — where a term is actually said", () => {
  it("does not fire inside a longer word", () => {
    const { excerpts, matchCount } = matchExcerpts(
      "shout out to nikeisha for the recommendation, she never steered me wrong",
      "nike",
    );
    expect(matchCount).toBe(0);
    expect(excerpts).toEqual([]);
  });

  it("matches the whole word regardless of case", () => {
    const { matchCount } = matchExcerpts(
      "I bought the NIKE ones and honestly Nike has lost the plot, nike used to be better",
      "nike",
    );
    expect(matchCount).toBe(3);
  });

  it("treats regex metacharacters in the term as literal text", () => {
    // A term like "c++" or "node.js" must not be compiled as a pattern —
    // ".js" as a regex would match "ajs", "bjs", and any other three chars.
    const { matchCount } = matchExcerpts("we rewrote it in node.js last year", "node.js");
    expect(matchCount).toBe(1);
    expect(matchExcerpts("we rewrote it in nodexjs last year", "node.js").matchCount).toBe(0);
  });

  it("still matches a term that starts or ends on punctuation", () => {
    // `\b` only means something next to a word character, so applying it
    // unconditionally would make these terms unmatchable rather than strict.
    expect(matchExcerpts("shopping at H&M again", "H&M").matchCount).toBe(1);
  });

  it("counts every occurrence but only quotes the first few", () => {
    const transcript = Array.from({ length: 12 }, () => "the brand is everywhere").join(" ");
    const { excerpts, matchCount } = matchExcerpts(transcript, "brand", 3);
    expect(matchCount).toBe(12);
    expect(excerpts).toHaveLength(3);
    expect(excerpts.map((e) => e.occurrence)).toEqual([1, 2, 3]);
  });

  it("carries enough surrounding text to read tone from", () => {
    const transcript =
      "so I finally caved and bought it after all the hype and honestly the build quality on this " +
      "acme thing is the worst I have handled in years, do not waste your money on it";
    const { excerpts } = matchExcerpts(transcript, "acme");
    expect(excerpts).toHaveLength(1);
    // The quote has to include the verdict, not just the name.
    expect(excerpts[0].text).toContain("worst I have handled");
    expect(excerpts[0].text).toContain("do not waste your money");
  });

  it("marks a quote that was cut out of a longer transcript", () => {
    const long = `${"padding words ".repeat(40)}acme${" more padding".repeat(40)}`;
    const { excerpts } = matchExcerpts(long, "acme");
    expect(excerpts[0].text.startsWith("…")).toBe(true);
    expect(excerpts[0].text.endsWith("…")).toBe(true);
  });

  it("reports where in the transcript the term was said", () => {
    const transcript = "first sentence here. then they mention acme halfway through.";
    const { excerpts } = matchExcerpts(transcript, "acme");
    expect(excerpts[0].position).toBe(transcript.indexOf("acme"));
  });

  it("finds nothing in an empty transcript or for an empty term", () => {
    // A post whose transcript came back `available:false` is a normal outcome,
    // not an error — it must simply contribute no hits.
    expect(matchExcerpts("", "acme").matchCount).toBe(0);
    expect(matchExcerpts("plenty of words here", "").matchCount).toBe(0);
    expect(matchExcerpts("plenty of words here", "   ").matchCount).toBe(0);
  });

  it("terminates on a term that could match zero-width", () => {
    // Guards the lastIndex stall that would otherwise spin forever.
    expect(() => matchExcerpts("some transcript text", "*")).not.toThrow();
  });
});

describe("search_spoken_mentions — polling a still-transcribing post", () => {
  // Whisper is queue-backed: get_post_transcript can answer "transcribing:
  // true, retryAfterMs" for a job that is accepted and running rather than a
  // caption-track miss. Confusing the two would silently misreport every post
  // whose answer just had not finished yet — this proves the tool asks again
  // instead, and gives up honestly if it never finishes in time.

  it("retries until the transcript is ready, and still finds the term", async () => {
    let calls = 0;
    const { client } = await connect({
      get_user_posts: () => ({
        posts: [{ externalUrl: "https://tiktok.com/@a/video/1", views: 100 }],
      }),
      get_post_transcript: () => {
        calls++;
        if (calls < 3) {
          return { available: false, transcribing: true, retryAfterMs: 1 };
        }
        return { available: true, transcript: "and that is why I switched to acme for good" };
      },
    });
    const res = await client.callTool({
      name: "search_spoken_mentions",
      arguments: { term: "acme", usernames: ["a"], platforms: ["tiktok"] },
    });
    expect(calls).toBe(3);
    const structured = res.structuredContent as Row;
    expect(structured.matched).toBe(1);
    expect(structured.transcriptsAvailable).toBe(1);
    expect(structured.unavailable).toEqual([]);
  });

  it("reports honestly, not as a caption miss, if it never finishes in the budget", async () => {
    const { client } = await connect({
      get_user_posts: () => ({
        posts: [{ externalUrl: "https://tiktok.com/@a/video/1", views: 100 }],
      }),
      get_post_transcript: () => ({ available: false, transcribing: true, retryAfterMs: 1 }),
    });
    const res = await client.callTool({
      name: "search_spoken_mentions",
      arguments: { term: "acme", usernames: ["a"], platforms: ["tiktok"] },
    });
    const structured = res.structuredContent as Row;
    expect(structured.matched).toBe(0);
    const unavailable = structured.unavailable as Row[];
    expect(unavailable).toHaveLength(1);
    // The whole point: this must not read like "no caption track" — that
    // would tell a caller the post stays permanently invisible, when the
    // truth is just "ask again".
    expect(String(unavailable[0].reason)).toMatch(/still listening|try again/i);
    expect(String(unavailable[0].reason)).not.toMatch(/no caption track/i);
  }, 15_000);

  it("does not confuse a genuine caption-track miss with a still-running job", async () => {
    const { client } = await connect({
      get_user_posts: () => ({
        posts: [{ externalUrl: "https://tiktok.com/@a/video/1", views: 100 }],
      }),
      get_post_transcript: () => ({
        available: false,
        reason: "This post has no caption track (the creator did not enable captions).",
      }),
    });
    const res = await client.callTool({
      name: "search_spoken_mentions",
      arguments: { term: "acme", usernames: ["a"], platforms: ["tiktok"] },
    });
    const structured = res.structuredContent as Row;
    const unavailable = structured.unavailable as Row[];
    expect(unavailable).toHaveLength(1);
    expect(String(unavailable[0].reason)).toMatch(/no caption track/i);
  });
});

describe("the ceilings that make the fan-out affordable", () => {
  it("caps transcripts and handle calls at a spend a caller cannot argue up", () => {
    expect(MAX_SPOKEN_TRANSCRIPTS).toBeGreaterThan(0);
    expect(MAX_SPOKEN_HANDLE_CALLS).toBeGreaterThan(0);
    // A transcript costs a credit each, so the worst case a single call can
    // reach has to stay in the range a user would recognise as a search rather
    // than a bill. If either ceiling is raised past this, the confirmation
    // copy and the pricing note in the tool description need revisiting too.
    expect(MAX_SPOKEN_TRANSCRIPTS).toBeLessThanOrEqual(25);
    expect(MAX_SPOKEN_HANDLE_CALLS).toBeLessThanOrEqual(10);
  });
});
