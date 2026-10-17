/**
 * Media links reach the host exactly as the server signed them (#242).
 *
 * This worker used to wrap every external URL in `/media/proxy?url=...`
 * itself, unsigned. `/media/proxy` fetches from the internet for whoever calls
 * it, so the server could not refuse unsigned links without blanking every
 * card. nooticr-server#893 signs them on the HTTP `tools/call` route instead,
 * where the key is; what is left to hold here is that nothing in this worker
 * mints a proxy link again, and that the server's links pass through intact.
 */
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/shared/tools.js";
import { MemoryWatchStore } from "../src/shared/watchlist.js";
import type { NooticrClient } from "../src/shared/nooticr.js";

type Row = Record<string, unknown>;
const API = "https://api.nooticr.com";
const signed = (url: string) => `${API}/media/proxy?url=${encodeURIComponent(url)}&sig=c2lnbmVk`;

/**
 * A post as nooticr-server#893 answers it over HTTP: external media already
 * signed, and the five fields that are not images left as written.
 */
function post(): Row {
  return {
    platform: "bilibili",
    externalUrl: "https://www.bilibili.com/video/BV1n54U6GEbE",
    embedUrl: "https://player.bilibili.com/player.html?bvid=BV1n54U6GEbE",
    url: "https://www.bilibili.com/video/BV1n54U6GEbE",
    thumbnailUrl: signed("https://i1.hdslb.com/bfs/archive/cd5e.jpg"),
    videoUrl: signed("https://upos-sz.bilivideo.com/v.mp4"),
    videoFallbackUrl: `${API}/media/resolve?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBV1n54U6GEbE&kind=video&sig=abc`,
    authorAvatar: `${API}/media/copy/av.jpg?sig=def`,
  };
}

async function callThrough(structured: Row, apiUrl = API) {
  const saved = process.env.NOOTICR_API_URL;
  process.env.NOOTICR_API_URL = apiUrl;
  try {
    const nooticr = {
      me: async () => ({ id: "u1" }),
      callTool: async () => ({
        contentBlocks: [{ type: "text", text: `<div><img src="https://i1.hdslb.com/bfs/archive/cd5e.jpg"/></div>\n\n{}` }],
        structured,
      }),
    } as unknown as NooticrClient;
    const client = new Client({ name: "test", version: "1.0.0" }, { capabilities: {} });
    const server = createMcpServer(async () => nooticr, { watchStore: new MemoryWatchStore() });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
    return await client.callTool({ name: "get_social_post", arguments: { url: String(structured.externalUrl ?? "") } });
  } finally {
    if (saved === undefined) delete process.env.NOOTICR_API_URL;
    else process.env.NOOTICR_API_URL = saved;
  }
}

/** Every /media/proxy link anywhere in a value, structured or text. */
function proxyLinks(value: unknown): string[] {
  return JSON.stringify(value).match(/https?:\/\/[^"\s\\]*\/media\/proxy\?[^"\s\\]*/g) ?? [];
}

describe("media links in a tool result", () => {
  it("reach the host exactly as the server wrote them", async () => {
    const res = await callThrough({ post: post() });
    expect((res.structuredContent as Row).post).toEqual(post());
  });

  it("keep every permalink raw, so the model cites the post and not our proxy (#254)", async () => {
    // The shape #254 names: a top-level url, a thumbnail, and posts carrying
    // their own url beside their media. Only the server may sign media; no
    // url ever comes out of this worker as a /media/proxy link.
    const result = {
      url: "https://www.tiktok.com/@a/video/1",
      thumbnailUrl: signed("https://p16.tiktokcdn.com/t.jpg"),
      posts: [
        {
          url: "https://www.instagram.com/reel/abc/",
          coverUrl: signed("https://scontent.cdninstagram.com/c.jpg"),
          videoUrl: signed("https://scontent.cdninstagram.com/v.mp4"),
        },
      ],
    };
    const res = await callThrough(result);
    const out = res.structuredContent as Row;
    expect(out.url).toBe("https://www.tiktok.com/@a/video/1");
    expect((out.posts as Row[])[0].url).toBe("https://www.instagram.com/reel/abc/");
    expect(out).toEqual(result);
    const text = String((res.content as Array<{ text?: string }>)[0]?.text ?? "");
    expect(text).toContain('"url": "https://www.tiktok.com/@a/video/1"');
    expect(text).toContain('"url": "https://www.instagram.com/reel/abc/"');
  });

  it("never include a proxy link without a signature", async () => {
    // A raw CDN link the server left unwrapped is the case that used to be
    // wrapped here, unsigned. It must stay raw: an unsigned proxy link stops
    // working the day the server requires signatures, and until then it is
    // an open fetch from our origin.
    const res = await callThrough({
      post: { ...post(), thumbnailUrl: "https://i1.hdslb.com/bfs/archive/raw.jpg" },
      posts: [{ coverUrl: "https://p16-sign.tiktokcdn.com/c.jpg", avatarUrl: "https://p16.tiktokcdn.com/a.jpg" }],
    });
    const links = proxyLinks([res.structuredContent, res.content]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link, link).toMatch(/[?&]sig=/);
    expect(((res.structuredContent as Row).post as Row).thumbnailUrl).toBe("https://i1.hdslb.com/bfs/archive/raw.jpg");
  });

  it("are not wrapped when the worker knows no API base, nor when it does", async () => {
    // The old wrapping turned on NOOTICR_API_URL; neither value may bring it back.
    for (const base of ["", API]) {
      const res = await callThrough({ post: { ...post(), thumbnailUrl: "https://cdn.example/t.jpg" } }, base);
      expect(((res.structuredContent as Row).post as Row).thumbnailUrl).toBe("https://cdn.example/t.jpg");
    }
  });
});

describe("no code in this repo mints a proxy link", () => {
  it("builds no /media/proxy URL anywhere in src or the worker", () => {
    // The signing key lives on the server, so any link built here is unsigned.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") walk(path);
        } else if (/\.(ts|mjs|js)$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          if (/\/media\/proxy\?url=\$\{|\/media\/proxy\?url="\s*\+/.test(text)) offenders.push(path);
        }
      }
    };
    walk("src");
    walk("cloudflare/src");
    expect(offenders).toEqual([]);
  });
});
