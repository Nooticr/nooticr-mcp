import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Four registry descriptors were probed on a schedule and 404'd **by
 * omission** — 92 probes each for the A2A agent cards, 15 each for the MCP
 * server card and Glama's format, over five days (#67).
 *
 * Nothing broke for a user. But the product is distributed through exactly
 * these directories, and `openai-apps-challenge` right above them already
 * treats its own 404 as a decision with a comment explaining it. These four
 * had no decision behind them; they 404'd because nobody had looked.
 *
 * This test does not assert they are published — three of them deliberately
 * are not. It asserts the decision is written down and reachable, so the next
 * person finds an answer rather than a blank.
 */
const SOURCE = readFileSync(
  join(process.cwd(), "cloudflare", "src", "index.ts"),
  "utf8",
);

const PROBED = [
  "/.well-known/agent.json",
  "/.well-known/agent-card.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/glama.json",
];

describe("descriptors we are asked for on a schedule", () => {
  it.each(PROBED)("%s is named, so its 404 is a decision and not an oversight", (path) => {
    expect(SOURCE, `${path} is probed on a schedule and should be accounted for`).toContain(path);
  });

  it("says why, where the reason belongs — beside the code", () => {
    // The issue's actual ask: "we publish X and Y and deliberately not Z" is
    // worth writing down either way.
    expect(SOURCE).toMatch(/We do not speak\s*\n?\s*\/\/\s*A2A/);
    expect(SOURCE).toContain("neither schema has been read");
  });

  it("answers with the server's identity rather than a blank 404", () => {
    // A crawler author debugging a missing listing gets something to act on.
    expect(SOURCE).toContain('error: "not_published"');
    expect(SOURCE).toContain("published: [");
  });

  it("does not claim to publish a descriptor it 404s", () => {
    // The failure this guards against is the tempting one: filling the 404
    // body with a plausible-looking document. Everything in `published` has to
    // be a path this worker actually serves.
    const published = ["oauth-authorization-server", "oauth-protected-resource", "openid-configuration"];
    for (const doc of published) {
      expect(
        SOURCE,
        `${doc} is listed as published, so a route must serve it`,
      ).toContain(`"/.well-known/${doc}"`);
    }
    // And none of the four declined ones may appear in that list.
    const body = SOURCE.slice(SOURCE.indexOf("published: ["), SOURCE.indexOf("documentation:"));
    for (const path of PROBED) {
      expect(body, `${path} is declined and must not be advertised as published`).not.toContain(path);
    }
  });
});
