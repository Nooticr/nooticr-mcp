/**
 * Argument completion.
 *
 * A prompt argument the caller has to guess is a paid mistake here, not a
 * typo: point `platform` at a network that does not exist and the call still
 * bills, it just finds nothing. `completion/complete` is exactly the mechanism
 * for that, and we were not using it.
 *
 * Driven through a real Client, because the completion handler is only
 * registered when the SDK sees a completable argument — asserting on the
 * schemas in isolation would pass without the capability ever being wired.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { PROMPT_PLATFORMS } from "../src/shared/prompts.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

async function connect() {
  const nooticr = {
    callTool: async () => ({ contentBlocks: [], structured: {} }),
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return client;
}

const complete = async (prompt: string, name: string, value: string) => {
  const client = await connect();
  const res = await client.complete({
    ref: { type: "ref/prompt", name: prompt },
    argument: { name, value },
  });
  return res.completion.values;
};

describe("platform", () => {
  it("offers every network the tools actually accept", async () => {
    const values = await complete("teardown_creator", "platform", "");
    expect(values.sort()).toEqual([...PROMPT_PLATFORMS].sort());
    // The two that shipped after the description was written, and which the
    // description still did not mention.
    expect(values).toContain("reddit");
    expect(values).toContain("weibo");
  });

  it("narrows as the caller types", async () => {
    expect(await complete("niche_briefing", "platform", "t")).toEqual(["tiktok", "twitter"]);
    expect(await complete("niche_briefing", "platform", "red")).toEqual(["reddit"]);
    expect(await complete("niche_briefing", "platform", "zz")).toEqual([]);
  });

  it("ignores the case the caller typed", async () => {
    expect(await complete("niche_briefing", "platform", "RED")).toEqual(["reddit"]);
  });
});

describe("closed-set arguments", () => {
  it("offers the two analysis depths", async () => {
    // One of these costs several times the other, so guessing the spelling
    // wrong is a billing surprise.
    expect((await complete("teardown_creator", "depth", "")).sort()).toEqual(["fast", "full"]);
    expect(await complete("teardown_creator", "depth", "fu")).toEqual(["full"]);
  });

  it("offers yes and no for the expensive visual pass", async () => {
    expect((await complete("post_teardown", "visuals", "")).sort()).toEqual(["no", "yes"]);
  });

  it("offers country codes and matches them however they are typed", async () => {
    const all = await complete("niche_briefing", "country", "");
    expect(all).toContain("US");
    expect(all).toContain("GB");
    // Uppercase options, lowercase query: the case that returned nothing
    // until both sides were lowered.
    expect(await complete("niche_briefing", "country", "u")).toEqual(["US"]);
    expect(await complete("niche_briefing", "country", "U")).toEqual(["US"]);
  });
});

describe("arguments with no closed set", () => {
  it("offers nothing for a free-text argument rather than inventing options", async () => {
    // A niche is anything; a handle is anyone. Suggesting a made-up list here
    // would read as "these are the supported values", which is false.
    const client = await connect();
    const res = await client.complete({
      ref: { type: "ref/prompt", name: "niche_briefing" },
      argument: { name: "niche", value: "fit" },
    });
    expect(res.completion.values).toEqual([]);
  });
});
