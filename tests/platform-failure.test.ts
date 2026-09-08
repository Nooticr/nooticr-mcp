/**
 * A network that errored is not a network that came back empty.
 *
 * Those want opposite responses — a different query versus a different network
 * — and until this split existed nothing said which had happened. A real
 * session shows the cost: Reddit's discovery endpoint failed, the model read
 * "The social data service could not complete this request" as a bad query,
 * and re-ran the same call three times with reworded niches before giving up.
 * Every attempt was a paid upstream call, and the user was never told Reddit
 * had failed at all.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { platformFailureGuidance } from "../src/shared/evidence.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

async function connectFailing(message: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(
    async () =>
      ({
        callTool: async () => {
          throw new Error(message);
        },
      }) as unknown as NooticrClient,
  );
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientSide), server.connect(serverSide)]);
  return client;
}

const textOf = (result: unknown) =>
  ((result as { content?: Array<{ type: string; text?: string }> }).content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");

describe("a platform that failed says so", () => {
  it("names the network and forbids the reword loop", async () => {
    // The exact shape the backend produced in the session this came from.
    const client = await connectFailing("reddit: The social data service could not complete this request.");
    const result = await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "morning routines", platform: "reddit" },
    });
    const text = textOf(result);

    expect(result.isError).toBe(true);
    expect(text).toContain("reddit");
    expect(text).toMatch(/Do NOT call this again with different/i);
    // The half the user actually lost: nobody told them Reddit was missing.
    expect(text).toMatch(/tell them plainly/i);
  });

  it("leaves an error that names no network alone", async () => {
    // Not every failure is a platform failure, and dressing a timeout up as
    // one would send a host to "the other networks" that were never asked for.
    const client = await connectFailing("Request timed out after 60s");
    const result = await client.callTool({
      name: "discover_social_posts",
      arguments: { niche: "morning routines" },
    });
    const text = textOf(result);
    expect(result.isError).toBe(true);
    expect(text).toContain("timed out");
    expect(text).not.toMatch(/Do NOT call this again/i);
  });

  it("does not match a platform name buried inside another word", async () => {
    // "redditor" is not reddit, and a substring match would report the wrong
    // network in an error — worse than reporting none.
    expect(
      platformFailureGuidance({ platform: "reddit", message: "x" }).includes("reddit"),
    ).toBe(true);
    const client = await connectFailing("upstream rejected the redditor lookup shape");
    const text = textOf(
      await client.callTool({ name: "discover_social_posts", arguments: { niche: "n" } }),
    );
    expect(text).not.toMatch(/Do NOT call this again/i);
  });
});
