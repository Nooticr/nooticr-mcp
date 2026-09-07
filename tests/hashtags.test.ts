/**
 * Hashtag discovery on the nine networks with no trend board (issue #32).
 *
 * "What should I tag this?" was answerable on TikTok and nowhere else, while
 * `repurpose_post` exists to move a post between networks and tagging is part
 * of the conventions it could not inform. The fix counts tags across a niche
 * sweep, which is a weaker measurement than a trend board in one specific way:
 * a single sample has no rising/cooling signal. So most of what is tested here
 * is that the result says so, rather than handing a model a ranked list it will
 * read as a trend.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";
import { deriveHashtags, tagsIn, derivedNote } from "../src/shared/hashtags.js";
import { DISCOVERABLE_PLATFORMS } from "../src/shared/spend.js";
import { platformsFor } from "./platform-capabilities.js";

describe("reading tags out of a swept post", () => {
  it("takes them from the array and from the caption, not either", () => {
    // Instagram and TikTok fill `hashtags`; X, Reddit and LinkedIn frequently
    // leave it empty with a caption full of them. A tally that trusted only
    // the array returned nothing for exactly the networks this is for.
    expect(tagsIn({ hashtags: ["#Skincare", "glow"] }).sort()).toEqual(["glow", "skincare"]);
    expect(tagsIn({ caption: "morning routine #skincare #GlowUp" }).sort()).toEqual(["glowup", "skincare"]);
    expect(tagsIn({ hashtags: ["retinol"], caption: "#skincare" }).sort()).toEqual(["retinol", "skincare"]);
  });

  it("counts a tag once per post however many times it is written", () => {
    expect(tagsIn({ hashtags: ["skincare"], caption: "#skincare #SKINCARE" })).toEqual(["skincare"]);
  });

  it("keeps a two-character CJK tag, which is a word and not an abbreviation", () => {
    // The first version of the floor was a flat "three or more" and dropped
    // 护肤 ("skincare") — an empty answer for Weibo and Xiaohongshu that would
    // have read as "this niche has no tags", on the networks this is for.
    expect(tagsIn({ caption: "护肤心得 #护肤 #スキンケア" }).sort()).toEqual(["スキンケア", "护肤"]);
    expect(tagsIn({ hashtags: ["#美妆"] })).toEqual(["美妆"]);
  });

  it("drops the noise that would otherwise top the list", () => {
    // Two-letter Latin tokens stay out: "#ad" is a disclosure, not a topic.
    expect(tagsIn({ caption: "#1 #ad #fyp #a b" })).toEqual(["fyp"]);
    expect(tagsIn({ hashtags: ["2024", "10"] })).toEqual([]);
  });
});

describe("ranking the tags", () => {
  // Views chosen so the median and the mean differ. The first version of this
  // fixture used 100/200/300, whose median and mean are both 200 — so a mutant
  // that computed the mean instead survived, and the assertion below was
  // proving nothing about which statistic ran.
  const feed = [
    { hashtags: ["skincare", "retinol"], views: 100, externalUrl: "https://x.test/1" },
    { hashtags: ["skincare", "glow"], views: 200, externalUrl: "https://x.test/2" },
    { hashtags: ["skincare"], views: 9_000, externalUrl: "https://x.test/3" },
    { hashtags: ["retinol"], views: 9_000_000, externalUrl: "https://x.test/4" },
    { hashtags: ["oneoff"], views: 50, externalUrl: "https://x.test/5" },
  ];

  it("ranks by how many posts carry a tag, not by views", () => {
    // The whole point of the ordering: one viral post must not push its tag
    // above a tag three posts share.
    const [top] = deriveHashtags(feed);
    expect(top.hashtag).toBe("skincare");
    expect(top.posts).toBe(3);
  });

  it("drops a tag only one post carries", () => {
    // A tag that appears once is that post's tag, not the niche's — the same
    // reasoning find_hook_pattern applies to a template fitting one post.
    expect(deriveHashtags(feed).map((h) => h.hashtag)).not.toContain("oneoff");
  });

  it("reports the median as well as the total, because one outlier is not a trend", () => {
    const skincare = deriveHashtags(feed).find((h) => h.hashtag === "skincare");
    // 100, 200, 9000 — median 200, mean 3100. Asserting the median is only
    // meaningful on a set where the two disagree.
    expect(skincare?.views).toBe(9_300);
    expect(skincare?.medianViews).toBe(200);
    expect(skincare?.medianViews).not.toBe(3_100);
    // An even-length set takes the midpoint of the middle pair.
    const retinol = deriveHashtags(feed).find((h) => h.hashtag === "retinol");
    expect(retinol?.medianViews).toBe(4_500_050);
  });

  it("carries an example post per tag, so a claim can be checked against one", () => {
    for (const tag of deriveHashtags(feed)) expect(tag.example).toMatch(/^https:\/\//);
  });

  it("survives a network that reports no views at all", () => {
    const noViews = [{ hashtags: ["a11y"] }, { hashtags: ["a11y"] }];
    const [only] = deriveHashtags(noViews);
    expect(only).toMatchObject({ hashtag: "a11y", posts: 2, views: null, medianViews: null });
  });

  it("honours the count cap and never returns zero rows for it", () => {
    expect(deriveHashtags(feed, 1)).toHaveLength(1);
    expect(deriveHashtags(feed, 0).length).toBeGreaterThan(0);
  });
});

describe("what the derived result says about itself", () => {
  it("names the sample size and denies being a trend board", () => {
    const note = derivedNote("skincare", "reddit", 12, 5);
    expect(note).toContain("12 recent reddit post");
    expect(note).toMatch(/not a trend board/i);
    expect(note).toMatch(/no rising\/cooling signal/i);
  });

  it("says an empty sweep is our gap, not evidence the niche is untagged", () => {
    // Silence read as absence is the failure this whole surface guards against.
    const note = derivedNote("skincare", "weibo", 0, 0);
    expect(note).toMatch(/coverage gap here, not evidence/i);
  });
});

describe("the platform list", () => {
  it("is the one the server publishes for discovery", () => {
    // Two places have to agree: what the tool accepts, and what its refusal
    // offers as the alternatives. A drift here quotes a network the sweep
    // cannot reach.
    expect([...DISCOVERABLE_PLATFORMS].sort()).toEqual([...platformsFor("discovery")].sort());
  });
});

describe("discover_hashtags routing", () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  function connect(structured: unknown) {
    calls.length = 0;
    const nooticr = {
      callTool: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { contentBlocks: [{ type: "text", text: "{}" }], structured };
      },
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => nooticr);
    const [a, b] = InMemoryTransport.createLinkedPair();
    return Promise.all([client.connect(a), server.connect(b)]).then(() => client);
  }
  const call = async (args: Record<string, unknown>, structured: unknown = {}) => {
    const client = await connect(structured);
    await client.listTools();
    const res = await client.callTool({ name: "discover_hashtags", arguments: args }, undefined, {
      timeout: 30_000,
    });
    return res.structuredContent as Record<string, unknown>;
  };

  it("sends tiktok to the trend board, untouched", async () => {
    const out = await call({ platform: "tiktok", country: "GB", days: 30 }, { hashtags: [] });
    expect(calls.map((c) => c.name)).toEqual(["discover_hashtags"]);
    // The routing arguments must not leak into the upstream call.
    expect(calls[0].args).toEqual({ country: "GB", days: 30 });
    expect(out.source).toBe("trend-board");
  });

  it("defaults to the trend board when no platform is named", async () => {
    await call({}, { hashtags: [] });
    expect(calls[0].name).toBe("discover_hashtags");
  });

  it("counts a sweep for every other network, and says which route ran", async () => {
    const out = await call(
      { platform: "reddit", niche: "skincare" },
      {
        posts: [
          { hashtags: ["skincare"], views: 10, externalUrl: "https://r.test/1" },
          { caption: "#skincare #retinol", views: 20, externalUrl: "https://r.test/2" },
        ],
        mcpCredits: { cost: 2 },
      },
    );
    expect(calls.map((c) => c.name)).toEqual(["discover_social_posts"]);
    expect(calls[0].args).toMatchObject({ niche: "skincare", platform: "reddit" });
    expect(out.source).toBe("derived-from-sweep");
    expect(out.sweptPosts).toBe(2);
    expect((out.hashtags as Array<{ hashtag: string }>)[0].hashtag).toBe("skincare");
    // Billed once, for the sweep it actually made.
    expect(out.mcpCredits).toEqual({ cost: 2 });
  });

  it("refuses a network that cannot be swept, without spending anything", async () => {
    // A post URL and a handle's feed both work on LinkedIn; discovery does
    // not. Accepting it would spend a credit to return nothing, which then
    // reads as "this niche has no tags".
    const out = await call({ platform: "linkedin", niche: "b2b saas" });
    expect(calls).toHaveLength(0);
    expect(out.available).toBe(false);
    expect(out.billable).toBe(false);
    expect(String(out.reason)).toMatch(/linkedin cannot be swept/i);
    expect(String(out.reason)).toContain("reddit");
  });

  it("refuses the derived route with no niche, and says which argument is missing", async () => {
    const out = await call({ platform: "instagram" });
    expect(calls).toHaveLength(0);
    expect(out.billable).toBe(false);
    expect(String(out.reason)).toMatch(/needs `niche`/);
  });

  it("does not report an error a host would retry", async () => {
    // isError would be read as the call having gone wrong, and the model would
    // retry the same refusal. A plain result is what lets it change argument.
    const client = await connect({});
    await client.listTools();
    const res = await client.callTool({ name: "discover_hashtags", arguments: { platform: "linkedin" } },
      undefined, { timeout: 30_000 });
    expect(res.isError).toBeFalsy();
  });
});
