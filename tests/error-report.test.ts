/**
 * What nooticr-mcp reports to Nooticr's PostHog error tracking, and what it
 * leaves to nooticr-server (see src/shared/error-report.ts).
 *
 * The calls go through a real Client and the real createMcpServer, because the
 * failure that started this (get_brand_playbook breaking its own outputSchema,
 * 2026-11-06) only exists after the handler returns, where the SDK turns it
 * into an isError result.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { NooticrError, type NooticrClient } from "../src/shared/nooticr.js";
import {
  configureErrorReporting,
  fingerprint,
  forwardedByServer,
  template,
} from "../src/shared/error-report.js";

let sent: Array<Record<string, any>> = [];

beforeEach(() => {
  sent = [];
  configureErrorReporting({
    token: "phc_test",
    host: "https://posthog.test",
    environment: "test",
    release: "r1",
    send: async (url, body) => {
      expect(url).toBe("https://posthog.test/i/v0/e/");
      sent.push(JSON.parse(body));
    },
  });
});
afterEach(() => configureErrorReporting(null));

async function call(tool: string, args: Record<string, unknown>, backend: () => Promise<unknown>) {
  const nooticr = { me: async () => ({ id: "u1" }), callTool: backend } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  await client.listTools();
  const result = await client
    .callTool({ name: tool, arguments: args }, undefined, { timeout: 30_000 })
    .catch((e: unknown) => ({ thrown: e }));
  await new Promise((r) => setTimeout(r, 10));
  return result;
}

describe("error reporting", () => {
  it("a result that breaks its own outputSchema is one $exception, on the server's fingerprint", async () => {
    await call("get_brand_playbook", { appId: 7 }, async () => ({
      contentBlocks: [{ type: "text", text: "{}" }],
      // The 2026-11-06 shape: a playbook that is neither an object, text nor null.
      structured: { available: true, brand_playbook: [1, 2] },
    }));
    expect(sent).toHaveLength(1);
    const p = sent[0].properties;
    expect(sent[0].event).toBe("$exception");
    expect(p.tool).toBe("get_brand_playbook");
    expect(p.rpc_code).toBe(-32602);
    expect(p.error_kind).toBe("output_schema");
    expect(p.service).toBe("nooticr-mcp");
    expect(p.repository).toBe("Nooticr/nooticr-mcp");
    expect(p.error_template).toMatch(/^Output validation error: Invalid structured content for tool <v>:/);
    expect(p.$exception_fingerprint).toBe(fingerprint("get_brand_playbook", -32602, p.error_template));
  });

  it("a valid result, and the backend's own refusals, are not reported", async () => {
    await call("get_brand_playbook", { appId: 7 }, async () => ({
      contentBlocks: [{ type: "text", text: "{}" }],
      structured: { available: true, brand_playbook: { tone: "warm" } },
    }));
    for (const code of ["-32603", "-32602", "-32004"]) {
      await call("get_brand_playbook", { appId: 7 }, async () => {
        throw new NooticrError(400, "PostHog is not connected", { code });
      });
    }
    await call("get_brand_playbook", { appId: 7 }, async () => {
      throw new NooticrError(502, "Bad gateway");
    });
    expect(sent).toEqual([]);
  });

  it("nooticr-server unreachable and a failure of ours are reported, without the arguments", async () => {
    await call("get_brand_playbook", { appId: 7 }, async () => {
      throw new NooticrError(0, "nooticr is unreachable (/mcp: connect ECONNREFUSED 10.0.0.4:443)");
    });
    await call("get_brand_playbook", { appId: 4242 }, async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'jane@acme.com')");
    });
    expect(sent.map((e) => e.properties.error_kind)).toEqual(["unreachable", "threw"]);
    const text = JSON.stringify(sent);
    for (const leak of ["10.0.0.4", "jane@acme.com", "4242", "ECONNREFUSED"]) {
      expect(text).not.toContain(leak);
    }
  });

  it("a burst of one failure is capped", async () => {
    for (let i = 0; i < 25; i++) {
      await call("get_brand_playbook", { appId: i }, async () => {
        throw new NooticrError(0, "nooticr is unreachable");
      });
    }
    expect(sent).toHaveLength(20);
  });

  it("is off without a project token", async () => {
    configureErrorReporting(null);
    await call("get_brand_playbook", {}, async () => {
      throw new NooticrError(0, "nooticr is unreachable");
    });
    expect(sent).toEqual([]);
  });

  it("leaves a session nooticr-server forwarded to the server", () => {
    const uuid = "0f8b2d8e-3c1a-4c1e-9a0e-2b7c4d5e6f70";
    expect(forwardedByServer({ authInfo: { token: `nooticr-session.${uuid}.jwt` } })).toBe(true);
    expect(forwardedByServer({ authInfo: { token: "eyJhbGciOi.oauth" } })).toBe(false);
    expect(forwardedByServer(undefined)).toBe(false);
  });

  /** The same cases as nooticr-server's `a_template_keeps_no_value`: one template, both sides. */
  it("templates a message as the server does", () => {
    expect(
      template(
        "MCP error -32602: Input validation error: Invalid arguments for tool get_brand_playbook: Unrecognized key: \"app_id\""
      )
    ).toBe("Input validation error: Invalid arguments for tool <v>: Unrecognized key: \"…\"");
    expect(
      template("Output validation error: Invalid structured content for tool get_brand_playbook: Invalid input at brand_playbook")
    ).toBe("Output validation error: Invalid structured content for tool <v>: Invalid input at");
    expect(template("")).toBe("no message");
    expect(template("first line\nsecond line")).toBe("first line");
    expect(template("issue 'deadbeefcafe' for jane@acme.com at 19:52")).not.toMatch(/deadbeef|jane|19:52/);
  });
});
