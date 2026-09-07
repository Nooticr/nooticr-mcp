/**
 * The `.well-known` endpoints, driven through the Worker's own handler.
 *
 * These are the routes nothing human ever looks at, which is exactly why they
 * are worth a test: a domain-verification challenge that answers slightly
 * wrong is rejected by a machine that will not say what it disliked, and the
 * only symptom is a submission that stays unverified. Two of the ways this
 * fails are mechanical and were both live until this test existed —
 * `wrangler secret put` keeps a trailing newline if the shell hands it one,
 * and a verifier that probes with HEAD before GET fell through every route to
 * the JSON 404.
 *
 * Driven through `worker.fetch` rather than by reading the source, because the
 * question here is what a request gets back, not what the file says.
 */
import { describe, expect, it } from "vitest";

type Fetcher = { fetch(request: Request, env: unknown, ctx: unknown): Promise<Response> };

const CHALLENGE = "https://mcp.nooticr.com/.well-known/openai-apps-challenge";
/** Shape only — the real token is a Worker secret and is not in this repo. */
const TOKEN = "test-only-challenge-token";

const ctx = { waitUntil() {}, passThroughOnException() {} };
const env = (token?: string) => ({
  PUBLIC_URL: "https://mcp.nooticr.com",
  NOOTICR_BASE_URL: "https://api.nooticr.com",
  ...(token === undefined ? {} : { OPENAI_APPS_VERIFICATION_TOKEN: token }),
});

async function get(url: string, token?: string, method = "GET") {
  const worker = ((await import("../cloudflare/src/index.js")) as unknown as { default: Fetcher }).default;
  return worker.fetch(new Request(url, { method }), env(token), ctx);
}

describe("openai-apps domain-verification challenge", () => {
  it("returns the token as bare plain text, with nothing cached in front of it", async () => {
    const res = await get(CHALLENGE, TOKEN);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(TOKEN);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    // A cached challenge outlives the token it answers with, so a re-issue
    // would be served the stale one from the edge.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("trims a token that arrives with surrounding whitespace", async () => {
    // `wrangler secret put` stores what the shell gives it. A token pasted
    // with a trailing newline is then served with one and compared
    // byte-for-byte against a token without — a rejection with nothing
    // visibly wrong at either end.
    for (const raw of [`${TOKEN}\n`, ` ${TOKEN}`, `\t${TOKEN}\r\n`]) {
      const res = await get(CHALLENGE, raw);
      expect(await res.text(), `not trimmed: ${JSON.stringify(raw)}`).toBe(TOKEN);
    }
  });

  it("answers a HEAD probe, not just a GET", async () => {
    const res = await get(CHALLENGE, TOKEN, "HEAD");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("tolerates a trailing slash", async () => {
    expect((await get(`${CHALLENGE}/`, TOKEN)).status).toBe(200);
  });

  it("404s while unset, rather than claiming the domain with an empty 200", async () => {
    for (const unset of [undefined, "", "   "]) {
      const res = await get(CHALLENGE, unset);
      expect(res.status, `unset as ${JSON.stringify(unset)} did not 404`).toBe(404);
      expect(await res.text()).not.toBe("");
    }
  });

  it("does not hand the token to a method that is not a read", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await get(CHALLENGE, TOKEN, method);
      expect(await res.text(), `${method} returned the token`).not.toContain(TOKEN);
    }
  });

  it("keeps the token out of the repo", async () => {
    // The route reads a Worker secret on purpose. The token is public once
    // served, but committing it means rotating it is a code change and a
    // deploy, and a stale copy in git outlives the one that is live.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("cloudflare/src/index.ts", "utf8");
    expect(source).toContain("env.OPENAI_APPS_VERIFICATION_TOKEN");
    expect(source).toMatch(/wrangler secret put OPENAI_APPS_VERIFICATION_TOKEN/);
    // A committed token would be a long opaque base64url run next to the path.
    const near = source.slice(source.indexOf("openai-apps-challenge"));
    expect(near.slice(0, 600)).not.toMatch(/["'][A-Za-z0-9_-]{30,}["']/);
  });
});
