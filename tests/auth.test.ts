import { afterEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { AuthManager, isTokenExpired } from "../src/auth.js";
import { NooticrError } from "../src/nooticr.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NOOTICR_ACCESS_TOKEN;
});

describe("isTokenExpired", () => {
  it("returns false for fresh tokens", () => {
    const now = Date.now();
    expect(isTokenExpired({ accessToken: "a", expiresIn: 3600, fetchedAt: now }, now)).toBe(false);
  });

  it("refreshes 30s early", () => {
    const now = Date.now();
    const fetchedAt = now - 3530 * 1000; // 3530s ago, 70s left but < 30s early threshold -> 3600-3530=70 > 30 so not expired
    expect(isTokenExpired({ accessToken: "a", expiresIn: 3600, fetchedAt }, now)).toBe(false);
    const fetchedAt2 = now - 3590 * 1000; // 10s left -> within 30s early window -> expired
    expect(isTokenExpired({ accessToken: "a", expiresIn: 3600, fetchedAt: fetchedAt2 }, now)).toBe(true);
  });

  it("returns false when expiry info is missing", () => {
    expect(isTokenExpired({ accessToken: "a" })).toBe(false);
  });
});

describe("AuthManager", () => {
  it("resolves env token first", async () => {
    process.env.NOOTICR_ACCESS_TOKEN = "env-token";
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    await fs.promises.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "credentials.json");
    await fs.promises.writeFile(
      file,
      JSON.stringify({ accessToken: "file-token", refreshToken: "rt" })
    );
    const auth = new AuthManager("http://localhost:8080", file);
    expect(await auth.getAccessToken()).toBe("env-token");
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("uses the file token when fresh", async () => {
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    await fs.promises.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "credentials.json");
    await fs.promises.writeFile(
      file,
      JSON.stringify({ accessToken: "file-token", refreshToken: "rt", expiresIn: 3600, fetchedAt: Date.now() })
    );
    const auth = new AuthManager("http://localhost:8080", file);
    expect(await auth.getAccessToken()).toBe("file-token");
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("refreshes an expired file token and persists the new session", async () => {
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    await fs.promises.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "credentials.json");
    await fs.promises.writeFile(
      file,
      JSON.stringify({
        accessToken: "stale",
        refreshToken: "refresh-tok",
        expiresIn: 3600,
        fetchedAt: Date.now() - 2 * 3600 * 1000,
      })
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: "fresh-token",
          refreshToken: "new-refresh",
          expiresIn: 3600,
          user: { id: "1", email: "me@example.com" },
        }),
        { status: 200 }
      )
    ));

    const auth = new AuthManager("http://localhost:8080", file);
    expect(await auth.getAccessToken()).toBe("fresh-token");

    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://localhost:8080/auth/refresh");
    expect(JSON.parse(init.body)).toEqual({ refreshToken: "refresh-tok" });

    const persisted = JSON.parse(await fs.promises.readFile(file, "utf8"));
    expect(persisted.accessToken).toBe("fresh-token");
    expect(persisted.refreshToken).toBe("new-refresh");
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("persists sessions with 0600 permissions", async () => {
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    const file = path.join(tmp, "credentials.json");
    const auth = new AuthManager("http://localhost:8080", file);
    await auth.persistSession({
      accessToken: "a",
      refreshToken: "b",
      expiresIn: 3600,
      user: { id: "1", email: "me@example.com" },
    });
    const stat = await fs.promises.stat(file);
    expect(stat.mode & 0o777).toBe(0o600);
    const parsed = JSON.parse(await fs.promises.readFile(file, "utf8"));
    expect(parsed).toMatchObject({ accessToken: "a", refreshToken: "b" });
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("uses file tokens before per-session tokens (env > file > session)", async () => {
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    await fs.promises.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "credentials.json");
    await fs.promises.writeFile(
      file,
      JSON.stringify({ accessToken: "file-token", refreshToken: "rt", expiresIn: 3600, fetchedAt: Date.now() })
    );
    const auth = new AuthManager("http://localhost:8080", file);
    expect(await auth.getAccessToken({ accessToken: "session-token" })).toBe("file-token");
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("falls back to the per-session token when no env/file token exists", async () => {
    const auth = new AuthManager("http://localhost:8080", "/nonexistent/creds.json");
    expect(await auth.getAccessToken({ accessToken: "session-token", refreshToken: "rt" })).toBe("session-token");
  });

  it("throws a helpful error when unauthenticated", async () => {
    const auth = new AuthManager("http://localhost:8080", "/nonexistent/creds.json");
    expect(await auth.getAccessToken()).toBeUndefined();
    expect(() => auth.ensureUnauthenticatedError()).toThrow(/nooticr-mcp login|NOOTICR_ACCESS_TOKEN/);
  });

  it("onUnauthorized returns false without a refresh token", async () => {
    const auth = new AuthManager("http://localhost:8080", "/nonexistent/creds.json");
    expect(await auth.onUnauthorized()).toBe(false);
  });

  it("onUnauthorized refreshes using the file refresh token on 401", async () => {
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    await fs.promises.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "credentials.json");
    await fs.promises.writeFile(
      file,
      JSON.stringify({ accessToken: "stale", refreshToken: "refresh-tok", expiresIn: 3600, fetchedAt: Date.now() })
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ accessToken: "fresh-token", refreshToken: "rt2", expiresIn: 3600 }),
        { status: 200 }
      )
    ));
    const auth = new AuthManager("http://localhost:8080", file);
    await auth.getAccessToken();
    expect(await auth.onUnauthorized()).toBe(true);
    expect(await auth.getAccessToken()).toBe("fresh-token");
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });

  it("normalizes refresh failures without throwing (falls back to session)", async () => {
    const tmp = path.join(os.tmpdir(), `nooticr-test-${Date.now()}`);
    await fs.promises.mkdir(tmp, { recursive: true });
    const file = path.join(tmp, "credentials.json");
    await fs.promises.writeFile(
      file,
      JSON.stringify({ accessToken: "stale", refreshToken: "refresh-tok", expiresIn: 3600, fetchedAt: Date.now() - 2 * 3600 * 1000 })
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid refresh token" }), { status: 401 })
    ));
    const auth = new AuthManager("http://localhost:8080", file);
    expect(await auth.getAccessToken({ accessToken: "session-token" })).toBe("session-token");
    await fs.promises.rm(tmp, { recursive: true, force: true });
  });
});
