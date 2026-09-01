/**
 * The parts of the server a host reads before it calls anything: the hints it
 * uses to decide whether a tool needs a confirmation, and the prompts it offers
 * a user who does not know any tool names.
 *
 * Both were measured against the live server before this existed: 11 of 24
 * tools carried annotations and `prompts/list` returned an empty array. The
 * gaps were invisible because nothing failed — a host simply prompted more
 * often than it needed to, and offered nothing up front.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { OrchynClient } from "../src/shared/orchyn.js";

function dummyClient(): OrchynClient {
  return { callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as OrchynClient;
}

async function connect() {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => dummyClient());
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

// The one tool with a side effect: it opens a Stripe checkout session, and a
// second call is a second session.
const NOT_READ_ONLY = ["buy_orchyn_credits"];

describe("tool annotations", () => {
  it("every tool carries them", async () => {
    const { tools } = await (await connect()).listTools();
    const bare = tools.filter((t) => !t.annotations || Object.keys(t.annotations).length === 0);
    expect(bare.map((t) => t.name), "tools a host cannot reason about").toEqual([]);
    expect(tools).toHaveLength(24);
  });

  it("marks read-only exactly where it is true", async () => {
    const { tools } = await (await connect()).listTools();
    const writes = tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name);
    // A host auto-approves on readOnlyHint, so a wrong `true` here is worse
    // than a missing annotation: it waves through a real side effect.
    expect(writes).toEqual(NOT_READ_ONLY);
  });

  it("does not claim a checkout is idempotent", async () => {
    const { tools } = await (await connect()).listTools();
    const buy = tools.find((t) => t.name === "buy_orchyn_credits");
    expect(buy?.annotations?.idempotentHint).toBe(false);
    expect(buy?.annotations?.destructiveHint).toBe(false);
  });

  it("says which tools reach outside orchyn", async () => {
    const { tools } = await (await connect()).listTools();
    const closed = tools.filter((t) => t.annotations?.openWorldHint === false).map((t) => t.name);
    // Only the account tools stay inside orchyn; everything else hits a platform.
    expect(closed.sort()).toEqual(["check_orchyn_credits", "orchyn_login"]);
  });
});

describe("prompts", () => {
  it("offers the workflows a user cannot guess tool names for", async () => {
    const { prompts } = await (await connect()).listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([
      "check_my_draft",
      "niche_briefing",
      "post_teardown",
      "repurpose_everywhere",
      "teardown_creator",
      "what_to_make_next",
      "why_this_won",
    ]);
    for (const p of prompts) {
      expect(p.title, `${p.name} has no title to show`).toBeTruthy();
      expect(p.description, `${p.name} has no description`).toBeTruthy();
    }
  });

  it("asks only for what it cannot infer", async () => {
    const { prompts } = await (await connect()).listPrompts();
    const required = Object.fromEntries(
      prompts.map((p) => [p.name, (p.arguments ?? []).filter((a) => a.required).map((a) => a.name)]),
    );
    expect(required).toEqual({
      teardown_creator: ["handle"],
      niche_briefing: ["niche"],
      check_my_draft: ["draft"],
      post_teardown: ["url"],
      why_this_won: ["urls"],
      what_to_make_next: ["url"],
      repurpose_everywhere: ["url"],
    });
  });

  it("orders the work cheapest-evidence-first", async () => {
    const client = await connect();
    const got = await client.getPrompt({
      name: "post_teardown",
      arguments: { url: "https://www.tiktok.com/@a/video/1" },
    });
    const text = got.messages.map((m) => (m.content as { text: string }).text).join("\n");
    // The transcript is the cheap exact evidence, so it must come before the
    // analysis that would otherwise paraphrase it.
    expect(text.indexOf("get_post_transcript")).toBeLessThan(text.indexOf("analyze_post_fast"));
    expect(text).toContain("https://www.tiktok.com/@a/video/1");
  });

  it("only spends the expensive visual pass when asked for it", async () => {
    const client = await connect();
    const cheap = await client.getPrompt({
      name: "post_teardown",
      arguments: { url: "https://x.com/a/1" },
    });
    const rich = await client.getPrompt({
      name: "post_teardown",
      arguments: { url: "https://x.com/a/1", visuals: "yes" },
    });
    const textOf = (r: Awaited<ReturnType<Client["getPrompt"]>>) =>
      r.messages.map((m) => (m.content as { text: string }).text).join("\n");
    expect(textOf(cheap)).toContain("Skip analyze_post");
    expect(textOf(rich)).not.toContain("Skip analyze_post");
  });
});
