/**
 * The R1 reply tools (nooticr-server#180): thin passthroughs. What matters here
 * is that the write tool cannot be called without the confirmation the server
 * demands, and that arguments reach the server untouched.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { NooticrClient, NooticrError } from "../src/shared/nooticr.js";
import { COMMENT_TEXT_NOTE, NO_BRAND_GROUNDING_NOTE } from "../src/shared/replies.js";
import { TOOL_DEFINITIONS } from "../src/shared/tools-def.js";

async function connect(fail?: Error) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const nooticr = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (fail) throw fail;
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

  // nooticr-server #124: several comments on one account in one call, each
  // its own written reply. The server refuses the mixed shapes too; checking
  // them here keeps a call naming no comment from ever reaching it.
  it("draft_comment_reply forwards commentIds and refuses the shapes the server refuses", async () => {
    const { client, calls } = await connect();
    const batch = { platform: "youtube", commentIds: ["c1", "c2"], guidance: "thank them" };
    expect((await client.callTool({ name: "draft_comment_reply", arguments: batch })).isError).toBeFalsy();
    for (const bad of [
      { platform: "youtube", commentIds: ["c1"], commentId: "c2", postId: "p1" },
      { platform: "youtube", commentId: "c1" },
      { platform: "youtube", commentIds: [] },
      { platform: "youtube", commentIds: Array.from({ length: 11 }, (_, i) => `c${i}`) },
    ]) {
      const res = await client.callTool({ name: "draft_comment_reply", arguments: bad });
      expect(res.isError, JSON.stringify(bad)).toBe(true);
    }
    expect(calls).toEqual([{ name: "draft_comment_reply", args: batch }]);
  });

  it("list_comments_to_answer bounds sinceDays and limit like the server", async () => {
    const { client } = await connect();
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: { sinceDays: 31 } })).isError).toBe(true);
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: { limit: 101 } })).isError).toBe(true);
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: { sinceDays: 7, limit: 30 } })).isError).toBeFalsy();
  });

  it("list_comments_to_answer and draft_comment_reply forward the `account` connection id", async () => {
    const { client, calls } = await connect();
    const list = { platform: "youtube", account: 42 };
    const draft = { platform: "youtube", commentId: "c1", postId: "p1", text: "Hi", account: "42" };
    expect((await client.callTool({ name: "list_comments_to_answer", arguments: list })).isError).toBeFalsy();
    expect((await client.callTool({ name: "draft_comment_reply", arguments: draft })).isError).toBeFalsy();
    expect(calls).toEqual([
      { name: "list_comments_to_answer", args: list },
      { name: "draft_comment_reply", args: draft },
    ]);
  });

  it("draft_comment_reply forwards appId, as a number or a string", async () => {
    const { client, calls } = await connect();
    const byNumber = { platform: "youtube", commentId: "c1", postId: "p1", appId: 7 };
    const byString = { platform: "youtube", commentId: "c1", postId: "p1", appId: "7" };
    expect((await client.callTool({ name: "draft_comment_reply", arguments: byNumber })).isError).toBeFalsy();
    expect((await client.callTool({ name: "draft_comment_reply", arguments: byString })).isError).toBeFalsy();
    expect(calls.map((c) => c.args)).toEqual([byNumber, byString]);
  });

  it("draft_comment_reply frames the commenter's words as data, not instructions", async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: "draft_comment_reply",
      arguments: { platform: "youtube", commentId: "c1", postId: "p1" },
    });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content).toHaveLength(1);
    // The note comes first and the payload follows it, so a text-only host reads both in order.
    expect(content[0].text).toBe(`${COMMENT_TEXT_NOTE}\n\n${JSON.stringify({ posted: true })}`);
  });

  it("draft_comment_reply turns the no_brand_grounding refusal into a question for the user", async () => {
    const message = "No brand voice is set for this workspace. Nothing was charged.";
    const { client } = await connect(new NooticrError(400, message, { code: "-32602", body: { code: "no_brand_grounding" } }));
    const res = await client.callTool({
      name: "draft_comment_reply",
      arguments: { platform: "youtube", commentId: "c1", postId: "p1" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0].text;
    expect(text).toBe(`${message}\n\n${NO_BRAND_GROUNDING_NOTE}`);
  });

  it("draft_comment_reply leaves other refusals as they were", async () => {
    const { client } = await connect(new NooticrError(400, "product not found", { code: "-32602" }));
    const res = await client.callTool({
      name: "draft_comment_reply",
      arguments: { platform: "youtube", commentId: "c1", postId: "p1", appId: 99 },
    });
    expect(res.isError).toBe(true);
    expect((res.content as Array<{ text: string }>)[0].text).toBe("draft_comment_reply failed: product not found");
  });

  it("the client keeps the backend's error data, which is how the refusal is recognised", async () => {
    const real = new NooticrClient("http://127.0.0.1:1", (async () => "t") as never);
    const message = "No brand voice is set for this workspace. Nothing was charged.";
    (real as unknown as { request: unknown }).request = async () => ({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message, data: { code: "no_brand_grounding" } },
    });
    const err = await real.callTool("draft_comment_reply", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NooticrError);
    expect((err as NooticrError).body).toEqual({ code: "no_brand_grounding" });

    const client = new Client({ name: "test", version: "1.0.0" });
    const server = createMcpServer(async () => real);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    const res = await client.callTool({
      name: "draft_comment_reply",
      arguments: { platform: "youtube", commentId: "c1", postId: "p1" },
    });
    expect((res.content as Array<{ text: string }>)[0].text).toContain(NO_BRAND_GROUNDING_NOTE);
  });
});
