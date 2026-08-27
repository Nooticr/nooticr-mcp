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

export class OrchynClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
  }

  private async request<T>(method: string, path: string, opts: { body?: unknown; auth?: boolean } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (opts.auth && this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
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
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
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
