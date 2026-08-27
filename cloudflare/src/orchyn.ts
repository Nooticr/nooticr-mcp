/**
 * Typed client for the orchyn REST API (Cloudflare Worker port).
 *
 * All API errors are normalized to `OrchynError`. 402 responses are
 * detected specifically and exposed via the `paywall` property.
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

export interface McpProxyResult {
  contentBlocks: Array<{ type: string; [key: string]: unknown }>;
  structured: unknown;
}

/**
 * Extracts the `exp` claim (epoch seconds) from an orchyn JWT without
 * verifying the signature — enough for the worker to decide whether to
 * refresh before the 15-minute access token expires.
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
  private token: string;
  private onUnauthorized?: () => Promise<string | undefined>;

  /**
   * @param onUnauthorized Called when the orchyn API rejects with 401 (access
   *   token expired). It should redeem the session's refresh token and return
   *   the new access token, or `undefined` when it cannot. When a new token is
   *   returned, the failed request is retried once with it.
   */
  constructor(baseUrl: string, token: string, onUnauthorized?: () => Promise<string | undefined>) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.onUnauthorized = onUnauthorized;
  }

  private async doRequest(method: string, path: string, opts: { body?: unknown; auth?: boolean }, token: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (opts.auth && token) {
      headers.authorization = `Bearer ${token}`;
    }
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  private async request<T>(method: string, path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<T> {
    let res = await this.doRequest(method, path, opts, this.token);
    if (res.status === 401 && opts.auth && this.onUnauthorized) {
      const refreshed = await this.onUnauthorized();
      if (refreshed) {
        this.token = refreshed;
        res = await this.doRequest(method, path, opts, refreshed);
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
    return this.request<VideoJob>("POST", "/mcp/analyze-video", {
      auth: true,
      body: appId !== undefined ? { url, appId } : { url },
    });
  }

  async getJob(jobId: string): Promise<JobStatus> {
    return this.request<JobStatus>("GET", `/ai/analyze-post?jobId=${encodeURIComponent(jobId)}`, {
      auth: true,
    });
  }

  async me(): Promise<OrchynUser> {
    return this.request<OrchynUser>("GET", "/auth/me", { auth: true });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpProxyResult> {
    const body = {
      jsonrpc: "2.0" as const,
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    };
    let res = await this.doRequest("POST", "/mcp", { body, auth: true }, this.token);
    if (res.status === 401 && this.onUnauthorized) {
      const refreshed = await this.onUnauthorized();
      if (refreshed) {
        this.token = refreshed;
        res = await this.doRequest("POST", "/mcp", { body, auth: true }, refreshed);
      }
    }
    const text = await res.text();
    let rpc: Record<string, any>;
    try {
      rpc = text ? JSON.parse(text) : {};
    } catch {
      throw new OrchynError(res.status, `Invalid JSON from /mcp`);
    }
    if (rpc.error) {
      const msg = typeof rpc.error.message === "string" ? rpc.error.message : "MCP tool failed";
      throw new OrchynError(rpc.error.code === -32002 ? 402 : 400, msg);
    }
    const result = (rpc.result ?? {}) as { content?: Array<{ type: string; [key: string]: unknown }>; structuredContent?: unknown; isError?: boolean };
    if (result.isError) {
      const msg =
        result.content
          ?.filter((c) => c.type === "text")
          .map((c) => String((c as any).text ?? ""))
          .join("\n") || "MCP tool failed";
      throw new OrchynError(400, msg);
    }
    return { contentBlocks: result.content ?? [], structured: result.structuredContent };
  }

  /** Redeems a refresh token for a fresh orchyn session (rotating the refresh token). */
  static async refreshSession(baseUrl: string, refreshToken: string): Promise<OrchynSession> {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const json = (body ?? {}) as Record<string, unknown>;
    if (res.status >= 200 && res.status < 300) {
      if (!json || typeof json.accessToken !== "string") {
        throw new OrchynError(500, "Refresh succeeded but returned no access token.");
      }
      return body as OrchynSession;
    }
    throw new OrchynError(res.status, typeof json.error === "string" ? json.error : `Refresh failed (${res.status})`, { body });
  }

  static async login(baseUrl: string, email: string, password: string): Promise<OrchynSession> {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const json = (body ?? {}) as Record<string, unknown>;
    if (res.status >= 200 && res.status < 300) {
      return body as OrchynSession;
    }
    throw new OrchynError(res.status, typeof json.error === "string" ? json.error : `Login failed (${res.status})`, { body });
  }

  static async exchangeCode(baseUrl: string, code: string): Promise<OrchynSession> {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/auth/oauth/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    const json = (body ?? {}) as Record<string, unknown>;
    if (res.status >= 200 && res.status < 300) {
      return body as OrchynSession;
    }
    throw new OrchynError(res.status, typeof json.error === "string" ? json.error : `Code exchange failed (${res.status})`, { body });
  }
}
