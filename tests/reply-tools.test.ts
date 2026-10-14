/**
 * The R1 reply tools (nooticr-server#180): thin passthroughs. What matters here
 * is that the write tool cannot be called without the confirmation the server
 * demands, and that arguments reach the server untouched.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";
import { TOOL_DEFINITIONS } from "../src/shared/tools-def.js";

async function connect() {
  const calls: Array<{ name: string; args: unknown }> = [];
  const nooticr = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [], structured: { posted: true } };
    },
  } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("reply tools", () => {
  it("tools-def mirrors the registered descriptions of the reply tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const name of ["list_comments_to_answer", "draft_comment_reply", "post_comment_reply"]) {
      const registered = tools.find((t) => t.name === name)?.description;
      const mirror = TOOL_DEFINITIONS.find((t) => t.name === name)?.description;
      expect(mirror, name).toBe(registered);
    }
  });

  it("post_comment_reply refuses a call without confirm and the token", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "post_comment_reply", arguments: { draftId: "d1" } });
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it("post_comment_reply forwards the confirmed draft as given", async () => {
    const { client, calls } = await connect();
    const args = { draftId: "d1", confirm: true, confirmationToken: "tok" };
    const res = await client.callTool({ name: "post_comment_reply", arguments: args });
    expect(res.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "post_comment_reply", args }]);
  });

  it("draft_comment_reply requires the comment, the post and the platform", async () => {
    const { client, calls } = await connect();
    const bad = await client.callTool({ name: "draft_comment_reply", arguments: { platform: "youtube" } });
    expect(bad.isError).toBe(true);
    const args = { platform: "youtube", commentId: "c1", postId: "p1", text: "Thanks!" };
    await client.callTool({ name: "draft_comment_reply", arguments: args });
    expect(calls).toEqual([{ name: "draft_comment_reply", args }]);
  });

  it("list_comments_to_answer bounds sinceDays and limit like the server", async () => {
    const { client } = await connect();
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: { sinceDays: 31 } })).isError).toBe(true);
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: { limit: 101 } })).isError).toBe(true);
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: { sinceDays: 7, limit: 30 } })).isError).toBeFalsy();
  });
});
