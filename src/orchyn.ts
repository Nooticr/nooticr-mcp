/**
 * Typed client for the orchyn REST API.
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

export interface TokenProvider {
  /**
   * Returns the current access token, or undefined when unauthenticated.
   */
  getAccessToken(): Promise<string | undefined>;
  /**
   * Called when the API rejects with 401. Implementations should attempt to
   * refresh and return true when a fresh token is now available.
   */
  onUnauthorized?(): Promise<boolean>;
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

export class OrchynClient {
  private baseUrl: string;
  private tokenProvider: TokenProvider;

  constructor(baseUrl: string, tokenProvider: TokenProvider) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.tokenProvider = tokenProvider;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      auth?: boolean;
      token?: string;
    } = {}
  ): Promise<T> {
    const doRequest = async (accessToken?: string): Promise<Response> => {
      const headers: Record<string, string> = {};
      if (opts.body !== undefined) {
        headers["content-type"] = "application/json";
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
    if (
      res.status === 401 &&
      opts.auth &&
      this.tokenProvider.onUnauthorized
    ) {
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

  async exchangeCompletionCode(
    code: string,
    workspaceId?: string
  ): Promise<OrchynSession> {
    return this.request<OrchynSession>("POST", "/auth/oauth/complete", {
      auth: false,
      body: workspaceId !== undefined ? { code, workspaceId } : { code },
    });
  }

  /** Starts a Google sign-in for the given redirect URL; returns the Google redirectUrl. */
  async startGoogleSignIn(redirect: string): Promise<{ redirectUrl: string }> {
    return this.request<{ redirectUrl: string }>("POST", "/auth/google/start", {
      auth: false,
      body: { redirect },
    });
  }

  async login(email: string, password: string): Promise<OrchynSession> {
    return this.request<OrchynSession>("POST", "/auth/login", {
      auth: false,
      body: { email, password },
    });
  }

  async refresh(refreshToken: string): Promise<OrchynSession> {
    return this.request<OrchynSession>("POST", "/auth/refresh", {
      auth: false,
      body: { refreshToken },
    });
  }
}
