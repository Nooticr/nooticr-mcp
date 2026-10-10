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
import { readFileSync } from "node:fs";
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

/**
 * Enum values that are not a network at all.
 *
 * `discover_social_posts` takes `any` to mean "search across everything"
 * rather than to name a tenth platform, so it has no entry in the served list
 * and must not read as one. Kept as a named set rather than a skipped test so
 * that a genuinely unservable platform cannot hide behind the exception.
 */
const PLATFORM_SENTINELS = new Set(["any"]);

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
 *
 * The third arrived with `discover_hashtags` (issue #32), which now names the
 * eight networks it counts tags across and the one it cannot sweep at all.
 * Adding a marker is the intended way to widen this; rewording the check is not.
 */
const EXCLUSION_MARKERS = [
  "not searchable here:",
  "cannot be listened to:",
  "cannot be swept at all:",
];

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

  /**
   * The enum, not the prose.
   *
   * Every check above reads what a description *says*. A platform can also be
   * offered by the input schema alone, and that is the half nothing looked at:
   * `find_people_with_problem` accepted `linkedin` in its `platforms` enum
   * while its dispatcher has no LinkedIn arm at all, so every LinkedIn search
   * it issued returned `unsupported discover platform` — not intermittently,
   * on every code path (#77). The prose never named LinkedIn, so the prose
   * checks were all green and correct.
   *
   * A schema is a stronger claim than prose, too: a host picks arguments from
   * the enum without reading a word, so an unservable value there is an
   * offer nobody had to misread to accept.
   */
  it("no tool offers a platform in its schema that its capability cannot reach", async () => {
    const offered: string[] = [];
    for (const tool of await shippedTools()) {
      const cap = capabilityOf(tool.name);
      if (!cap) continue;
      const [capName] = cap;
      const served = platformsFor(capName);
      // Capabilities with no upstream fetch (a publish target, a configured
      // link) have no served list to check against.
      if (!served.length) continue;
      const props = (tool.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {};
      for (const [arg, schema] of Object.entries(props)) {
        if (!/^platforms?$/.test(arg)) continue;
        const s = schema as { enum?: unknown[]; items?: { enum?: unknown[] } };
        const values = (s.enum ?? s.items?.enum ?? []).filter(
          (v): v is string => typeof v === "string",
        );
        for (const value of values) {
          if (PLATFORM_SENTINELS.has(value)) continue;
          const real = ALIASES[value] ?? value;
          if (!served.includes(real)) {
            offered.push(`${tool.name}.${arg} offers ${value}, which ${capName} cannot reach`);
          }
        }
      }
    }
    expect(offered).toEqual([]);
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

/**
 * The skill file makes the same platform claims the tool descriptions do, to a
 * reader who will never see a tool description — so it gets the same check.
 *
 * A skill is loaded into a host's context and believed. One that says creator
 * search covers YouTube sends the model to spend a credit on a call the enum
 * rejects, and the skill is the last place anyone would look for the cause.
 * Everything here is derived from `vendor/platform-capabilities.json` — the
 * manifest nooticr-server generates beside its dispatchers — so the skill
 * cannot drift from the server without failing, in either direction.
 *
 * Lowercased and compared against the manifest's own ids, the same convention
 * `proseOf` uses above, rather than a display-name map that would then need
 * its own test. `twitter` is skipped in the negative assertions: the skill
 * spells it "X", which is too short to substring-match without false hits.
 */
describe("the social-listening skill's platform claims", () => {
  const skill = readFileSync(".agents/skills/social-listening/SKILL.md", "utf8");

  /** A row of the support table, as [asked, reaches, doesNot], lowercased. */
  function row(needle: string): [string, string, string] {
    const line = skill.split("\n").find((l) => l.startsWith("|") && l.includes(needle));
    expect(line, `no table row mentioning "${needle}"`).toBeTruthy();
    const cells = (line as string).toLowerCase().split("|").map((c) => c.trim());
    return [cells[1], cells[2], cells[3]];
  }
  const SAFE = (p: string) => p !== "twitter";
  const COUNT_WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

  it("has the frontmatter a host needs to load it at all", () => {
    // Progressive disclosure: a host reads these two before anything else.
    expect(skill.startsWith("---\n")).toBe(true);
    const front = skill.slice(4, skill.indexOf("\n---", 4));
    expect(front).toMatch(/^name: social-listening$/m);
    const description = front.match(/^description: (.*)$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(150);
    // A host may shorten the description, so the boundary has to be in it —
    // implicit matching on "post this for me" is the expensive wrong trigger.
    expect(description).toMatch(/Do not use/);
  });

  it("names every network creator search reaches, and no network it does not", () => {
    const [, reaches, doesNot] = row("Creator search");
    const served = platformsFor("creatorSearch");
    for (const p of served) expect(reaches, `creator-search row omits ${p}`).toContain(p);
    for (const p of KNOWN_PLATFORMS.filter((x) => !served.includes(x) && SAFE(x))) {
      expect(reaches, `creator-search row over-advertises ${p}`).not.toContain(p);
    }
    // The specific wrong claim this exists for: a tool description once
    // advertised YouTube to an enum that rejects it.
    expect(doesNot, "YouTube must be named as unreachable, not merely omitted").toContain("youtube");
  });

  it("names the caption networks and no others, and says the rest are asynchronous", () => {
    const [, reaches, doesNot] = row("Spoken words");
    for (const p of platformsFor("transcript")) expect(reaches).toContain(p);
    // The two whose audio cannot be fetched at all must be called out, or
    // silence there reads as "nobody said anything".
    const unreachable = Object.keys(fallbackRoute("transcript")?.unreachable ?? {});
    expect(unreachable.length).toBeGreaterThan(0);
    for (const p of unreachable) expect(doesNot, `spoken row does not exclude ${p}`).toContain(p);
    // A `transcribing: true` is the job accepted. A skill that omits this
    // turns the first poll into a reported failure.
    expect(skill).toMatch(/retryAfterMs/);
    expect(skill).toMatch(/poll is free/i);
    expect(skill).toMatch(/asynchronous/i);
  });

  it("counts the networks the way the manifest counts them", () => {
    // "nine" and "all ten" go stale silently the day a dispatcher gains a
    // platform, which is the drift `contract:manifest` catches upstream and
    // nothing caught in prose.
    for (const [needle, capability] of [
      ["single post by URL", "postDetail"],
      ["brand-mention sweeps", "mentions"],
      ["Comment threads", "comments"],
    ] as const) {
      const [, reaches] = row(needle);
      const word = COUNT_WORD[platformsFor(capability).length];
      expect(reaches, `${needle} row says "${reaches}", manifest says ${word}`).toContain(word);
    }
  });

  it("names the network each nine-of-ten row leaves out", () => {
    const missing = (c: string) => KNOWN_PLATFORMS.filter((p) => !platformsFor(c).includes(p) && SAFE(p));
    for (const [needle, capability] of [
      ["brand-mention sweeps", "mentions"],
      ["Comment threads", "comments"],
    ] as const) {
      const [, , doesNot] = row(needle);
      for (const p of missing(capability)) {
        expect(doesNot, `${needle} row does not exclude ${p}`).toContain(p);
      }
    }
    // Xiaohongshu is in the sweep list but its comments are not readable, so
    // it matches post text only. Under-counting a network silently is worse
    // than skipping it.
    for (const p of commentsUnavailable("mentions")) {
      expect(skill.toLowerCase(), `skill never says ${p} is text-only in a sweep`).toContain(p);
    }
    expect(skill).toMatch(/post text\s*\*{0,2}\s*only/i);
  });

  it("states the boundaries that are not about platforms", () => {
    // The submission tells a reviewer this cannot write to a social account.
    // The skill is what the model reads, so it must say the same thing.
    expect(skill).toMatch(/cannot post/i);
    expect(skill).toMatch(/draft/i);
    expect(skill).toMatch(/public data only/i);
    // Every tool returning third-party text frames it as evidence; a skill
    // that omits the framing undoes that for the whole surface.
    expect(skill).toMatch(/data, not instruction/i);
  });
});

/**
 * The store description exists in five languages, and every one of them states
 * two network counts. Those counts are claims about the server.
 *
 * The English one is what a reviewer reads and what everyone would notice going
 * stale. The other four are what nobody re-reads: a dispatcher gaining a
 * platform would leave four translations quietly wrong, in a listing that is
 * the first thing a user in that language sees. So all five are checked
 * against the same manifest, in their own number words.
 */
describe("the localised store descriptions", () => {
  const doc = readFileSync("docs/app-description.i18n.md", "utf8");

  /**
   * Per language: how it spells the two counts, and the two halves of the one
   * claim a reviewer checks against behaviour.
   *
   * The refusal and the hand-back are listed as whole phrases rather than
   * matched by keyword. The first version of this test looked for
   * draft|brouillon|rascunho|… anywhere in the section and passed a mutant
   * that replaced "comes back as a draft for you to send yourself" with "and
   * it posts for you" — because the *scored draft* feature two paragraphs
   * above still said "rascunho". A guard that its own mutant survives is a
   * green light, not a check.
   */
  const LANGUAGES: Record<string, { counts: Record<number, string>; refuses: RegExp; handsBack: RegExp }> = {
    English: {
      counts: { 9: "nine", 10: "ten" },
      refuses: /won't post or reply on your behalf/i,
      handsBack: /comes back as a draft for you to send yourself/i,
    },
    "Français": {
      counts: { 9: "neuf", 10: "dix" },
      refuses: /ne publiera pas et ne répondra pas à votre place/i,
      handsBack: /revient sous forme de brouillon, que vous envoyez vous-même/i,
    },
    Deutsch: {
      counts: { 9: "neun", 10: "zehn" },
      refuses: /wird nichts in Ihrem Namen posten oder beantworten/i,
      handsBack: /kommt als Entwurf zurück, den Sie selbst senden/i,
    },
    "Português": {
      counts: { 9: "nove", 10: "dez" },
      refuses: /não vai publicar nem responder no seu lugar/i,
      handsBack: /volta como rascunho, para você mesmo enviar/i,
    },
    "Español": {
      counts: { 9: "nueve", 10: "diez" },
      refuses: /No publicará ni responderá en tu nombre/i,
      handsBack: /vuelve como borrador para que lo envíes tú/i,
    },
  };

  /** The body of one `## Language` section. */
  function section(language: string): string {
    const heading = doc.split("\n").findIndex((l) => l.startsWith("## ") && l.includes(language));
    expect(heading, `no section for ${language}`).toBeGreaterThan(-1);
    const rest = doc.split("\n").slice(heading + 1);
    const end = rest.findIndex((l) => l.startsWith("## "));
    return rest.slice(0, end === -1 ? undefined : end).join("\n");
  }

  it.each(Object.keys(LANGUAGES))("%s counts the networks the way the server does", (language) => {
    const body = section(language);
    const read = platformsFor("postDetail").length;
    const swept = platformsFor("mentions").length;
    // Distinct numbers, or this test proves nothing.
    expect(read).not.toBe(swept);
    expect(body, `${language} does not say ${LANGUAGES[language].counts[read]} networks are read`)
      .toContain(LANGUAGES[language].counts[read]);
    expect(body, `${language} does not say ${LANGUAGES[language].counts[swept]} networks are swept`)
      .toContain(LANGUAGES[language].counts[swept]);
  });

  it.each(Object.keys(LANGUAGES))("%s names every network, spelled the way the platform spells it", (language) => {
    const body = section(language);
    // Platform names are proper nouns and do not translate. A translation that
    // localises "Xiaohongshu" or drops a network from the list is describing a
    // different product.
    for (const p of ["TikTok", "Instagram", "YouTube", "Reddit", "LinkedIn", "Douyin", "Xiaohongshu", "Weibo", "Bilibili"]) {
      expect(body, `${language} omits ${p}`).toContain(p);
    }
  });

  it.each(Object.keys(LANGUAGES))("%s keeps both halves of the never-posts promise", (language) => {
    // No connection here carries write permission on any network, so this is
    // the claim a reviewer can check against behaviour — and the one a
    // translator is most likely to soften into "it helps you post".
    const body = section(language);
    const { refuses, handsBack } = LANGUAGES[language];
    expect(body, `${language} does not refuse to post on the user's behalf`).toMatch(refuses);
    expect(body, `${language} does not say the output comes back for you to send`).toMatch(handsBack);
  });

  it("offers exactly three example prompts, and none of them names a real brand", () => {
    const prompts = doc.match(/^\d\. \*\*(.+?)\*\*$/gm) ?? [];
    expect(prompts.length, "the panel takes at most three").toBe(3);
    for (const line of prompts) {
      // A placeholder, not a live URL or somebody else's brand: the first
      // reads as an endorsement, the second dies when the post is deleted.
      expect(line, `prompt has no placeholder: ${line}`).toMatch(/\[[^\]]+\]/);
      expect(line).not.toMatch(/https?:\/\//);
    }
  });
});
