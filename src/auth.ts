/**
 * Token storage + resolution.
 *
 * Priority: env NOOTICR_ACCESS_TOKEN > env NOOTICR_API_KEY > credentials file
 * (auto-refresh when expired) > per-session tokens (HTTP OAuth mode only).
 *
 * `NOOTICR_ACCESS_TOKEN` stays first because it has always been the explicit
 * "use exactly this token" override, and someone who exports one for a single
 * debugging run should get it. An API key sits directly behind it: it is the
 * credential a server holds permanently, so it outranks anything a browser
 * login left in a file.
 */

import fs from "node:fs";
import path from "node:path";
import { getApiKey } from "./config.js";
import { NooticrClient, NooticrError, NooticrSession, NooticrUser, TokenProvider } from "./nooticr.js";

const REFRESH_BEFORE_EXPIRY_MS = 30_000;

export interface TokenStore {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  fetchedAt?: number;
  user?: NooticrUser;
}

export class NooticrAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NooticrAuthError";
  }
}

export function isTokenExpired(store: TokenStore, nowMs: number = Date.now()): boolean {
  if (!store.expiresIn || !store.fetchedAt) return false;
  const expiresAtMs = store.fetchedAt + store.expiresIn * 1000;
  return nowMs >= expiresAtMs - REFRESH_BEFORE_EXPIRY_MS;
}

export class AuthManager {
  baseUrl: string;
  credentialsFile: string;
  private client: NooticrClient;
  private lastRefreshToken?: string;
  private lastSource?: "env" | "apiKey" | "file" | "session";

  constructor(baseUrl: string, credentialsFile: string) {
    this.baseUrl = baseUrl;
    this.credentialsFile = credentialsFile;
    this.client = new NooticrClient(baseUrl, {
      getAccessToken: async () => undefined,
    });
  }

  getCredentialsFile(): string {
    return this.credentialsFile;
  }

  async loadStore(): Promise<TokenStore | null> {
    try {
      const raw = await fs.promises.readFile(this.credentialsFile, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.accessToken === "string") {
        return parsed as TokenStore;
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveStore(store: TokenStore): Promise<void> {
    const dir = path.dirname(this.credentialsFile);
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.credentialsFile}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(store, null, 2), {
      mode: 0o600,
    });
    await fs.promises.chmod(tmp, 0o600);
    await fs.promises.rename(tmp, this.credentialsFile);
    await fs.promises.chmod(this.credentialsFile, 0o600);
  }

  /**
   * Resolves the current access token for a request. `session` provides the
   * per-session tokens issued via our own OAuth /token endpoint (HTTP mode).
   *
   * `allowApiKey` exists for the one caller that must not use one: the
   * `api-key` CLI commands. The backend refuses key management to a
   * key-authenticated caller, so resolving `NOOTICR_API_KEY` there would turn
   * "create me a second key" into a 403 that reads like a permissions bug
   * rather than the deliberate bound it is.
   */
  async getAccessToken(
    session?: { accessToken?: string; refreshToken?: string },
    { allowApiKey = true }: { allowApiKey?: boolean } = {}
  ): Promise<string | undefined> {
    const envToken = process.env.NOOTICR_ACCESS_TOKEN;
    if (envToken) {
      this.lastSource = "env";
      this.lastRefreshToken = undefined;
      return envToken;
    }

    const apiKey = allowApiKey ? getApiKey() : undefined;
    if (apiKey) {
      this.lastSource = "apiKey";
      this.lastRefreshToken = undefined;
      return apiKey;
    }

    const store = await this.loadStore();
    if (store?.accessToken && !isTokenExpired(store)) {
      this.lastSource = "file";
      this.lastRefreshToken = store.refreshToken;
      return store.accessToken;
    }

    if (store?.refreshToken) {
      try {
        const refreshed = await this.refresh(store.refreshToken);
        return refreshed;
      } catch (err) {
        // Fall through to session/env resolution; the file refresh will be
        // retried lazily on the next request.
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[nooticr-mcp] warning: could not refresh stored token: ${msg}\n`
        );
      }
    }

    if (session?.accessToken) {
      this.lastSource = "session";
      this.lastRefreshToken = session.refreshToken;
      return session.accessToken;
    }

    return undefined;
  }

  /**
   * Attempts to refresh using the refresh token of the source that supplied
   * the current token. Returns true when a new token is available.
   */
  async onUnauthorized(session?: { refreshToken?: string }): Promise<boolean> {
    // A key has nothing to redeem: a 401 on one means revoked, expired or
    // mistyped, and retrying with the same string forever would hide that.
    if (this.lastSource === "apiKey") return false;
    let refreshToken = this.lastRefreshToken;
    if (this.lastSource === "session" && session?.refreshToken) {
      refreshToken = session.refreshToken;
    }
    if (!refreshToken) return false;
    try {
      await this.refresh(refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  /** Refreshes with the given refresh token, persists, and returns the new access token. */
  private async refresh(refreshToken: string): Promise<string> {
    const session = await this.client.refresh(refreshToken);
    if (!session.accessToken) {
      throw new NooticrError(500, "Refresh succeeded but returned no access token.");
    }
    const store: TokenStore = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken ?? refreshToken,
      expiresIn: session.expiresIn,
      fetchedAt: Date.now(),
      user: session.user,
    };
    await this.saveStore(store);
    this.lastSource = "file";
    this.lastRefreshToken = store.refreshToken;
    return store.accessToken;
  }

  /**
   * Persists a session obtained from login/OAuth completion.
   */
  async persistSession(session: NooticrSession): Promise<void> {
    const store: TokenStore = {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      fetchedAt: Date.now(),
      user: session.user,
    };
    await this.saveStore(store);
    this.lastSource = "file";
    this.lastRefreshToken = store.refreshToken;
  }

  ensureUnauthenticatedError(): never {
    throw new NooticrAuthError(
      "Not authenticated with nooticr. Run `npx nooticr-mcp login` to sign in " +
        "with Google, or — on a server with no browser — set NOOTICR_API_KEY " +
        "to a key from `npx nooticr-mcp api-key create` " +
        "(see `npx nooticr-mcp --help`)."
    );
  }
}

/** Builds a TokenProvider for stdio mode (env + file only). */
export function createStdioTokenProvider(auth: AuthManager): TokenProvider {
  return {
    getAccessToken: async () => auth.getAccessToken(),
    onUnauthorized: async () => auth.onUnauthorized(),
  };
}

/**
 * Builds a TokenProvider for the `api-key` CLI commands: env access token or
 * the credentials file, never `NOOTICR_API_KEY`. See `getAccessToken`.
 */
export function createManagementTokenProvider(auth: AuthManager): TokenProvider {
  return {
    getAccessToken: async () => auth.getAccessToken(undefined, { allowApiKey: false }),
    onUnauthorized: async () => auth.onUnauthorized(),
  };
}

/**
 * Builds a TokenProvider for one caller's own API key — the headless path
 * through HTTP mode, where the bearer the client presented *is* the nooticr
 * credential. Deliberately not `createHttpTokenProvider`: that one falls back
 * to the operator's environment and credentials file, which would answer one
 * tenant's call with another's account.
 */
export function createApiKeyTokenProvider(apiKey: string): TokenProvider {
  return { getAccessToken: async () => apiKey };
}

/** Builds a TokenProvider for HTTP mode: env > api key > file > per-session tokens. */
export function createHttpTokenProvider(
  auth: AuthManager,
  session?: { accessToken?: string; refreshToken?: string }
): TokenProvider {
  return {
    getAccessToken: async () => auth.getAccessToken(session),
    onUnauthorized: async () => auth.onUnauthorized(session),
  };
}
