import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  OAuthManager,
  verifyPkce,
  isAllowedRedirectUri,
  isLoopbackUrl,
} from "../src/oauth.js";
import { OrchynClient } from "../src/orchyn.js";

const PUBLIC_URL = "http://localhost:3457";
const ORCHYN_BASE = "http://localhost:8080";
const CLIENT_REDIRECT = "http://127.0.0.1:43210/callback";
const TEST_VERIFIER = "0123456789abcdefghijklmnopqrstuvwx";
const TEST_CHALLENGE = "ennwGwPnSmjXnYZLCY88UqxRKsUlHnOSQyOJhPw4s0U";

function makeReq(url: string, method = "GET", body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.url = url;
  req.method = method;
  req.headers = {};
  req.socket = {} as never;
  if (body) {
    queueMicrotask(() => {
      req.emit("data", Buffer.from(body));
      req.emit("end");
    });
  }
  return req;
}

interface FakeRes {
  status: number;
  headers: Record<string, string>;
  body: string;
  writeHead(status: number, headers: Record<string, string>): void;
  end(body?: string): void;
  emitError(): void;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = body;
    },
    emitError() {
      this.emit("error", new Error("boom"));
    },
  };
  return res;
}

function makeClient(): OrchynClient {
  return new OrchynClient(ORCHYN_BASE, { getAccessToken: async () => undefined });
}

async function completeSignIn(
  oauth: OAuthManager,
  orchynState: string,
  completionCode = "google-completion-123"
): Promise<FakeRes> {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: "orchyn-jwt",
          refreshToken: "orchyn-refresh",
          expiresIn: 3600,
          user: { id: "u1", email: "me@example.com", displayName: "Me" },
        }),
        { status: 200 }
      )
    )
  );
  const res = makeRes();
  await oauth.handleCallback(
    makeReq(`/oauth/callback?state=${encodeURIComponent(orchynState)}&code=${completionCode}&redirect=/`),
    res as unknown as ServerResponse
  );
  return res;
}

const GOOGLE_REDIRECT_URL =
  "https://accounts.google.com/o/oauth2/v2/auth?client_id=orchyn&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fauth%2Fgoogle%2Fcallback";

async function runAuthorize(oauth: OAuthManager): Promise<{ res: FakeRes; orchynState: string; redirect: URL }> {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ redirectUrl: GOOGLE_REDIRECT_URL }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  const res = makeRes();
  await oauth.handleAuthorize(
    makeReq(
      `/authorize?response_type=code&client_id=claude&redirect_uri=${encodeURIComponent(CLIENT_REDIRECT)}` +
        `&code_challenge=${TEST_CHALLENGE}&code_challenge_method=S256&state=client-state-1&scope=analyze:video`
    ),
    res as unknown as ServerResponse
  );
  // The orchyn server is asked to start the Google sign-in with our callback.
  const [startUrl, startInit] = fetchMock.mock.calls[0];
  const ourCallback = JSON.parse(startInit.body).redirect as string;
  const orchynState = new URL(ourCallback).searchParams.get("state") as string;
  const redirect = new URL(res.headers.location);
  return { res, orchynState, redirect };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyPkce", () => {
  it("rejects a base64 (non-sha256) challenge", async () => {
    const verifier = TEST_VERIFIER;
    const challenge = Buffer.from(verifier, "utf8").toString("base64");
    expect(await verifyPkce(verifier, challenge)).toBe(false);
    expect(await verifyPkce("", "")).toBe(false);
  });

  it("round-trips through the real sha256", async () => {
    expect(await verifyPkce(TEST_VERIFIER, TEST_CHALLENGE)).toBe(true);
    expect(await verifyPkce(TEST_VERIFIER + "x", TEST_CHALLENGE)).toBe(false);
  });
});

describe("isAllowedRedirectUri / isLoopbackUrl", () => {
  it("accepts loopback http URLs", () => {
    expect(isAllowedRedirectUri("http://localhost:43210/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:43210/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://[::1]:43210/cb")).toBe(true);
  });

  it("accepts any https URL", () => {
    expect(isAllowedRedirectUri("https://example.com/cb")).toBe(true);
  });

  it("rejects non-loopback http and garbage", () => {
    expect(isAllowedRedirectUri("http://example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("not-a-url")).toBe(false);
    expect(isAllowedRedirectUri("ftp://localhost/cb")).toBe(false);
  });

  it("isLoopbackUrl handles host variants", () => {
    expect(isLoopbackUrl("http://localhost:1/x")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1/x")).toBe(true);
    expect(isLoopbackUrl("http://[::1]/x")).toBe(true);
    expect(isLoopbackUrl("https://localhost/x")).toBe(false);
  });
});

describe("OAuthManager flow", () => {
  it("advertises correct authorization server metadata", () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    expect(oauth.authorizationServerMetadata()).toEqual({
      issuer: PUBLIC_URL,
      authorization_endpoint: `${PUBLIC_URL}/authorize`,
      token_endpoint: `${PUBLIC_URL}/token`,
      response_types_supported: ["code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["social:read", "credits:spend"],
      grant_types_supported: ["authorization_code"],
    });
    expect(oauth.protectedResourceMetadata()).toEqual({
      resource: `${PUBLIC_URL}/mcp`,
      authorization_servers: [PUBLIC_URL],
    });
  });

  it("asks orchyn to start Google sign-in and redirects the browser to Google", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const { res, redirect, orchynState } = await runAuthorize(oauth);
    expect(res.status).toBe(302);
    expect(redirect.origin).toBe("https://accounts.google.com");
    // Our loopback callback was sent to the orchyn server, pre-seeded with state.
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const [startUrl, startInit] = fetchMock.mock.calls[0];
    expect(startUrl).toBe(`${ORCHYN_BASE}/auth/google/start`);
    expect(JSON.parse(startInit.body).redirect).toBe(
      `${PUBLIC_URL}/oauth/callback?state=${encodeURIComponent(orchynState)}`
    );
  });

  it("rejects /authorize without PKCE S256", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const res = makeRes();
    await oauth.handleAuthorize(
      makeReq(
        `/authorize?response_type=code&client_id=c&redirect_uri=${encodeURIComponent(CLIENT_REDIRECT)}`
      ),
      res as unknown as ServerResponse
    );
    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get("error")).toBe("invalid_request");
  });

  it("rejects /authorize with a non-loopback, non-https redirect_uri", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const res = makeRes();
    await oauth.handleAuthorize(
      makeReq(
        `/authorize?response_type=code&client_id=c&redirect_uri=${encodeURIComponent("http://evil.example.com/cb")}` +
          `&code_challenge=abc&code_challenge_method=S256`
      ),
      res as unknown as ServerResponse
    );
    expect(res.status).toBe(400);
    expect(res.body).toContain("loopback");
  });

  it("rejects /authorize with unsupported scopes", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const res = makeRes();
    await oauth.handleAuthorize(
      makeReq(
        `/authorize?response_type=code&client_id=c&redirect_uri=${encodeURIComponent(CLIENT_REDIRECT)}` +
          `&code_challenge=abc&code_challenge_method=S256&scope=admin%20analyze:video`
      ),
      res as unknown as ServerResponse
    );
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get("error")).toBe("invalid_scope");
  });

  it("completes the full flow: authorize -> orchyn callback -> token -> session", async () => {
    const oauth = new OAuthManager({
      publicUrl: PUBLIC_URL,
      client: makeClient(),
      onSession: vi.fn().mockResolvedValue(undefined),
    });

    // 1. authorize
    const { res: authRes, orchynState } = await runAuthorize(oauth);
    expect(authRes.status).toBe(302);

    // 2. orchyn redirects the browser back to our callback with ?state=<ours>&code=<completion>
    const cbRes = await completeSignIn(oauth, orchynState);
    expect(cbRes.status).toBe(302);
    const clientRedirect = new URL(cbRes.headers.location);
    expect(clientRedirect.origin).toBe("http://127.0.0.1:43210");
    const mcpAuthCode = clientRedirect.searchParams.get("code") as string;
    expect(mcpAuthCode).toBeTruthy();
    expect(clientRedirect.searchParams.get("state")).toBe("client-state-1");

    // 3. MCP client exchanges the code with PKCE
    const verifier = "0123456789abcdefghijklmnopqrstuvwx";
    const tokenRes = makeRes();
    await oauth.handleToken(
      makeReq(
        "/token",
        "POST",
        `grant_type=authorization_code&code=${encodeURIComponent(mcpAuthCode)}` +
          `&code_verifier=${encodeURIComponent(verifier)}` +
          `&redirect_uri=${encodeURIComponent(CLIENT_REDIRECT)}&client_id=claude`
      ),
      tokenRes as unknown as ServerResponse
    );
    expect(tokenRes.status).toBe(200);
    const tokenBody = JSON.parse(tokenRes.body);
    expect(tokenBody.token_type).toBe("Bearer");
    expect(tokenBody.expires_in).toBe(604800);
    expect(tokenBody.scope).toBe("analyze:video");

    // 4. the issued token maps to the orchyn JWT
    const session = oauth.verifyToken(tokenBody.access_token);
    expect(session).toBeDefined();
    expect(session!.orchynAccessToken).toBe("orchyn-jwt");
    expect(session!.orchynRefreshToken).toBe("orchyn-refresh");
    expect(session!.clientId).toBe("claude");

    // 5. the one-time code is consumed
    const reusedRes = makeRes();
    await oauth.handleToken(
      makeReq(
        "/token",
        "POST",
        `grant_type=authorization_code&code=${encodeURIComponent(mcpAuthCode)}` +
          `&code_verifier=${encodeURIComponent(verifier)}&client_id=claude`
      ),
      reusedRes as unknown as ServerResponse
    );
    expect(reusedRes.status).toBe(400);
    expect(JSON.parse(reusedRes.body).error).toBe("invalid_grant");
  });

  it("rejects /token with a wrong PKCE verifier", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const { orchynState } = await runAuthorize(oauth);
    const cbRes = await completeSignIn(oauth, orchynState);
    const mcpAuthCode = new URL(cbRes.headers.location).searchParams.get("code") as string;

    const tokenRes = makeRes();
    await oauth.handleToken(
      makeReq(
        "/token",
        "POST",
        `grant_type=authorization_code&code=${encodeURIComponent(mcpAuthCode)}&code_verifier=WRONG`
      ),
      tokenRes as unknown as ServerResponse
    );
    expect(tokenRes.status).toBe(400);
    expect(JSON.parse(tokenRes.body).error).toBe("invalid_grant");
  });

  it("rejects /token before the orchyn sign-in completes", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    await runAuthorize(oauth);
    const tokenRes = makeRes();
    await oauth.handleToken(
      makeReq("/token", "POST", "grant_type=authorization_code&code=nonexistent&code_verifier=x"),
      tokenRes as unknown as ServerResponse
    );
    expect(JSON.parse(tokenRes.body).error).toBe("invalid_grant");
  });

  it("renders an error page when the orchyn exchange fails", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const { orchynState } = await runAuthorize(oauth);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "bad code" }), { status: 400 }))
    );
    const res = makeRes();
    await oauth.handleCallback(
      makeReq(`/oauth/callback?state=${encodeURIComponent(orchynState)}&code=broken`),
      res as unknown as ServerResponse
    );
    expect(res.status).toBe(502);
    expect(res.body).toContain("bad code");
  });

  it("expires sessions after TTL", async () => {
    const oauth = new OAuthManager({ publicUrl: PUBLIC_URL, client: makeClient() });
    const { orchynState } = await runAuthorize(oauth);
    const cbRes = await completeSignIn(oauth, orchynState);
    const mcpAuthCode = new URL(cbRes.headers.location).searchParams.get("code") as string;
    const verifier = "0123456789abcdefghijklmnopqrstuvwx";
    const tokenRes = makeRes();
    await oauth.handleToken(
      makeReq(
        "/token",
        "POST",
        `grant_type=authorization_code&code=${encodeURIComponent(mcpAuthCode)}&code_verifier=${encodeURIComponent(verifier)}&client_id=claude`
      ),
      tokenRes as unknown as ServerResponse
    );
    const tokenBody = JSON.parse(tokenRes.body);
    const session = oauth.verifyToken(tokenBody.access_token)!;
    session.expiresAt = Date.now() - 1000;
    expect(oauth.verifyToken(tokenBody.access_token)).toBeUndefined();
  });
});

/**
 * The advertised scopes changed from a single `analyze:video` to
 * `social:read` + `credits:spend`, which describe what the 24 tools actually
 * do. /authorize validates the requested scope, so already-connected clients
 * — which still ask for the old value — must keep working.
 */
describe("scope compatibility", () => {
  it("still accepts the legacy scope at /authorize", async () => {
    const { LEGACY_SCOPE, SCOPES } = await import("../src/oauth.js");
    expect(LEGACY_SCOPE).toBe("analyze:video");
    expect([...SCOPES]).toEqual(["social:read", "credits:spend"]);
  });
});
