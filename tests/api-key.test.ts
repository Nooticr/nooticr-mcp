/**
 * The non-interactive credential, end to end through every layer that has to
 * agree about it.
 *
 * The failure this file exists to prevent is not "a key does not work" — that
 * one is loud. It is a key working *as somebody else*: an integration sends
 * its own key, some layer falls back to the deployment's stored credentials
 * because no OAuth session matched, and every call is answered from the wrong
 * account with nothing failing. Both the stdio path (`AuthManager`) and the
 * remote path (the worker's `makeClientForSession`) have that fallback sitting
 * right next to the key branch, so both are pinned here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_KEY_PREFIX, looksLikeApiKey } from "../src/shared/api-key.js";
import { AuthManager } from "../src/auth.js";
import { NooticrClient, NooticrError } from "../src/shared/nooticr.js";
import { apiKeyIsValid, validMcpToken } from "../cloudflare/src/oauth.js";
import { makeClientForSession } from "../cloudflare/src/endpoint.js";

const BASE = "http://localhost:8080";
const KEY = `${API_KEY_PREFIX}0123456789abcdef0123456789abcdef`;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NOOTICR_ACCESS_TOKEN;
  delete process.env.NOOTICR_API_KEY;
});

async function withCredentialsFile(
  contents: unknown,
  run: (file: string) => Promise<void>
): Promise<void> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "nooticr-api-key-"));
  const file = path.join(dir, "credentials.json");
  await fs.promises.writeFile(file, JSON.stringify(contents));
  try {
    await run(file);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

/** A KV namespace with just the three methods the key cache uses. */
function fakeStore() {
  const rows = new Map<string, string>();
  return {
    rows,
    kv: {
      get: async (key: string) => rows.get(key) ?? null,
      put: async (key: string, value: string) => {
        rows.set(key, value);
      },
      delete: async (key: string) => {
        rows.delete(key);
      },
    },
  };
}

function fakeEnv(extra: Record<string, unknown> = {}) {
  const { rows, kv } = fakeStore();
  const env = {
    NOOTICR_BASE_URL: BASE,
    STORE: kv,
    ...extra,
  } as unknown as Parameters<typeof apiKeyIsValid>[0];
  return { env, rows };
}

describe("looksLikeApiKey", () => {
  it("separates a key from a JWT", () => {
    expect(looksLikeApiKey(KEY)).toBe(true);
    // The prefix is the whole discriminator, and a JWT's first segment is
    // base64url of `{"alg":...}` — it always starts "eyJ".
    expect(looksLikeApiKey("eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe(false);
    expect(looksLikeApiKey(undefined)).toBe(false);
    expect(looksLikeApiKey("")).toBe(false);
  });
});

describe("AuthManager with an API key", () => {
  it("prefers an explicit access token, then the key, then the file", async () => {
    await withCredentialsFile(
      { accessToken: "file-token", refreshToken: "rt", expiresIn: 3600, fetchedAt: Date.now() },
      async (file) => {
        const auth = new AuthManager(BASE, file);

        process.env.NOOTICR_API_KEY = KEY;
        process.env.NOOTICR_ACCESS_TOKEN = "env-token";
        expect(await auth.getAccessToken()).toBe("env-token");

        // The case the partner is actually in: a key and nothing else set.
        delete process.env.NOOTICR_ACCESS_TOKEN;
        expect(await auth.getAccessToken()).toBe(KEY);

        // …and the key outranks a perfectly good file token, because a server
        // that was given a key meant to use it.
        delete process.env.NOOTICR_API_KEY;
        expect(await auth.getAccessToken()).toBe("file-token");
      }
    );
  });

  it("ignores surrounding whitespace, which is how a key arrives from a secret store", async () => {
    await withCredentialsFile({}, async (file) => {
      process.env.NOOTICR_API_KEY = `  ${KEY}\n`;
      const auth = new AuthManager(BASE, file);
      expect(await auth.getAccessToken()).toBe(KEY);
    });
  });

  it("never refreshes a key: a 401 on one means revoked, not stale", async () => {
    await withCredentialsFile(
      { accessToken: "file-token", refreshToken: "rt", expiresIn: 3600, fetchedAt: Date.now() },
      async (file) => {
        process.env.NOOTICR_API_KEY = KEY;
        const auth = new AuthManager(BASE, file);
        expect(await auth.getAccessToken()).toBe(KEY);
        // The file's refresh token is right there. Redeeming it would answer
        // the caller's rejected key with somebody else's live session.
        expect(await auth.onUnauthorized()).toBe(false);
      }
    );
  });

  it("skips the key when the caller is managing keys", async () => {
    await withCredentialsFile(
      { accessToken: "file-token", refreshToken: "rt", expiresIn: 3600, fetchedAt: Date.now() },
      async (file) => {
        process.env.NOOTICR_API_KEY = KEY;
        const auth = new AuthManager(BASE, file);
        expect(await auth.getAccessToken(undefined, { allowApiKey: false })).toBe("file-token");
      }
    );
  });
});

describe("a key stored by `login --api-key`", () => {
  it("is used like the env var, and is never refreshed either", async () => {
    await withCredentialsFile({ apiKey: KEY }, async (file) => {
      const auth = new AuthManager(BASE, file);
      expect(await auth.getAccessToken()).toBe(KEY);
      expect(await auth.onUnauthorized()).toBe(false);
    });
  });

  it("is skipped when the caller is managing keys, wherever it was found", async () => {
    // The bound is about the credential, not about the environment: a key
    // that reached the process through the file would 403 just the same.
    await withCredentialsFile({ apiKey: KEY }, async (file) => {
      const auth = new AuthManager(BASE, file);
      expect(await auth.getAccessToken(undefined, { allowApiKey: false })).toBeUndefined();
    });
  });

  it("replaces whatever login last wrote, rather than sitting beside it", async () => {
    // A file holding both would make "who am I signed in as" unanswerable,
    // and would let a rejected key fall back to a stale session.
    await withCredentialsFile(
      { accessToken: "file-token", refreshToken: "rt", expiresIn: 3600, fetchedAt: Date.now() },
      async (file) => {
        const auth = new AuthManager(BASE, file);
        await auth.persistApiKey(KEY, { id: "u1", email: "partner@example.com" });

        const written = JSON.parse(await fs.promises.readFile(file, "utf8"));
        expect(written.apiKey).toBe(KEY);
        expect(written.accessToken).toBeUndefined();
        expect(written.refreshToken).toBeUndefined();
        expect(await new AuthManager(BASE, file).getAccessToken()).toBe(KEY);
      }
    );
  });

  it("is written with the same locked-down permissions as a session", async () => {
    await withCredentialsFile({}, async (file) => {
      const auth = new AuthManager(BASE, file);
      await auth.persistApiKey(KEY);
      const mode = (await fs.promises.stat(file)).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  it("still loses to an env key, so a deployment can override the box", async () => {
    await withCredentialsFile({ apiKey: KEY }, async (file) => {
      process.env.NOOTICR_API_KEY = `${API_KEY_PREFIX}fromtheenvironment`;
      const auth = new AuthManager(BASE, file);
      expect(await auth.getAccessToken()).toBe(`${API_KEY_PREFIX}fromtheenvironment`);
    });
  });
});

describe("the worker's view of a key", () => {
  it("asks the backend once, then remembers the answer", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { env, rows } = fakeEnv();

    expect(await apiKeyIsValid(env, KEY)).toBe(true);
    expect(await apiKeyIsValid(env, KEY)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The cache is keyed by a digest, never by the key itself: KV key names
    // are listable, and a live credential does not belong in one.
    const [cacheKey] = [...rows.keys()];
    expect(cacheKey).toMatch(/^apikey:[0-9a-f]{64}$/);
    expect(cacheKey).not.toContain(KEY);
  });

  it("remembers a rejection too, so a bad key is not a request per call", async () => {
    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { env } = fakeEnv();

    expect(await apiKeyIsValid(env, KEY)).toBe(false);
    expect(await apiKeyIsValid(env, KEY)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a backend outage as a bad key", async () => {
    const fetchMock = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const { env, rows } = fakeEnv();

    expect(await apiKeyIsValid(env, KEY)).toBe(false);
    expect(rows.size).toBe(0);
    // Otherwise every integration stays locked out for a minute after the
    // backend comes back, for a key that was fine the whole time.
    expect(await apiKeyIsValid(env, KEY)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a key as a bearer without an OAuth session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const { env } = fakeEnv();
    expect(await validMcpToken(env, KEY)).toBe(true);
    expect(await validMcpToken(env, "eyJhbGciOiJIUzI1NiJ9.e30.sig")).toBe(false);
  });

  it("answers a key-bearing call as that key, not as the deployment", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push((init?.headers as Record<string, string> | undefined)?.authorization ?? "");
        return new Response(JSON.stringify({ id: "u1", email: "partner@example.com" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
    );
    // A pre-provisioned deployment token is set, which is the trap: the
    // no-session branch right below the key branch would hand it out.
    const { env } = fakeEnv({ NOOTICR_ACCESS_TOKEN: "deployment-token" });

    const client = await makeClientForSession(env as never, KEY, undefined);
    await client.me();

    expect(seen).toEqual([`Bearer ${KEY}`]);
  });
});

describe("what a rejected key tells the caller", () => {
  it("does not tell someone signed in with a key to sign in", async () => {
    // They are signed in. What they need to hear is that a key cannot manage
    // keys — the one thing the generic message never says.
    await withCredentialsFile({ apiKey: KEY }, async (file) => {
      const auth = new AuthManager(BASE, file);
      expect(await auth.getAccessToken(undefined, { allowApiKey: false })).toBeUndefined();
      expect(await auth.getAccessToken()).toBe(KEY);
    });
  });

  it("surfaces the backend's own sentence instead of a bare status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("API keys cannot manage API keys — sign in to create or revoke one", {
            status: 403,
            headers: { "content-type": "text/plain" },
          })
      )
    );
    const client = new NooticrClient(BASE, { getAccessToken: async () => KEY });

    // The backend answers these routes with a bare string, so without
    // `plainTextError` a headless integration sees only "(403)" and has
    // nothing to act on.
    await expect(client.createApiKey({ name: "second" })).rejects.toThrow(
      /cannot manage API keys/
    );
    await expect(client.createApiKey({ name: "second" })).rejects.toBeInstanceOf(NooticrError);
  });
});
