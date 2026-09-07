/**
 * Every platform a tool's description names must be one the server can serve,
 * and a tool that enumerates platforms must name all of them.
 *
 * The second half is the one nothing checked before. The tests here compared
 * tools.ts to tools-def.ts, which catches the two files disagreeing but not the
 * two files being wrong together — and they were, for as long as
 * get_post_transcript claimed a TikTok/YouTube ceiling it does not have.
 *
 * The truth lives in src/shared/platform-capabilities.ts, which names the
 * nooticr-server dispatcher behind each list. This drives the checks off the
 * built server, so it reads what a host actually receives.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";
import {
  CAPABILITIES,
  KNOWN_PLATFORMS,
  capabilityOf,
  commentsUnavailable,
  fallbackRoute,
  listIsCeiling,
  platformsFor,
} from "./platform-capabilities.js";

async function shippedTools() {
  const client = new Client({ name: "platform-claims", version: "1.0.0" });
  const server = createMcpServer(
    async () =>
      ({ callTool: async () => ({ contentBlocks: [], structured: {} }) }) as unknown as NooticrClient,
  );
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return (await client.listTools()).tools;
}

/** "x" is how a description spells the network the API calls "twitter". */
const ALIASES: Record<string, string> = { x: "twitter" };

/** Text a tool puts in front of a host: its description plus every describe(). */
function proseOf(tool: { description?: string; inputSchema?: unknown }): string {
  const props = (tool.inputSchema as { properties?: Record<string, { description?: string }> })
    ?.properties;
  const hints = Object.values(props ?? {})
    .map((v) => v?.description ?? "")
    .join(" ");
  return `${tool.description ?? ""} ${hints}`.toLowerCase();
}

/**
 * Markers after which a platform name is a stated limitation rather than a
 * claim — "we cannot do X" names X without offering it.
 *
 * `search_creators` needed the first one; `get_post_transcript` needed the
 * second, to say that Reddit and Bilibili cannot be listened to at all because
 * the audio cannot be fetched from what their posts carry. Naming an exclusion
 * is the behaviour these checks want (silence is how a caller concludes nobody
 * said anything), so it must not read as over-advertising — but the marker has
 * to be a fixed phrase rather than free prose, or "cannot" anywhere in a
 * description would switch the check off.
 */
const EXCLUSION_MARKERS = ["not searchable here:", "cannot be listened to:"];

/**
 * Platforms a piece of prose claims. Anything after an exclusion marker is a
 * stated limitation, so it is a claim about absence, not presence.
 */
function claimed(prose: string): Set<string> {
  let positive = prose;
  for (const marker of EXCLUSION_MARKERS) {
    [positive] = positive.split(marker);
  }
  const found = new Set<string>();
  for (const p of KNOWN_PLATFORMS) {
    if (new RegExp(`\\b${p}\\b`).test(positive)) found.add(p);
  }
  for (const [alias, real] of Object.entries(ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`).test(positive)) found.add(real);
  }
  return found;
}

describe("platform claims match what the server serves", () => {
  it("no tool names a platform its capability cannot reach", async () => {
    const offenders: string[] = [];
    for (const tool of await shippedTools()) {
      const found = capabilityOf(tool.name);
      if (!found) continue; // covered by the undeclared-capability test below
      const [capName] = found;
      const serves = new Set(platformsFor(capName));
      for (const p of claimed(proseOf(tool))) {
        if (!serves.has(p)) {
          offenders.push(`${tool.name} claims ${p}, but ${capName} cannot reach it`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a tool that enumerates platforms names every one its capability serves", async () => {
    // The under-advertising check: a capability the server has and no host is
    // told about is invisible until someone reads the Rust.
    const offenders: string[] = [];
    for (const tool of await shippedTools()) {
      const found = capabilityOf(tool.name);
      if (!found || !found[1].enumerating.includes(tool.name)) continue;
      const [capName] = found;
      const named = claimed(proseOf(tool));
      const missing = platformsFor(capName).filter((p) => !named.has(p));
      if (missing.length) {
        offenders.push(`${tool.name} does not mention ${missing.join(", ")} — ${capName} serves them`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a description that enumerates is complete on its own", async () => {
    // `proseOf` merges the description with every input hint, which is right
    // for the over-advertising check above — a platform named anywhere is a
    // claim. It also made this check blind: `understand_social_post` and
    // `analyze_post` both listed nine networks in the sentence a model reads
    // and got LinkedIn only from the `url` hint, so a host deciding whether
    // the tool could handle a LinkedIn video read "Supports ... and Bilibili",
    // did not find it, and declined a post the tool handles fine.
    //
    // A description that enumerates has to be complete by itself, because that
    // is the text that gets read by itself.
    const offenders: string[] = [];
    for (const tool of await shippedTools()) {
      const found = capabilityOf(tool.name);
      if (!found || !found[1].enumerating.includes(tool.name)) continue;
      const [capName] = found;
      const named = claimed((tool.description ?? "").toLowerCase());
      if (!named.size) continue; // the platforms are only in its hints, which the merged check covers
      const missing = platformsFor(capName).filter((p) => !named.has(p));
      if (missing.length) {
        offenders.push(
          `${tool.name}'s description names platforms but not ${missing.join(", ")} — ${capName} serves them`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a capability whose list is only a fast path is not described as a limit", async () => {
    // get_post_transcript named three platforms that are the caption-track
    // route, not the boundary; everything else is transcribed by listening.
    const offenders: string[] = [];
    for (const [capName, cap] of Object.entries(CAPABILITIES)) {
      if (listIsCeiling(capName)) continue;
      for (const name of cap.enumerating) {
        offenders.push(`${name} enumerates ${capName}, whose list is a fast path, not a ceiling`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a caveated platform is caveated in the prose of every tool that reaches it", async () => {
    // Xiaohongshu is swept for mentions and charged the most, and its comments
    // cannot be fetched — silence there means the endpoint, not the audience.
    const offenders: string[] = [];
    const tools = await shippedTools();
    for (const [capName, cap] of Object.entries(CAPABILITIES)) {
      const flagged = [...new Set([...commentsUnavailable(capName), ...Object.keys(cap.caveats ?? {})])];
      for (const platform of flagged) {
        for (const name of [...cap.enumerating, ...(cap.quiet ?? [])]) {
          const tool = tools.find((t) => t.name === name);
          if (!tool) continue;
          const prose = proseOf(tool);
          const enumerates = cap.enumerating.includes(name);
          // A tool that enumerates the capability sweeps the caveated platform
          // whether or not it names it, so silence is the failure rather than
          // an exemption. Deleting the caveat sentence used to remove the
          // platform's name too, which made this check skip the tool — the
          // mutation guard caught that the guard had a hole.
          if (!enumerates && !prose.includes(platform)) continue;
          if (!/cannot be fetched|post text only/.test(prose)) {
            offenders.push(`${name} reaches ${platform} without ${capName}'s caveat`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a tool that talks about platforms declares which capability it uses", async () => {
    // Forces a new tool making platform claims to be placed, rather than
    // silently escaping every check above.
    const undeclared: string[] = [];
    for (const tool of await shippedTools()) {
      if (capabilityOf(tool.name)) continue;
      const named = claimed(proseOf(tool));
      if (named.size) {
        undeclared.push(`${tool.name} names ${[...named].sort().join(", ")} but declares no capability`);
      }
    }
    expect(undeclared).toEqual([]);
  });
});

/**
 * The fallback route's own facts, now that the server publishes them.
 *
 * `spend.ts` used to justify a two-network limit on `search_spoken_mentions`
 * with "the words would have to be inferred from the audio, which is a
 * different tool at a different price". Both halves were false — it is the `_`
 * arm of the same `fetch_post_transcript`, behind the same
 * `get_post_transcript`, at the same 1 credit — and nothing could contradict
 * it, because the only description of the fallback lived in the other repo's
 * Rust and this side was inferring it.
 *
 * `transcript.speechToText` in the generated manifest now carries the reach,
 * the configuration gate and the two platforms that are out regardless. These
 * check the prose against it.
 */
describe("what the prose says about listening matches what the server publishes", () => {
  it("publishes a fallback route at all, since transcript is not a ceiling", () => {
    // If this ever goes missing, the checks below stop checking anything —
    // which is precisely how the original claim survived.
    expect(listIsCeiling("transcript")).toBe(false);
    const route = fallbackRoute("transcript");
    expect(route, "transcript.speechToText is what the checks below read").toBeTruthy();
    expect(route!.platforms.length).toBeGreaterThan(0);
    expect(route!.requiresConfiguration).toBeTruthy();
  });

  it("no tool calls the fallback a different tool or a different price", async () => {
    // The exact shape of the claim that was wrong, in any tool that makes it.
    const offenders: string[] = [];
    for (const tool of await shippedTools()) {
      const prose = proseOf(tool);
      if (!/speech-to-text|transcrib|listen/.test(prose)) continue;
      if (/different tool/.test(prose) && /different price/.test(prose)) {
        offenders.push(`${tool.name} calls listening a different tool at a different price`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no tool offers to listen to a platform the fallback cannot fetch", async () => {
    // Reddit's videoUrl is an HLS manifest and Bilibili carries no media URL
    // at all, so both answer a spoken-mention sweep with silence that reads as
    // "nobody said it". The manifest names them and why.
    const unreachable = Object.keys(fallbackRoute("transcript")?.unreachable ?? {});
    expect(unreachable.length, "the manifest should name the exclusions").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const tool of await shippedTools()) {
      // Only the tools whose job is listening; a tool that merely mentions
      // Reddit for comments or discovery is not claiming to hear it.
      if (!/spoken|said out loud|words actually spoken/i.test(tool.description ?? "")) continue;
      for (const platform of unreachable) {
        // Naming it to rule it out is the correct behaviour, so only an
        // unqualified mention counts.
        const prose = proseOf(tool);
        if (!prose.includes(platform)) continue;
        if (!/cannot|not reach|no audio|excluded/.test(prose)) {
          offenders.push(`${tool.name} names ${platform} without saying it cannot be listened to`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the tool that owns the route says it needs configuring", async () => {
    // A capability that silently returns nothing when unconfigured is
    // indistinguishable from one that does not exist. get_post_transcript is
    // where a host finds out, so it is where it has to be said.
    const transcript = (await shippedTools()).find((t) => t.name === "get_post_transcript");
    const prose = proseOf(transcript!);
    // Narrow on purpose. /configured|configuration/ passed a mutant that
    // deleted this caveat outright, because the sentence about Reddit and
    // Bilibili says "whatever the configuration" — the check was matching a
    // stray word rather than the claim. These two are the claim: the route
    // needs turning on, and an unconfigured server must not be reported as a
    // post with no transcript.
    expect(prose, "must say the route needs speech-to-text configured").toMatch(
      /speech-to-text configured/,
    );
    expect(prose, "must say an unconfigured server is not the platform's fault").toMatch(
      /blaming the platform|about us, not about the post/,
    );
  });
});
