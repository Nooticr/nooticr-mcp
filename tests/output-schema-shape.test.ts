/**
 * The schema a strict client reads, which is not the schema this repo writes.
 *
 * `output-schemas.test.ts` checks what the Zod accepts and
 * `output-schema-client.test.ts` checks that a real client validates a real
 * payload against it. Neither looks at the *shape* of the JSON Schema the SDK
 * generates on the way out, and that shape is its own contract: a client that
 * reads `type` as a single string, as several do, meets
 * `{ type: ["string", "number", "boolean"] }` and either rejects the tool or
 * drops the constraint. Both failures are silent from here — a rejected tool
 * simply stops appearing in `tools/list`, with no error this repo would ever
 * see, which is why nothing caught 1,286 of them.
 *
 * 1,286 `type` arrays and 5 keywordless schemas, to be exact: this file's
 * walker was written against that surface and reproduced the MCP Inspector's
 * count exactly before anything was fixed, which is the only reason to trust
 * it at zero. It walks schema positions rather than every object, because a
 * `properties` map is not itself a schema and counting it as one turns 5
 * findings into 331.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Schema = Record<string, unknown>;

/**
 * Every keyword that constrains a value. A schema object carrying none of
 * these accepts anything, which is the object-literal spelling of a bare
 * `true` and indistinguishable from a schema nobody filled in.
 */
const VALIDATION_KEYWORDS = new Set([
  "type", "enum", "const", "anyOf", "oneOf", "allOf", "not", "$ref",
  "items", "prefixItems", "properties", "patternProperties", "additionalProperties",
  "required", "format", "pattern", "minimum", "maximum", "exclusiveMinimum",
  "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "minItems",
  "maxItems", "uniqueItems", "minProperties", "maxProperties", "contains",
  "dependentRequired", "dependentSchemas", "if", "then", "else", "propertyNames",
  "$defs", "definitions",
]);

// Where a subschema is allowed to sit, by how it is nested. Anything not
// listed here is data (a `required` array, a `description`) and is not walked.
const SCHEMA_MAPS = ["properties", "patternProperties", "dependentSchemas", "$defs", "definitions"];
const SCHEMA_LISTS = ["anyOf", "oneOf", "allOf", "prefixItems"];
const SCHEMA_SLOTS = ["items", "additionalProperties", "propertyNames", "contains", "not", "if", "then", "else"];

/** Every JSON Schema inside `root`, with the path that reaches it. */
function* schemasIn(root: unknown, path = ""): Generator<[string, Schema]> {
  if (!root || typeof root !== "object" || Array.isArray(root)) return;
  const s = root as Schema;
  yield [path || "(root)", s];
  for (const key of SCHEMA_MAPS)
    for (const [name, sub] of Object.entries((s[key] ?? {}) as Schema))
      yield* schemasIn(sub, `${path}/${key}/${name}`);
  for (const key of SCHEMA_LISTS)
    for (const [i, sub] of (Array.isArray(s[key]) ? (s[key] as unknown[]) : []).entries())
      yield* schemasIn(sub, `${path}/${key}[${i}]`);
  for (const key of SCHEMA_SLOTS) {
    const sub = s[key];
    // `items` may legally be a tuple of schemas in draft-7.
    if (Array.isArray(sub)) for (const [i, one] of sub.entries()) yield* schemasIn(one, `${path}/${key}[${i}]`);
    else yield* schemasIn(sub, `${path}/${key}`);
  }
}

const dummy = { callTool: async () => ({ contentBlocks: [], structured: {} }) } as unknown as NooticrClient;

async function listTools() {
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => dummy);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const { tools } = await client.listTools();
  return tools;
}

/** Every schema on the surface, tagged with the tool and half it came from. */
async function everySchema() {
  const rows: Array<{ tool: string; where: string; path: string; schema: Schema }> = [];
  for (const tool of await listTools())
    for (const where of ["inputSchema", "outputSchema"] as const)
      for (const [path, schema] of schemasIn((tool as unknown as Schema)[where]))
        rows.push({ tool: tool.name, where, path, schema });
  return rows;
}

const at = (r: { tool: string; where: string; path: string }) => `${r.tool} ${r.where} ${r.path}`;

describe("the JSON Schema a strict client reads", () => {
  it("never spells `type` as an array", async () => {
    const offenders = (await everySchema())
      .filter((r) => Array.isArray(r.schema.type))
      .map((r) => `${at(r)} -> type: ${JSON.stringify(r.schema.type)}`);
    // Named, not counted: a count tells you it regressed and a path tells you
    // which helper did it.
    expect(offenders.slice(0, 12), `${offenders.length} type-as-array schemas`).toEqual([]);
  });

  it("never emits a schema with no validation keyword at all", async () => {
    const offenders = (await everySchema())
      .filter((r) => !Object.keys(r.schema).some((k) => VALIDATION_KEYWORDS.has(k)))
      .map((r) => `${at(r)} -> ${JSON.stringify(Object.keys(r.schema))}`);
    expect(offenders.slice(0, 12), `${offenders.length} keywordless schemas`).toEqual([]);
  });

  /**
   * The positive half. The two assertions above pass just as happily if every
   * scalar leaf collapses to `{}` or disappears, so pin what the leaves became
   * — and pin it by count, because `scalar()` is shared by essentially every
   * tool and one surviving instance would not prove the helper is still right.
   */
  it("renders a scalar leaf as four single-type branches", async () => {
    const branchSets = (await everySchema())
      .filter((r) => Array.isArray(r.schema.anyOf))
      .map((r) => (r.schema.anyOf as Schema[]).map((b) => b.type))
      .filter((types) => types.every((t) => typeof t === "string"));
    const scalars = branchSets.filter(
      (types) => JSON.stringify(types) === JSON.stringify(["string", "number", "boolean", "null"]),
    );
    expect(scalars.length).toBeGreaterThan(1000);
  });

  it("states `additionalProperties` as a boolean, never as an empty schema", async () => {
    // `.strict()` legitimately emits `false` and `.passthrough()` `true`; both
    // are permissions stated in a keyword. `z.record(z.unknown())` emits `{}`,
    // which says the same thing as `true` by omission and reads to a strict
    // client as a schema nobody filled in.
    const wrong = (await everySchema())
      .filter((r) => typeof r.schema.additionalProperties === "object" && r.schema.additionalProperties !== null)
      .map((r) => `${at(r)} -> ${JSON.stringify(r.schema.additionalProperties)}`);
    expect(wrong.slice(0, 12), `${wrong.length} object-valued additionalProperties`).toEqual([]);

    // And the open inputs really are open, rather than having become strict.
    const tools = await listTools();
    const open = tools
      .filter((t) => ["show_post_analysis", "show_variants", "show_compared_posts"].includes(t.name))
      .flatMap((t) => [...schemasIn((t as unknown as Schema).inputSchema)].map(([p, sc]) => ({ tool: t.name, p, sc })))
      .filter(({ p }) => /\/properties\/(post|analysis)$|\/properties\/posts\/items$/.test(p));
    expect(open.length).toBe(4);
    for (const { tool, p, sc } of open) expect(sc.additionalProperties, `${tool} ${p}`).toBe(true);
  });
});
