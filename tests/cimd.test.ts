/**
 * Client ID Metadata Documents.
 *
 * Two things are being tested, and only one of them is the deprecation.
 *
 * The first is that we accept a legitimate CIMD client at all, so connectors
 * stop falling through to Dynamic Client Registration — deprecated as of MCP
 * `2026-07-28`.
 *
 * The second matters more. Under DCR we took any `client_id` string with any
 * https `redirect_uri` and never checked that the two had anything to do with
 * each other. CIMD makes the client prove the redirect is theirs, so every
 * "reject" case below is a hole that used to be open.
 *
 * And because `client_id` is attacker-supplied and this module turns it into
 * an outbound fetch, the SSRF fences get tested like the security control they
 * are.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearClientMetadataCache,
  fetchClientMetadata,
  isClientIdMetadataUrl,
  verifyClientIdMetadata,
} from "../src/shared/cimd.js";

const CLIENT_ID = "https://app.example.com/oauth/client.json";
const GOOD_DOC = {
  client_id: CLIENT_ID,
  client_name: "Example MCP Client",
  redirect_uris: ["http://127.0.0.1:3000/callback", "https://app.example.com/cb"],
  grant_types: ["authorization_code"],
};

/** A fetch that serves one document and records what was asked for. */
function serving(doc: unknown, init: ResponseInit = {}) {
  const calls: string[] = [];
  const impl = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(typeof doc === "string" ? doc : JSON.stringify(doc), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

beforeEach(() => clearClientMetadataCache());

describe("recognising a metadata document client_id", () => {
  it.each([
    ["https://app.example.com/client.json", true],
    ["https://app.example.com/a/b/c", true],
    // A bare origin has no path component, so the spec says it is not one —
    // which conveniently means an opaque DCR id can never be mistaken for one.
    ["https://app.example.com", false],
    ["https://app.example.com/", false],
    ["http://app.example.com/client.json", false],
    ["a1b2c3-an-opaque-dcr-client-id", false],
    ["", false],
  ])("%s → %s", (id, expected) => {
    expect(isClientIdMetadataUrl(id)).toBe(expected);
  });
});

describe("a legitimate client", () => {
  it("is accepted, and the redirect it listed is allowed", async () => {
    const { impl, calls } = serving(GOOD_DOC);
    const res = await verifyClientIdMetadata(CLIENT_ID, "http://127.0.0.1:3000/callback", impl);
    expect(res.ok, JSON.stringify(res)).toBe(true);
    expect(calls).toEqual([CLIENT_ID]);
    // A native client's redirect is loopback; that is normal and is never
    // fetched, only compared.
    expect(res.ok && res.metadata.client_name).toBe("Example MCP Client");
  });

  it("is fetched once and reused", async () => {
    const { impl, calls } = serving(GOOD_DOC);
    await verifyClientIdMetadata(CLIENT_ID, "https://app.example.com/cb", impl);
    await verifyClientIdMetadata(CLIENT_ID, "http://127.0.0.1:3000/callback", impl);
    // A user is waiting on the authorize redirect; the document is the same
    // for every user of that client.
    expect(calls).toHaveLength(1);
  });
});

describe("the checks that used to be missing", () => {
  it("rejects a redirect the client never listed", async () => {
    const { impl } = serving(GOOD_DOC);
    const res = await verifyClientIdMetadata(CLIENT_ID, "https://attacker.example/steal", impl);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.description).toMatch(/not listed/i);
  });

  it("rejects a near-miss rather than matching on prefix", async () => {
    const { impl } = serving(GOOD_DOC);
    // The classic redirect_uri bypass: same origin, extra path.
    for (const near of [
      "https://app.example.com/cb/../evil",
      "https://app.example.com/cb2",
      "https://app.example.com/cb?x=1",
      "https://app.example.com.attacker.test/cb",
    ]) {
      expect((await verifyClientIdMetadata(CLIENT_ID, near, impl)).ok, near).toBe(false);
    }
  });

  it("rejects a document claiming to be a different client", async () => {
    // Anyone can host JSON. Without this, hosting a document that says
    // client_id: "https://claude.ai/..." would let you impersonate them.
    const { impl } = serving({ ...GOOD_DOC, client_id: "https://claude.ai/oauth/client.json" });
    const res = await fetchClientMetadata(CLIENT_ID, impl);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.description).toMatch(/does not match/i);
  });

  it.each([
    ["not JSON at all", "<html>404</html>"],
    ["a JSON array", [1, 2, 3]],
    ["no client_name", { client_id: CLIENT_ID, redirect_uris: ["https://a/b"] }],
    ["no redirect_uris", { client_id: CLIENT_ID, client_name: "x" }],
    ["empty redirect_uris", { client_id: CLIENT_ID, client_name: "x", redirect_uris: [] }],
    ["non-string redirect_uris", { client_id: CLIENT_ID, client_name: "x", redirect_uris: [42] }],
  ])("rejects %s", async (_label, doc) => {
    const { impl } = serving(doc);
    expect((await fetchClientMetadata(CLIENT_ID, impl)).ok).toBe(false);
  });

  it("rejects a document that will not load", async () => {
    const impl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    const res = await fetchClientMetadata(CLIENT_ID, impl);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.description).toContain("404");
  });

  it("survives a fetch that throws", async () => {
    const impl = (async () => {
      throw new Error("DNS failure");
    }) as unknown as typeof fetch;
    // A client whose host is down must be a clean invalid_client, not a 500.
    const res = await fetchClientMetadata(CLIENT_ID, impl);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("invalid_client");
  });

  it("does not cache a document it rejected", async () => {
    const bad = serving({ ...GOOD_DOC, client_id: "https://elsewhere/x.json" });
    await fetchClientMetadata(CLIENT_ID, bad.impl);
    const good = serving(GOOD_DOC);
    // A client that fixes its document must not be locked out by our cache.
    expect((await fetchClientMetadata(CLIENT_ID, good.impl)).ok).toBe(true);
    expect(good.calls).toHaveLength(1);
  });
});

/**
 * `client_id` arrives in a query string and this module turns it into an
 * outbound request. Every case here is one an attacker would try.
 */
describe("server-side request forgery", () => {
  it.each([
    ["loopback v4", "https://127.0.0.1/client.json"],
    ["loopback name", "https://localhost/client.json"],
    ["loopback v6", "https://[::1]/client.json"],
    ["cloud metadata", "https://169.254.169.254/latest/meta-data/"],
    ["private 10/8", "https://10.0.0.5/client.json"],
    ["private 172.16/12", "https://172.20.1.1/client.json"],
    ["private 192.168/16", "https://192.168.1.1/client.json"],
    ["internal tld", "https://vault.internal/client.json"],
    ["ipv6 unique-local", "https://[fd00::1]/client.json"],
  ])("refuses to fetch %s", async (_label, id) => {
    let fetched = false;
    const impl = (async () => {
      fetched = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const res = await fetchClientMetadata(id, impl);
    expect(res.ok).toBe(false);
    expect(fetched, "the request must not leave the box at all").toBe(false);
  });

  it("refuses a non-https or pathless client_id before fetching", async () => {
    let fetched = false;
    const impl = (async () => {
      fetched = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    for (const id of ["http://app.example.com/c.json", "https://app.example.com", "ftp://x/y"]) {
      expect((await fetchClientMetadata(id, impl)).ok).toBe(false);
    }
    expect(fetched).toBe(false);
  });

  it("does not follow a redirect out of the fenced set", async () => {
    // Following one would land wherever the host check already refused to go.
    // "manual", not "error": the Workers runtime only implements "follow" and
    // "manual" — "error" throws on every request there, redirect or not, which
    // is exactly the bug this test used to hide (Node's fetch, unlike Workers',
    // does implement "error", so this suite stayed green in CI while every
    // real CIMD verification failed in production).
    const seen: RequestInit[] = [];
    const impl = (async (_u: string, init: RequestInit) => {
      seen.push(init);
      return new Response(JSON.stringify(GOOD_DOC), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchClientMetadata(CLIENT_ID, impl);
    expect(seen[0].redirect).toBe("manual");
    expect(seen[0].signal, "a hung host must not hold the authorize path open").toBeTruthy();
  });

  it("refuses a document host that redirects instead of answering", async () => {
    // With redirect: "manual" the runtime hands back the 3xx (or, in a real
    // browser/Workers fetch, an opaque redirect response) instead of
    // following it — either way this must be treated as a refusal, not
    // parsed as if it were the document.
    const impl = (async () => new Response(null, { status: 302 })) as unknown as typeof fetch;
    const res = await fetchClientMetadata(CLIENT_ID, impl);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toBe("invalid_client");
  });

  it("refuses an oversized document", async () => {
    const huge = { ...GOOD_DOC, padding: "x".repeat(70_000) };
    const { impl } = serving(huge);
    const res = await fetchClientMetadata(CLIENT_ID, impl);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.description).toMatch(/too large/i);
  });
});

describe("the authorization server metadata", () => {
  it("advertises CIMD so clients stop choosing DCR", async () => {
    const { authorizationServerMetadata } = await import("../src/shared/oauth.js");
    const meta = authorizationServerMetadata("https://mcp.orchyn.com", { registration: true });
    // Clients try CIMD before DCR when both are offered. Without this flag
    // every one of them fell through to the deprecated path.
    expect(meta.client_id_metadata_document_supported).toBe(true);
    // DCR stays available: dropping it would lock out already-registered
    // clients, and it is deprecated rather than removed.
    expect(meta.registration_endpoint).toBe("https://mcp.orchyn.com/register");
  });
});
