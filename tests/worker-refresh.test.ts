/**
 * Cloudflare Worker client refresh behavior.
 *
 * The worker used to hold a static orchyn access token (15-minute TTL) with
 * no renewal, so every login died a quarter of an hour in and forced a fresh
 * OAuth flow. These tests lock in the renewal: a 401 triggers the
 * onUnauthorized callback once and retries with the refreshed token, and the
 * JWT `exp` decoder drives the proactive refresh in `endpoint.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { jwtExpiry, OrchynClient, OrchynError } from "../cloudflare/src/orchyn.js";

const BASE = "http://localhost:8080";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** header.payload.signature with an `exp` payload — no real signature needed. */
function fakeJwt(exp: number): string {
  const enc = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: "user-1", exp })}.sig`;
}

describe("jwtExpiry", () => {
  it("decodes the exp claim from an orchyn JWT", () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    expect(jwtExpiry(fakeJwt(exp))).toBe(exp);
  });

  it("returns undefined for garbage or missing payload", () => {
    expect(jwtExpiry("not-a-jwt")).toBeUndefined();
    expect(jwtExpiry("a.b.c")).toBeUndefined();
  });
});

describe("OrchynClient 401 refresh (request path)", () => {
  it("retries once with the refreshed token when the API rejects with 401", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? "";
      calls.push(auth);
      if (auth === "Bearer stale-token") {
        return jsonResponse(401, { error: "token expired" });
      }
      return jsonResponse(200, { id: "u1", email: "a@b.c" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OrchynClient(BASE, "stale-token", async () => "fresh-token");
    const me = await client.me();

    expect(calls).toEqual(["Bearer stale-token", "Bearer fresh-token"]);
    expect(me).toMatchObject({ id: "u1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces the 401 when no onUnauthorized is provided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { error: "token expired" }))
    );
    const client = new OrchynClient(BASE, "stale-token");
    await expect(client.me()).rejects.toMatchObject({ status: 401 });
  });
});

describe("OrchynClient 401 refresh (callTool path)", () => {
  it("retries /mcp tools/call with the refreshed token", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const auth = (init?.headers as Record<string, string> | undefined)?.authorization ?? "";
        calls.push(auth);
        if (auth === "Bearer stale-token") {
          return jsonResponse(401, { error: "token expired" });
        }
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          result: {
            content: [{ type: "text", text: "{}" }],
            structuredContent: { balance: 42 },
          },
        });
      })
    );

    const client = new OrchynClient(BASE, "stale-token", async () => "fresh-token");
    const result = await client.callTool("check_orchyn_credits", {});

    expect(calls).toEqual(["Bearer stale-token", "Bearer fresh-token"]);
    expect(result.structured).toEqual({ balance: 42 });
  });
});

describe("OrchynClient.refreshSession", () => {
  it("redeems a refresh token and returns the rotated session", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${BASE}/auth/refresh`);
      expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: "rt-1" });
      return jsonResponse(200, {
        accessToken: "new-access",
        refreshToken: "rt-2",
        expiresIn: 900,
        user: { id: "u1", email: "a@b.c" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = await OrchynClient.refreshSession(BASE, "rt-1");
    expect(session.accessToken).toBe("new-access");
    expect(session.refreshToken).toBe("rt-2");
  });

  it("throws OrchynError when the refresh token is rejected", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "invalid or expired refresh token" })));
    await expect(OrchynClient.refreshSession(BASE, "dead-rt")).rejects.toMatchObject({
      status: 401,
      message: "invalid or expired refresh token",
    });
  });

  it("throws when the refresh succeeds without an access token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { refreshToken: "rt-2" })));
    await expect(OrchynClient.refreshSession(BASE, "rt-1")).rejects.toBeInstanceOf(OrchynError);
  });
});
