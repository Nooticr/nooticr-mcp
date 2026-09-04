/**
 * nooticr_login answered the same way whatever the state of the session: here is
 * a link. So signing in ended with the link still on screen, which reads as
 * though the login never took — and the call that provoked it was gone, so the
 * user had to ask for the same thing a second time.
 *
 * The tool now looks before it offers, and finishes what the expiry
 * interrupted.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { NooticrError, type NooticrClient } from "../src/shared/nooticr.js";

/**
 * A session that is out, then in — the shape of an actual re-login. `expired`
 * flips when the user signs in, exactly as the real token does.
 */
function session(opts: { expired: boolean }) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    me: async () => {
      if (opts.expired) throw new NooticrError(401, "No nooticr access token available.");
      return { id: "u1", email: "a@b.c" };
    },
    callTool: async (name: string, args: unknown) => {
      if (opts.expired) throw new NooticrError(401, "No nooticr access token available.");
      calls.push({ name, args });
      return {
        contentBlocks: [{ type: "text", text: "{}" }],
        structured: { platform: "tiktok", posts: [{ id: "1" }, { id: "2" }] },
      };
    },
  } as unknown as NooticrClient;
  return { client, calls };
}

async function connect(nooticr: NooticrClient) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return client;
}

describe("nooticr_login", () => {
  it("offers a link only when one is needed", async () => {
    const state = { expired: true };
    const { client: nooticr } = session(state);
    const client = await connect(nooticr);
    const out = (await client.callTool({ name: "nooticr_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(out.signedIn).toBe(false);
    expect(String(out.loginUrl)).toContain("mcp-login");
  });

  it("does not hand a link to someone already signed in", async () => {
    const { client: nooticr } = session({ expired: false });
    const client = await connect(nooticr);
    const out = (await client.callTool({ name: "nooticr_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(out.signedIn).toBe(true);
    // The reported bug: the link outliving the reason for it.
    expect(out.loginUrl ?? null).toBeNull();
    expect(String(out.message)).toMatch(/already signed in/i);
  });

  it("names the interrupted call while the user is away", async () => {
    const state = { expired: true };
    const { client: nooticr } = session(state);
    const client = await connect(nooticr);
    // The call that expires is what the user actually wanted.
    const failed = await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "fitness" },
    });
    expect(failed.isError).toBe(true);

    const out = (await client.callTool({ name: "nooticr_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(out.pendingAction).toBe("discover_social_posts");
    expect(String(out.message)).toContain("discover_social_posts");
  });

  it("finishes the interrupted call once the session is back", async () => {
    const state = { expired: true };
    const { client: nooticr, calls } = session(state);
    const client = await connect(nooticr);
    await client.callTool({ name: "discover_social_posts", arguments: { niche: "fitness" } });

    // The user signs in; the token starts working again.
    state.expired = false;

    const res = await client.callTool({ name: "nooticr_login", arguments: {} });
    const out = res.structuredContent as Record<string, unknown>;
    expect(res.isError).toBeFalsy();
    // The point of the change: the answer, not another prompt.
    expect(out.resumed).toBe("discover_social_posts");
    expect(out.signedIn).toBe(true);
    expect((out.posts as unknown[]).length).toBe(2);
    // Re-run with the arguments the user originally gave.
    expect(calls).toEqual([{ name: "discover_social_posts", args: { niche: "fitness" } }]);
  });

  it("resumes once, not on every later login", async () => {
    const state = { expired: true };
    const { client: nooticr } = session(state);
    const client = await connect(nooticr);
    await client.callTool({ name: "discover_social_posts", arguments: { niche: "fitness" } });
    state.expired = false;
    await client.callTool({ name: "nooticr_login", arguments: {} });

    const second = (await client.callTool({ name: "nooticr_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(second.resumed ?? null).toBeNull();
    expect(second.signedIn).toBe(true);
  });

  it("still reports the sign-in when the retry fails for its own reasons", async () => {
    const state = { expired: true };
    let brokenAfterLogin = false;
    const nooticr = {
      me: async () => {
        if (state.expired) throw new NooticrError(401, "No nooticr access token available.");
        return { id: "u1" };
      },
      callTool: async (name: string) => {
        if (state.expired) throw new NooticrError(401, "No nooticr access token available.");
        if (brokenAfterLogin) throw new NooticrError(500, "upstream is down");
        return { contentBlocks: [], structured: {} };
      },
    } as unknown as NooticrClient;
    const client = await connect(nooticr);
    await client.callTool({ name: "discover_social_posts", arguments: { niche: "x" } });
    state.expired = false;
    brokenAfterLogin = true;
    const res = await client.callTool({ name: "nooticr_login", arguments: {} });
    // Being signed in is still news, and the failure must say which part failed.
    expect(String((res.content as Array<{ text: string }>)[0].text)).toContain("Signed in, but");
  });
});

// "nooticr API error (401) from /mcp" and "No nooticr access token available."
// both describe the machine's problem, not the reader's. Neither says what to
// do about it, and both are what a user saw when their session lapsed.
describe("an expired session explains itself", () => {
  // analyze_post goes through startVideoAnalysis rather than callTool, which
  // is exactly why it had its own error message to begin with.
  const expired = (message: string, status: number) =>
    ({
      me: async () => { throw new NooticrError(status, message); },
      callTool: async () => { throw new NooticrError(status, message); },
      startVideoAnalysis: async () => { throw new NooticrError(status, message); },
    }) as unknown as NooticrClient;

  it.each([
    ["a 401 from the API", "nooticr API error (401) from /mcp", 401],
    ["nothing left to send", "No nooticr access token available.", 400],
  ])("%s tells the user to sign in", async (_label, message, status) => {
    const client = await connect(expired(message, status));
    const res = await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "fitness" },
    });
    const text = String((res.content as Array<{ text: string }>)[0].text);
    expect(res.isError).toBe(true);
    expect(text).toMatch(/session has expired/i);
    // Name the way out, not just the problem.
    expect(text).toContain("nooticr_login");
    // And that the work is not lost, which is only true now that it resumes.
    expect(text).toMatch(/no need to ask twice/i);
    // The underlying text stays, for whoever has to debug it.
    expect(text).toContain(message);
  });

  it("says it for the analysis tools too, which built their own message", async () => {
    const client = await connect(expired("nooticr API error (401) from /mcp", 401));
    const res = await client.callTool({
      name: "analyze_post",
      arguments: { url: "https://www.tiktok.com/@a/video/1" },
    }, undefined, { timeout: 30_000 });
    const text = String((res.content as Array<{ text: string }>)[0].text);
    expect(text).toMatch(/session has expired/i);
    expect(text).toContain("nooticr_login");
  });

  it("leaves an unrelated failure alone", async () => {
    const broken = {
      me: async () => ({ id: "u1" }),
      callTool: async () => { throw new NooticrError(500, "upstream is down"); },
    } as unknown as NooticrClient;
    const client = await connect(broken);
    const res = await client.callTool({ name: "discover_social_posts", arguments: { niche: "x" } });
    const text = String((res.content as Array<{ text: string }>)[0].text);
    expect(text).toContain("upstream is down");
    // A 500 is not a login problem, and saying so would send the user off to
    // re-authenticate for nothing.
    expect(text).not.toMatch(/session has expired/i);
  });
});
