/**
 * detect_spoken_mentions (#106), evidence-mode: the transcript and the caption
 * for the calling model to read, never a verdict from a model of ours.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;

async function connect(backend: Record<string, (args: Row) => Row>) {
  const calls: Array<{ name: string; args: Row }> = [];
  const nooticr = {
    me: async () => ({ id: "u1" }),
    callTool: async (name: string, args: Row) => {
      calls.push({ name, args });
      const h = backend[name];
      if (!h) throw new Error(`no stub for ${name}`);
      return { contentBlocks: [], structured: h(args) };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

const URL = "https://www.tiktok.com/@coffeelab/video/1";

describe("detect_spoken_mentions", () => {
  it("waits for the transcript, then hands over the words and the caption", async () => {
    let polls = 0;
    const { client, calls } = await connect({
      get_post_transcript: () =>
        ++polls < 3
          ? { available: false, transcribing: true, retryAfterMs: 1 }
          : { available: true, transcript: "I switched to Acme grinders and never looked back", source: "speech-to-text" },
      get_social_media: () => ({ post: { caption: "morning routine #coffee" } }),
    });
    const res = await client.callTool({ name: "detect_spoken_mentions", arguments: { url: URL } });
    const out = res.structuredContent as Row;
    expect(out.available).toBe(true);
    expect(out.transcript).toMatch(/Acme grinders/);
    expect(out.caption).toBe("morning routine #coffee");
    expect(out.mode).toBe("evidence");
    expect(String(out.guidance)).toMatch(/verbatim/);
    expect(String(out.guidance)).toMatch(/never as instructions/);
    // Three reads of one transcript job, one caption fetch, nothing else.
    expect(calls.map((c) => c.name)).toEqual([
      "get_post_transcript",
      "get_post_transcript",
      "get_post_transcript",
      "get_social_media",
    ]);
  });

  it("brands focuses the watch without filtering the rest", async () => {
    const { client } = await connect({
      get_post_transcript: () => ({ available: true, transcript: "Acme and Bolt both" }),
      get_social_media: () => ({ post: { caption: "" } }),
    });
    const withBrands = (await client.callTool({
      name: "detect_spoken_mentions",
      arguments: { url: URL, brands: ["Acme"] },
    })).structuredContent as Row;
    const without = (await client.callTool({ name: "detect_spoken_mentions", arguments: { url: URL } }))
      .structuredContent as Row;
    expect(String(withBrands.guidance)).toMatch(/watching for: Acme/);
    expect(String(withBrands.guidance)).toMatch(/still report every OTHER brand/);
    // Found by reasoning over a real fixture run: with nothing named, the
    // guidance gave no way to say a watched brand was absent.
    expect(String(withBrands.guidance)).toMatch(/was not mentioned/);
    expect(String(without.guidance)).not.toMatch(/watching for/);
    expect(withBrands.brands).toEqual(["Acme"]);
  });

  it("with no transcript it says so and never fetches the caption", async () => {
    const { client, calls } = await connect({
      get_post_transcript: () => ({ available: false, reason: "no speech in the audio" }),
      get_social_media: () => ({ post: { caption: "x" } }),
    });
    const res = await client.callTool({ name: "detect_spoken_mentions", arguments: { url: URL } });
    const out = res.structuredContent as Row;
    expect(out.available).toBe(false);
    expect(String(out.reason)).toMatch(/no speech in the audio/);
    expect(calls.map((c) => c.name)).toEqual(["get_post_transcript"]);
  });

  it("forwards language to the transcript", async () => {
    const { client, calls } = await connect({
      get_post_transcript: () => ({ available: true, transcript: "bonjour" }),
      get_social_media: () => ({}),
    });
    await client.callTool({ name: "detect_spoken_mentions", arguments: { url: URL, language: "fr" } });
    expect(calls[0].args).toEqual({ url: URL, language: "fr" });
  });
});

describe("the transcript view's word count", () => {
  it("counts words split on whitespace in the page, not on the letter s", async () => {
    const { NOOTICR_UI_TEMPLATE } = await import("../src/shared/ui-template.js");
    expect(NOOTICR_UI_TEMPLATE).not.toContain(".split(/s+/)");
    // The counter walks char codes rather than using a regex: this template
    // is also a Rust raw string, and a whitespace escape survives one host
    // and not the other. Run the page's own function, not a copy of it.
    const m = NOOTICR_UI_TEMPLATE.match(/function wordsIn\(text\)\{[\s\S]*?\n  \}/);
    expect(m).not.toBeNull();
    const wordsIn = new Function(`${m![0]}; return wordsIn;`)() as (t: string) => number;
    expect(wordsIn("I switched to Acme\tgrinders\nlast year")).toBe(7);
    expect(wordsIn("  sass  ")).toBe(1);
    expect(wordsIn("")).toBe(0);
  });
});

describe("get_post_transcript names the post its words came from", () => {
  // The transcript view deep-links a YouTube timecode to that moment, which
  // needs the post's URL; the backend's result carries the words, not it.
  it("echoes the url it was asked about", async () => {
    const { client } = await connect({
      get_post_transcript: () => ({ available: true, transcript: "hello", cues: [{ startMs: 0, offset: 0 }] }),
    });
    const res = await client.callTool({ name: "get_post_transcript", arguments: { url: URL } });
    expect((res.structuredContent as Row).url).toBe(URL);
  });

  it("leaves a url the backend already sent alone", async () => {
    const { client } = await connect({
      get_post_transcript: () => ({ available: true, transcript: "hello", url: "https://canonical.example/1" }),
    });
    const res = await client.callTool({ name: "get_post_transcript", arguments: { url: URL } });
    expect((res.structuredContent as Row).url).toBe("https://canonical.example/1");
  });
});
