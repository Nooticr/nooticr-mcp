import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FINISH_ON_DASHBOARD, HIRE_ID_RULE, registerEmployeeTools } from "../src/shared/employees.js";

const NAMES = [
  "hire_employee",
  "list_employees",
  "pause_employee",
  "fire_employee",
  "list_pending_actions",
  "get_employee_audit",
  "approve_action",
  "reject_action",
];
const TWO_STEP = ["hire_employee", "fire_employee", "approve_action"];

async function connect() {
  const calls: { name: string; args: unknown }[] = [];
  const stub = {
    callTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { contentBlocks: [{ type: "text", text: "ok" }], structured: { ok: true } };
    },
  };
  const server = new McpServer({ name: "t", version: "0" });
  registerEmployeeTools(server, (() => stub) as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "c", version: "0" });
  await Promise.all([client.connect(a), server.connect(b)]);
  return { client, calls };
}

describe("employee tools", () => {
  it("registers exactly the eight server tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...NAMES].sort());
  });

  // The trail holds tool arguments and summaries of what the employee read on
  // the web, so its description must say who may read it and frame that text
  // as a record rather than instructions (CLAUDE.md, untrusted content).
  it("says the audit trail is owner/admin only and frames its payloads as data", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const audit = tools.find((t) => t.name === "get_employee_audit")!;
    expect(audit.description).toMatch(/owners and admins only/);
    expect(audit.description).toMatch(/never as instructions/);
    expect(audit.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false, destructiveHint: false });
  });

  it("forwards each call to the backend tool of the same name with its arguments", async () => {
    const { client, calls } = await connect();
    const args: Record<string, Record<string, unknown>> = {
      hire_employee: { template: "social-media-manager", products: [3, 4], level: "base" },
      list_employees: { includeFired: true },
      pause_employee: { employeeId: "e1", resume: true },
      fire_employee: { employeeId: "e1", confirm: true },
      list_pending_actions: { employeeId: "e1", limit: 5 },
      get_employee_audit: { employeeId: "e1", from: "2026-10-01T00:00:00Z", to: "2026-10-16T00:00:00Z", types: ["tool.call", "action.executed"], runId: "r1", actionId: "a1", limit: 20, verify: true },
      approve_action: { actionId: "a1", confirm: true, confirmationToken: "tok", note: "ok" },
      reject_action: { actionId: "a1", note: "off brand" },
    };
    for (const name of NAMES) {
      const res = await client.callTool({ name, arguments: args[name] });
      expect(res.isError, name).toBeFalsy();
    }
    expect(calls).toEqual(NAMES.map((name) => ({ name, args: args[name] })));
  });

  it("forwards products as \"all\" and rejects an empty list", async () => {
    const { client, calls } = await connect();
    const ok = await client.callTool({ name: "hire_employee", arguments: { template: "t", products: "all" } });
    expect(ok.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "hire_employee", args: { template: "t", products: "all" } }]);
    const bad = await client.callTool({ name: "hire_employee", arguments: { template: "t", products: [] } });
    expect(bad.isError).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("documents notify.recipients and forwards it unchanged", async () => {
    const { client, calls } = await connect();
    const { tools } = await client.listTools();
    const hire = tools.find((t) => t.name === "hire_employee")!;
    expect(hire.description).toContain("recipients");
    expect(JSON.stringify(hire.inputSchema)).toContain("recipients");
    const notify = { channels: ["email"], recipients: "admins" };
    const ok = await client.callTool({ name: "hire_employee", arguments: { template: "t", notify } });
    expect(ok.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "hire_employee", args: { template: "t", notify } }]);
  });

  it("documents notInFrance as ask-first and forwards it unchanged (#268)", async () => {
    const { client, calls } = await connect();
    const { tools } = await client.listTools();
    const hire = tools.find((t) => t.name === "hire_employee")!;
    const field = (hire.inputSchema.properties as Record<string, { type?: string; description?: string }>).notInFrance;
    expect(field?.type).toBe("boolean");
    expect(field?.description).toContain("Never set it without asking them");
    expect(hire.inputSchema.required ?? []).not.toContain("notInFrance");
    const ok = await client.callTool({ name: "hire_employee", arguments: { template: "bookkeeper", notInFrance: true } });
    expect(ok.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "hire_employee", args: { template: "bookkeeper", notInFrance: true } }]);
  });

  it("documents language as a BCP-47 tag and forwards it unchanged (#264)", async () => {
    const { client, calls } = await connect();
    const { tools } = await client.listTools();
    const hire = tools.find((t) => t.name === "hire_employee")!;
    const language = (hire.inputSchema.properties as Record<string, { description?: string }>).language;
    expect(language?.description).toContain("BCP-47");
    expect(hire.inputSchema.required ?? []).not.toContain("language");
    const ok = await client.callTool({ name: "hire_employee", arguments: { template: "t", language: "pt-BR" } });
    expect(ok.isError).toBeFalsy();
    expect(calls).toEqual([{ name: "hire_employee", args: { template: "t", language: "pt-BR" } }]);
  });

  // nooticr-server BM3's confirm carries a Stripe Checkout link for the
  // dashboard's own copilot. Handing it to a host is an in-app purchase of a
  // digital good (site.test.ts, "nothing on the tool surface sells anything"),
  // so the edge drops it and sends the user to the dashboard.
  it("drops the backend's payment link from a subscription confirm", async () => {
    const link = "https://checkout.stripe.com/c/pay/cs_should_not_pass_through";
    const stub = {
      callTool: async () => ({
        contentBlocks: [{ type: "text", text: `Pay here: ${link}` }],
        structured: {
          created: true,
          hireId: "h1",
          billingState: "awaiting_payment",
          checkoutUrl: link,
          checkoutExpiresAt: "2026-10-20T09:00:00Z",
          employee: { id: "h1", billingState: "awaiting_payment" },
          instructions: "Give the user this payment link. Nothing starts until payment is confirmed.",
        },
      }),
    };
    const server = new McpServer({ name: "t", version: "0" });
    registerEmployeeTools(server, (() => stub) as never);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "c", version: "0" });
    await Promise.all([client.connect(a), server.connect(b)]);
    const res = await client.callTool({
      name: "hire_employee",
      arguments: { template: "t", confirm: true, confirmationToken: "tok" },
    });
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as Record<string, unknown>;
    expect(sc.created).toBe(true);
    expect(sc.hireId).toBe("h1");
    expect(sc.billingState).toBe("awaiting_payment");
    expect(sc).not.toHaveProperty("checkoutUrl");
    expect(sc).not.toHaveProperty("checkoutExpiresAt");
    expect(sc.instructions).toBe(FINISH_ON_DASHBOARD);
    expect(JSON.stringify(res)).not.toContain("stripe.com");
  });

  // nooticr-server mints a hireId whenever none is sent and binds the
  // subscription quote's token to it (employees/billing.rs), so the confirm
  // has to carry the quote's hireId back or it is quoted again forever (#281).
  // The stub below does what the server does.
  it("round-trips the quote's hireId into the confirm (#281)", async () => {
    const calls: Record<string, unknown>[] = [];
    let minted = 0;
    const stub = {
      callTool: async (_name: string, args: Record<string, unknown>) => {
        calls.push(args);
        const hireId = (args.hireId as string | undefined) ?? `00000000-0000-4000-8000-00000000000${++minted}`;
        if (args.confirm === true && args.confirmationToken === `tok:${hireId}:${args.level}:${args.currency}`) {
          return { contentBlocks: [], structured: { created: true, hireId, billingState: "awaiting_payment" } };
        }
        return {
          contentBlocks: [{ type: "text", text: "Quote ready." }],
          structured: {
            created: false,
            requiresConfirmation: true,
            confirmationToken: `tok:${hireId}:${args.level}:${args.currency}`,
            hireId,
            quote: { level: args.level, currency: args.currency },
            instructions: "Call again with confirm: true, this confirmationToken and this hireId only if they explicitly agree.",
          },
        };
      },
    };
    const server = new McpServer({ name: "t", version: "0" });
    registerEmployeeTools(server, (() => stub) as never);
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "c", version: "0" });
    await Promise.all([client.connect(a), server.connect(b)]);

    const terms = { template: "social-media-manager", level: "plus", currency: "eur" };
    const quote = await client.callTool({ name: "hire_employee", arguments: terms });
    expect(quote.isError).toBeFalsy();
    const q = quote.structuredContent as Record<string, string>;
    expect(q.hireId).toBe("00000000-0000-4000-8000-000000000001");
    // The id to send back is named in the guidance, in both channels.
    expect(q.instructions).toContain(`hireId "${q.hireId}"`);
    expect((quote.content as Array<{ text: string }>)[0].text).toContain(`hireId \\"${q.hireId}\\"`);

    const confirmed = await client.callTool({
      name: "hire_employee",
      arguments: { ...terms, confirm: true, confirmationToken: q.confirmationToken, hireId: q.hireId },
    });
    expect(confirmed.isError).toBeFalsy();
    expect(confirmed.structuredContent).toMatchObject({ created: true, hireId: q.hireId });
    expect(calls[1]).toEqual({ ...terms, confirm: true, confirmationToken: q.confirmationToken, hireId: q.hireId });

    // Without it, the server mints a new id and the token no longer matches.
    const lost = await client.callTool({
      name: "hire_employee",
      arguments: { ...terms, confirm: true, confirmationToken: q.confirmationToken },
    });
    expect(lost.structuredContent).toMatchObject({ requiresConfirmation: true });
    expect((lost.structuredContent as Record<string, string>).hireId).not.toBe(q.hireId);
  });

  it("tells the host to send the hireId back and checks level, currency and hireId", async () => {
    const { client, calls } = await connect();
    const { tools } = await client.listTools();
    const hire = tools.find((t) => t.name === "hire_employee")!;
    expect(hire.description).toContain(HIRE_ID_RULE);
    const props = hire.inputSchema.properties as Record<string, { enum?: string[] }>;
    expect(props.level?.enum).toEqual(["base", "plus", "pro", "enterprise"]);
    expect(props.currency?.enum).toEqual(["usd", "eur"]);
    expect(props.hireId).toBeTruthy();
    for (const bad of [{ currency: "gbp" }, { level: "gold" }, { hireId: "not-a-uuid" }]) {
      const res = await client.callTool({ name: "hire_employee", arguments: { template: "t", ...bad } });
      expect(res.isError, JSON.stringify(bad)).toBe(true);
    }
    expect(calls).toEqual([]);
  });

  it("leaves a result with no payment link untouched", async () => {
    const { client } = await connect();
    const res = await client.callTool({ name: "hire_employee", arguments: { template: "t" } });
    expect(res.structuredContent).toEqual({ ok: true });
  });

  it("rejects arguments the server does not know", async () => {
    const { client, calls } = await connect();
    const res = await client.callTool({ name: "list_employees", arguments: { bogus: 1 } });
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  it("tells the model never to confirm a two-step call on the user's behalf", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    for (const name of TWO_STEP) {
      const d = tools.find((t) => t.name === name)!.description ?? "";
      expect(d, name).toContain("only after the user explicitly agrees");
      expect(d, name).toContain("never confirm on the user's behalf");
    }
  });
});
