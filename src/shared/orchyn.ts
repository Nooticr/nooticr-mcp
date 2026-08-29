/**
 * Runtime-agnostic orchyn API client — the single source of truth for the
 * Node package (`@orchyn/mcp`) and the Cloudflare Worker (mcp.orchyn.com).
 *
 * Only Web-standard APIs are used (fetch, crypto, atob), so both runtimes
 * import this same module: no duplicated client logic to keep in sync. Token
 * storage lives behind the `TokenProvider` interface — a credentials file for
 * the Node CLI, a KV-backed session for the Worker.
 */

export interface OrchynUser {
  id: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface OrchynSession {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  user?: OrchynUser;
}

export interface PaywallInfo {
  reason?: string;
  used?: number;
  max?: number;
  cost?: number;
}

export class OrchynError extends Error {
  status: number;
  code?: string;
  paywall?: PaywallInfo;
  body?: unknown;

  constructor(
    status: number,
    message: string,
    opts: { code?: string; paywall?: PaywallInfo; body?: unknown } = {}
  ) {
    super(message);
    this.name = "OrchynError";
    this.status = status;
    this.code = opts.code;
    this.paywall = opts.paywall;
    this.body = opts.body;
  }
}

export interface VideoJob {
  ok: boolean;
  jobId: string;
  state: string;
  platform?: string;
  provider?: string;
  appId?: number;
  workspaceId?: string;
  cost?: number;
  freeGrant?: boolean;
  post?: unknown;
  /**
   * Inline thumbnail images the backend attached to the job response as
   * `_inlineImages`. Each entry carries a permanent orchyn public `url`
   * (the backend re-hosts thumbnails into storage and transcodes HEIC→JPEG)
   * so clients render a valid public link instead of raw base64 CDN bytes.
   */
  inlineImages?: Array<{ url?: string; data?: string; mimeType?: string }>;
}

export interface JobStatus {
  ok: boolean;
  jobId: string;
  state: "pending" | "thinking" | "done" | "error" | string;
  progressChars?: number;
  contentPreview?: string;
  analysis?: unknown;
  provider?: string;
  error?: string;
  elapsedMs?: number;
}

/**
 * Normalized response of a proxied `tools/call` against the orchyn backend
 * (`POST /mcp`). `contentBlocks` carries MCP content blocks verbatim —
 * including inline thumbnail `image` blocks the backend attaches — while
 * `structured` is the parsed tool payload.
 */
export interface McpProxyResult {
  contentBlocks: Array<{ type: string; [key: string]: unknown }>;
  structured: unknown;
}

/**
 * Supplies the access token for each request and (optionally) refreshes it
 * when the orchyn API rejects with 401. Implementations own token storage:
 * a credentials file for the Node CLI (`src/auth.ts`), a KV session for the
 * Cloudflare Worker (`cloudflare/src/endpoint.ts`).
 */
export interface TokenProvider {
  getAccessToken(): Promise<string | undefined>;
  /**
   * Called when the API rejects with 401. Should redeem a refresh token and
   * persist the rotated tokens; return true when a fresh access token is now
   * available (getAccessToken will be asked again).
   */
  onUnauthorized?(): Promise<boolean>;
}

/**
 * Extracts the `exp` claim (epoch seconds) from an orchyn JWT without
 * verifying the signature — enough to decide whether to refresh before the
 * 15-minute access token expires.
 */
export function jwtExpiry(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const claims = JSON.parse(json) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp : undefined;
  } catch {
    return undefined;
  }
}

export class OrchynClient {
  private baseUrl: string;
  private tokenProvider: TokenProvider;
  /** Stable per-call key so a retried tool call is billed once. */
  private idempotencyKey?: string;

  constructor(baseUrl: string, tokenProvider: TokenProvider, idempotencyKey?: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.tokenProvider = tokenProvider;
    this.idempotencyKey = idempotencyKey;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      auth?: boolean;
      token?: string;
      idempotent?: boolean;
    } = {}
  ): Promise<T> {
    const doRequest = async (accessToken?: string): Promise<Response> => {
      const headers: Record<string, string> = {};
      if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
      }
      // Billed calls carry the key so the backend charges a retry once. A
      // redeploy or dropped stream mid-call leaves the client with no result,
      // and its retry must not cost the user a second time.
      if (opts.idempotent && this.idempotencyKey) {
        headers["idempotency-key"] = this.idempotencyKey;
      }
      if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
      }
      return fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    };

    let token: string | undefined = opts.token;
    if (opts.auth && !token) {
      token = await this.tokenProvider.getAccessToken();
    }
    if (opts.auth && !token) {
      throw new OrchynError(401, "No orchyn access token available.");
    }

    let res = await doRequest(token);
    if (res.status === 401 && opts.auth && this.tokenProvider.onUnauthorized) {
      const refreshed = await this.tokenProvider.onUnauthorized();
      if (refreshed) {
        token = await this.tokenProvider.getAccessToken();
        res = await doRequest(token);
      }
    }
    return this.normalizeResponse<T>(res, path);
  }

  private async normalizeResponse<T>(res: Response, path: string): Promise<T> {
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const json = (body ?? {}) as Record<string, unknown>;
    const errorMessage =
      typeof json.error === "string" ? json.error : `orchyn API error (${res.status})`;

    if (res.status >= 200 && res.status < 300) {
      return body as T;
    }
    if (res.status === 402) {
      throw new OrchynError(402, errorMessage, {
        paywall: {
          reason: typeof json.reason === "string" ? json.reason : undefined,
          used: typeof json.used === "number" ? json.used : undefined,
          max: typeof json.max === "number" ? json.max : undefined,
          cost: typeof json.cost === "number" ? json.cost : undefined,
        },
        body,
      });
    }
    throw new OrchynError(res.status, errorMessage, {
      code: typeof json.code === "string" ? json.code : undefined,
      body,
    });
  }

  async startVideoAnalysis(url: string, appId?: number): Promise<VideoJob> {
    const res = await this.request<Record<string, unknown>>("POST", "/mcp/analyze-post", {
      auth: true,
      body: appId !== undefined ? { url, appId } : { url },
    });
    const inline = Array.isArray(res?._inlineImages)
      ? (res._inlineImages as Array<{ url?: string; data?: string; mimeType?: string }>)
      : undefined;
    const job = res as unknown as VideoJob;
    return { ...job, inlineImages: inline };
  }

  /**
   * Proxies a generic orchyn backend MCP tool (`get_social_media`,
   * `discover_social_videos`, `understand_social_post`, …) through
   * `POST /mcp` JSON-RPC. The backend enforces per-user credit billing;
   * tool-level failures surface as OrchynError with the backend message.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpProxyResult> {
    const rpc = await this.request<Record<string, unknown>>("POST", "/mcp", {
      auth: true,
      idempotent: true,
      body: {
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name, arguments: args },
      },
    });

    if (rpc && typeof rpc === "object" && rpc.error !== undefined && rpc.error !== null) {
      const err = rpc.error as { code?: unknown; message?: unknown };
      throw new OrchynError(
        err.code === -32002 ? 402 : 400,
        typeof err.message === "string" ? err.message : "orchyn MCP tool call failed"
      );
    }

    const result = (rpc.result ?? {}) as {
      content?: Array<{ type: string; [key: string]: unknown }>;
      structuredContent?: unknown;
      isError?: boolean;
    };

    if (result.isError) {
      const text = result.content
        ?.filter((c) => c.type === "text")
        .map((c) => String(c.text ?? ""))
        .join("\n");
      throw new OrchynError(400, text || "orchyn MCP tool call failed");
    }

    return {
      contentBlocks: result.content ?? [],
      structured: result.structuredContent,
    };
  }

  async getJob(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>("GET", `/ai/analyze-post?jobId=${encodeURIComponent(jobId)}`, {
      auth: true,
    });
  }

  async me(): Promise<OrchynUser> {
    return this.request<OrchynUser>("GET", "/auth/me", { auth: true });
  }

  async exchangeCompletionCode(code: string, workspaceId?: string): Promise<OrchynSession> {
    return OrchynClient.exchangeCode(this.baseUrl, code, workspaceId);
  }

  /** Starts a Google sign-in for the given redirect URL; returns the Google redirectUrl. */
  async startGoogleSignIn(redirect: string): Promise<{ redirectUrl: string }> {
    return this.request<{ redirectUrl: string }>("POST", "/auth/google/start", {
      auth: false,
      body: { redirect },
    });
  }

  async login(email: string, password: string): Promise<OrchynSession> {
    return OrchynClient.login(this.baseUrl, email, password);
  }

  async refresh(refreshToken: string): Promise<OrchynSession> {
    return OrchynClient.refreshSession(this.baseUrl, refreshToken);
  }

  static async login(baseUrl: string, email: string, password: string): Promise<OrchynSession> {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await parseJsonBody(res);
    if (res.status >= 200 && res.status < 300) {
      return body as OrchynSession;
    }
    throw new OrchynError(
      res.status,
      typeof (body as Record<string, unknown> | undefined)?.error === "string"
        ? ((body as Record<string, unknown>).error as string)
        : `Login failed (${res.status})`,
      { body }
    );
  }

  /** Exchanges an orchyn one-time completion code (MCP login flow) for a session. */
  static async exchangeCode(
    baseUrl: string,
    code: string,
    workspaceId?: string
  ): Promise<OrchynSession> {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/oauth/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(workspaceId !== undefined ? { code, workspaceId } : { code }),
    });
    const body = await parseJsonBody(res);
    if (res.status >= 200 && res.status < 300) {
      return body as OrchynSession;
    }
    throw new OrchynError(
      res.status,
      typeof (body as Record<string, unknown> | undefined)?.error === "string"
        ? ((body as Record<string, unknown>).error as string)
        : `Code exchange failed (${res.status})`,
      { body }
    );
  }

  /** Redeems a refresh token for a fresh orchyn session (rotating the refresh token). */
  static async refreshSession(baseUrl: string, refreshToken: string): Promise<OrchynSession> {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await parseJsonBody(res);
    const json = (body ?? {}) as Record<string, unknown>;
    if (res.status >= 200 && res.status < 300) {
      if (!json || typeof json.accessToken !== "string") {
        throw new OrchynError(500, "Refresh succeeded but returned no access token.");
      }
      return body as OrchynSession;
    }
    throw new OrchynError(
      res.status,
      typeof json.error === "string" ? json.error : `Refresh failed (${res.status})`,
      { body }
    );
  }
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
