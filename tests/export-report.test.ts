/**
 * export_report (#90): the session's cards handed back as markdown, an
 * embedded HTML resource and the same HTML in structuredContent.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import { buildReport, reportTokens } from "../src/shared/report.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

const POST = {
  platform: "tiktok",
  caption: "the habit that <b>stuck</b>",
  creatorHandle: "lena.mornings",
  externalUrl: "https://www.tiktok.com/@lena.mornings/video/1",
  thumbnailUrl: "https://cdn.example.com/t.jpg",
  views: 15400,
  likes: 1200,
};
const COMMENT = { text: "does this *work* with kids?", author: "sam.h", likes: 47, postUrl: POST.externalUrl };
const PRODUCT = {
  title: "Kobo grinder",
  brand: "Kobo",
  price: 49.9,
  currency: "EUR",
  rating: 4.4,
  reviewCount: 812,
  url: "https://shop.example.com/kobo",
  imageUrl: "https://cdn.example.com/kobo.jpg",
  reviews: [{ text: "Runs small, order a size up", rating: 3 }],
};

async function call(args: Record<string, unknown>) {
  const calls: string[] = [];
  const nooticr = { callTool: async (n: string) => { calls.push(n); return { contentBlocks: [], structured: {} }; } } as unknown as NooticrClient;
  const client = new Client({ name: "test", version: "1.0.0" });
  const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
  const res = await client.callTool({ name: "export_report", arguments: args });
  return { res, calls };
}

describe("export_report", () => {
  it("returns markdown, an embedded HTML resource and the same HTML in structuredContent, fetching nothing", async () => {
    const { res, calls } = await call({
      title: "Kobo vs the category",
      summary: "Sizing is the complaint.\n\n- Fix the size chart.",
      sections: [
        { kind: "posts", items: [POST] },
        { kind: "comments", heading: "Asked", items: [COMMENT] },
        { kind: "products", items: [PRODUCT] },
        { kind: "analysis", heading: "Next", text: "Ship the chart." },
      ],
    });
    expect(calls).toEqual([]);
    expect(res.isError).toBeFalsy();
    const content = res.content as Array<Record<string, any>>;
    expect(content.map((c) => c.type)).toEqual(["text", "resource"]);
    const sc = res.structuredContent as Record<string, any>;
    expect(content[1].resource).toEqual({ uri: sc.reportUri, mimeType: "text/html", text: sc.html });
    expect(sc.reportUri).toMatch(/^nooticr:\/\/report\/[0-9a-f]{16}$/);
    expect(sc.sectionCount).toBe(4);
    expect(sc.itemCount).toBe(3);
    expect(content[0].text).toContain(sc.markdown);
    expect(sc.guidance).toContain(sc.reportUri);
    // The cards carry the real material.
    expect(sc.html).toContain('src="https://cdn.example.com/kobo.jpg"');
    expect(sc.html).toContain("Runs small, order a size up");
    expect(sc.html).toContain("15.4K");
    expect(sc.markdown).toContain("> does this \\*work\\* with kids?");
    expect(sc.markdown).toContain("- Fix the size chart.");
    // The view draws the fragment; the document stands alone with the design tokens.
    expect(sc._html).toContain('<div class="nt-report">');
    expect(sc.html).toMatch(/^<!DOCTYPE html>/);
    expect(sc.html).toContain(":root{--background:");
  });

  it("escapes third-party text and keeps only http(s) links and images", () => {
    const r = buildReport({
      title: "<script>alert(1)</script>",
      sections: [
        {
          kind: "posts",
          items: [
            { caption: '<img src=x onerror="alert(1)">', externalUrl: "javascript:alert(1)", thumbnailUrl: "data:image/png;base64,AAAA" },
            { caption: "[click](https://evil.example) # heading", externalUrl: "https://ok.example/p_(1)" },
          ],
        },
      ],
    });
    expect(r.html).not.toContain("<script>");
    expect(r.html).not.toContain("<img src=x");
    expect(r.html).not.toContain("javascript:");
    expect(r.html).not.toContain("data:image");
    expect(r.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(r.markdown).toContain("\\[click\\](https://evil.example) \\# heading");
    expect(r.markdown).toContain("(https://ok.example/p_%281%29)");
  });

  it("gives the same report the same URI", () => {
    const input = { title: "t", sections: [{ kind: "analysis" as const, text: "x" }] };
    expect(buildReport(input).uri).toBe(buildReport(input).uri);
    expect(buildReport({ ...input, title: "u" }).uri).not.toBe(buildReport(input).uri);
  });

  it("finds the design system's tokens in the view's stylesheet", () => {
    expect(reportTokens()).toMatch(/^:root\{--background:[^}]*--foreground:/);
  });

  it("refuses a report with nothing in it, and an unknown kind", async () => {
    expect((await call({ title: "t", sections: [{ kind: "posts", items: [] }] })).res.isError).toBe(true);
    expect((await call({ title: "t", sections: [{ kind: "tweets", items: [POST] }] })).res.isError).toBe(true);
    expect((await call({ title: "t", sections: [] })).res.isError).toBe(true);
  });
});
