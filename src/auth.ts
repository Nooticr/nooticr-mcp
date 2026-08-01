/**
 * Token storage + resolution.
 *
 * Priority: env ORCHYN_ACCESS_TOKEN > credentials file (auto-refresh when
 * expired) > per-session tokens (HTTP OAuth mode only).
 */

import fs from "node:fs";
import path from "node:path";
import { OrchynClient, OrchynError, OrchynSession, OrchynUser, TokenProvider } from "./orchyn.js";

const REFRESH_BEFORE_EXPIRY_MS = 30_000;

export interface TokenStore {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  fetchedAt?: number;
  user?: OrchynUser;
}

export class OrchynAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchynAuthError";
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
  private client: OrchynClient;
  private lastRefreshToken?: string;
  private lastSource?: "env" | "file" | "session";

  constructor(baseUrl: string, credentialsFile: string) {
    this.baseUrl = baseUrl;
    this.credentialsFile = credentialsFile;
    this.client = new OrchynClient(baseUrl, {
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
   */
  async getAccessToken(session?: { accessToken?: string; refreshToken?: string }): Promise<string | undefined> {
    const envToken = process.env.ORCHYN_ACCESS_TOKEN;
    if (envToken) {
      this.lastSource = "env";
      this.lastRefreshToken = undefined;
      return envToken;
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
          `[orchyn-mcp] warning: could not refresh stored token: ${msg}\n`
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
      throw new OrchynError(500, "Refresh succeeded but returned no access token.");
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
  async persistSession(session: OrchynSession): Promise<void> {
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
    throw new OrchynAuthError(
      "Not authenticated with orchyn. Run `npx orchyn-mcp login` to sign in " +
        "with Google, or set the ORCHYN_ACCESS_TOKEN environment variable " +
        "(see `npx orchyn-mcp --help`)."
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

/** Builds a TokenProvider for HTTP mode: env > file > per-session tokens. */
export function createHttpTokenProvider(
  auth: AuthManager,
  session?: { accessToken?: string; refreshToken?: string }
): TokenProvider {
  return {
    getAccessToken: async () => auth.getAccessToken(session),
    onUnauthorized: async () => auth.onUnauthorized(session),
  };
}
