/**
 * orchyn_login answered the same way whatever the state of the session: here is
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
import { OrchynError, type OrchynClient } from "../src/shared/orchyn.js";

/**
 * A session that is out, then in — the shape of an actual re-login. `expired`
 * flips when the user signs in, exactly as the real token does.
 */
function session(opts: { expired: boolean }) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    me: async () => {
      if (opts.expired) throw new OrchynError(401, "No orchyn access token available.");
      return { id: "u1", email: "a@b.c" };
    },
    callTool: async (name: string, args: unknown) => {
      if (opts.expired) throw new OrchynError(401, "No orchyn access token available.");
      calls.push({ name, args });
      return {
        contentBlocks: [{ type: "text", text: "{}" }],
        structured: { platform: "tiktok", posts: [{ id: "1" }, { id: "2" }] },
      };
    },
  } as unknown as OrchynClient;
  return { client, calls };
}

async function connect(orchyn: OrchynClient) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => orchyn);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  return client;
}

describe("orchyn_login", () => {
  it("offers a link only when one is needed", async () => {
    const state = { expired: true };
    const { client: orchyn } = session(state);
    const client = await connect(orchyn);
    const out = (await client.callTool({ name: "orchyn_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(out.signedIn).toBe(false);
    expect(String(out.loginUrl)).toContain("mcp-login");
  });

  it("does not hand a link to someone already signed in", async () => {
    const { client: orchyn } = session({ expired: false });
    const client = await connect(orchyn);
    const out = (await client.callTool({ name: "orchyn_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(out.signedIn).toBe(true);
    // The reported bug: the link outliving the reason for it.
    expect(out.loginUrl ?? null).toBeNull();
    expect(String(out.message)).toMatch(/already signed in/i);
  });

  it("names the interrupted call while the user is away", async () => {
    const state = { expired: true };
    const { client: orchyn } = session(state);
    const client = await connect(orchyn);
    // The call that expires is what the user actually wanted.
    const failed = await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "fitness" },
    });
    expect(failed.isError).toBe(true);

    const out = (await client.callTool({ name: "orchyn_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(out.pendingAction).toBe("discover_social_posts");
    expect(String(out.message)).toContain("discover_social_posts");
  });

  it("finishes the interrupted call once the session is back", async () => {
    const state = { expired: true };
    const { client: orchyn, calls } = session(state);
    const client = await connect(orchyn);
    await client.callTool({ name: "discover_social_posts", arguments: { niche: "fitness" } });

    // The user signs in; the token starts working again.
    state.expired = false;

    const res = await client.callTool({ name: "orchyn_login", arguments: {} });
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
    const { client: orchyn } = session(state);
    const client = await connect(orchyn);
    await client.callTool({ name: "discover_social_posts", arguments: { niche: "fitness" } });
    state.expired = false;
    await client.callTool({ name: "orchyn_login", arguments: {} });

    const second = (await client.callTool({ name: "orchyn_login", arguments: {} }))
      .structuredContent as Record<string, unknown>;
    expect(second.resumed ?? null).toBeNull();
    expect(second.signedIn).toBe(true);
  });

  it("still reports the sign-in when the retry fails for its own reasons", async () => {
    const state = { expired: true };
    let brokenAfterLogin = false;
    const orchyn = {
      me: async () => {
        if (state.expired) throw new OrchynError(401, "No orchyn access token available.");
        return { id: "u1" };
      },
      callTool: async (name: string) => {
        if (state.expired) throw new OrchynError(401, "No orchyn access token available.");
        if (brokenAfterLogin) throw new OrchynError(500, "upstream is down");
        return { contentBlocks: [], structured: {} };
      },
    } as unknown as OrchynClient;
    const client = await connect(orchyn);
    await client.callTool({ name: "discover_social_posts", arguments: { niche: "x" } });
    state.expired = false;
    brokenAfterLogin = true;
    const res = await client.callTool({ name: "orchyn_login", arguments: {} });
    // Being signed in is still news, and the failure must say which part failed.
    expect(String((res.content as Array<{ text: string }>)[0].text)).toContain("Signed in, but");
  });
});
