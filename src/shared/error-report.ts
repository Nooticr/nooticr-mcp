/**
 * nooticr-mcp's own failures, as `$exception` events in Nooticr's PostHog project.
 *
 * ## Why
 *
 * The Site Reliability Engineer employee in nooticr-server is woken by new and
 * spiking issues in that project (its error watch). The server reports every
 * tool error it can see: in an employee's run, in a chat turn, and on
 * `POST /mcp` for a call made through this server. What it cannot see is a
 * failure that happens *here*: on 2026-11-06 `get_brand_playbook` answered a
 * structuredContent its own outputSchema refused ("Output validation error:
 * Invalid structured content for tool get_brand_playbook: Invalid input at
 * brand_playbook"). The SDK turns that into an `isError` result after the
 * handler returns, so for a Claude or ChatGPT user nothing anywhere said so.
 *
 * ## What is reported, and what is left to the server
 *
 * - A result that breaks its own tool's outputSchema (checked here the way the
 *   SDK checks it, with the SDK's own wording, so the fingerprint is the one
 *   the server computes when the same refusal reaches a chat turn).
 * - A handler that threw, or failed on something that is not the backend's
 *   answer (a bug here, a network failure reaching nooticr-server).
 * - nooticr-server unreachable.
 *
 * Not reported: a JSON-RPC refusal or an HTTP error the backend answered. The
 * server already reported its own failures (`mcp_tools::report_connector_error`,
 * its 5xx), and the rest are the caller's own request. And nothing from a
 * session nooticr-server forwarded (its chat, its employees): the server's
 * agent loop sees those results and reports them with the thread they belong
 * to. One failure, one issue.
 *
 * ## Privacy
 *
 * Ids and labels only, as nooticr-server's `posthog/errors.rs`: the tool, the
 * code, the message as a template with every value taken out ([`template`]).
 * Never an argument, an email, a URL, or the backend's own text.
 *
 * Off unless `POSTHOG_PROJECT_TOKEN` is set (the project token, `phc_`), in
 * Node and in the Worker alike (`nodejs_compat` fills `process.env`).
 */
import { normalizeObjectSchema, safeParseAsync, getParseErrorMessage } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { forwardedSession } from "./api-key.js";
import { NooticrError } from "./nooticr.js";

export const SERVICE = "nooticr-mcp";
export const REPOSITORY = "Nooticr/nooticr-mcp";
const DEFAULT_HOST = "https://eu.i.posthog.com";

/** One failure worth reporting. */
export interface ToolFailure {
  tool: string;
  /** The JSON-RPC code, when the failure has one. */
  code?: number;
  /** The failure's own message; only its template leaves. */
  message: string;
  /** `output_schema`, `threw`, `unreachable`. */
  kind: "output_schema" | "threw" | "unreachable";
}

type Sender = (url: string, body: string) => Promise<unknown>;

interface Config {
  token: string;
  host: string;
  environment: string;
  release: string;
  send: Sender;
}

let override: Config | null | undefined;

/** For tests, and for a runtime that wants its own sender (a Worker's `waitUntil`). */
export function configureErrorReporting(c: Partial<Config> & { token: string } | null): void {
  override = c === null ? null : { ...fromEnv(), ...c } as Config;
  limiter.clear();
}

function env(name: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env?.[name]?.trim() : undefined;
  return v ? v : undefined;
}

function fromEnv(): Config | null {
  const token = env("POSTHOG_PROJECT_TOKEN");
  // A personal key (phx_) would be refused by PostHog's capture API anyway.
  if (!token || token.startsWith("phx_")) return null;
  return {
    token,
    host: (env("POSTHOG_HOST") ?? DEFAULT_HOST).replace(/\/+$/, ""),
    environment: env("POSTHOG_ENVIRONMENT") ?? "production",
    release: env("NOOTICR_MCP_BUILD_SHA") ?? "unknown",
    send: (url, body) =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body }),
  };
}

function config(): Config | null {
  return override === undefined ? fromEnv() : override;
}

// --- the message template, as nooticr-server's `employees::tool_errors::template` ---

const TEMPLATE_WORDS = 12;
const TEMPLATE_CHARS = 120;
const QUOTED = /"[^"]*"|`[^`]*`|“[^”]*”|«[^»]*»|(?:^|\s)'[^'\s][^']*'/g;
const SDK_CODE = /^MCP error (-?\d+)/;

/**
 * `message` with every value taken out, so one error is one fingerprint whatever
 * it was called with: quoted text becomes `"…"`, and a word holding a digit,
 * `@`, `/`, `.`, `_`, `=` or `:` inside it becomes `<v>`. The server computes the
 * same template for the same refusal seen in a chat turn; keep the two in step.
 */
export function template(message: string): string {
  let line = (message.split("\n")[0] ?? "").trim();
  const sdk = SDK_CODE.exec(line);
  if (sdk) line = line.slice(sdk[0].length).replace(/^:+/, "").trim();
  line = line.replace(QUOTED, ' "…"');
  const words = line
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, TEMPLATE_WORDS)
    .map((w) => {
      const core = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const chars = [...core];
      const hexId = chars.length >= 12 && /^[0-9a-fA-F]+$/.test(core);
      const valued =
        /[0-9]/.test(core) || /[@/._=:]/.test(core) || chars.length > 24 || hexId;
      return core && valued ? w.replace(core, "<v>") : w;
    });
  const t = words.join(" ");
  if (!t) return "no message";
  return [...t].slice(0, TEMPLATE_CHARS).join("");
}

/** As the server's `tool_error_fingerprint`, so a failure seen on both sides is one issue. */
export function fingerprint(tool: string, code: number | undefined, tmpl: string): string {
  return `employee_tool:${tool}:${code ?? "none"}:${tmpl}`;
}

// --- rate: one fingerprint at most 20 times a minute, as the server's limiter ---

const PER_WINDOW = 20;
const WINDOW_MS = 60_000;
const TRACKED = 512;
const limiter = new Map<string, { start: number; n: number }>();

function allow(fp: string, now: number): boolean {
  if (limiter.size >= TRACKED && !limiter.has(fp)) {
    for (const [k, v] of limiter) if (now - v.start >= WINDOW_MS) limiter.delete(k);
    if (limiter.size >= TRACKED) return false;
  }
  const e = limiter.get(fp) ?? { start: now, n: 0 };
  if (now - e.start >= WINDOW_MS) {
    e.start = now;
    e.n = 0;
  }
  e.n += 1;
  limiter.set(fp, e);
  return e.n <= PER_WINDOW;
}

/** The capture body for one failure, or null when it is over its rate. */
export function exceptionEvent(f: ToolFailure, c: Pick<Config, "token" | "environment" | "release">) {
  const tmpl = template(f.message);
  const fp = fingerprint(f.tool, f.code, tmpl);
  return {
    fingerprint: fp,
    body: {
      api_key: c.token,
      event: "$exception",
      // No person: the caller's identity is the backend's to know, and an
      // anonymous id keeps a person profile from being made per failure.
      distinct_id: SERVICE,
      properties: {
        $process_person_profile: false,
        $exception_list: [
          {
            type: "ToolError",
            value: `${f.tool} failed (${f.code ?? "none"}): ${tmpl}`,
            mechanism: { handled: true, synthetic: true },
          },
        ],
        $exception_fingerprint: fp,
        $exception_level: "error",
        tool: f.tool,
        rpc_code: f.code ?? null,
        error_origin: "nooticr",
        error_kind: f.kind,
        error_template: tmpl,
        surface: "mcp",
        service: SERVICE,
        repository: REPOSITORY,
        environment: c.environment,
        release: c.release,
        $lib: SERVICE,
      },
    },
  };
}

/** Reports `f`. Never throws and never waits: a PostHog that is down costs the caller nothing. */
export function reportToolFailure(f: ToolFailure): void {
  const c = config();
  if (!c) return;
  const { fingerprint: fp, body } = exceptionEvent(f, c);
  if (!allow(fp, Date.now())) return;
  try {
    void Promise.resolve(c.send(`${c.host}/i/v0/e/`, JSON.stringify(body))).catch(() => {});
  } catch {
    /* reporting must never fail a tool call */
  }
}

// --- classifying a tool call's outcome ---

const FAILED_WITH = new WeakMap<object, unknown>();

/** Called by `failed()`: remembers what a failed result failed on, for [`observeToolCall`]. */
export function noteFailure(result: object, err: unknown): void {
  FAILED_WITH.set(result, err);
}

/**
 * The failure behind a `failed()` result that is ours to report, or null.
 * A backend answer (a JSON-RPC refusal, an HTTP status) was reported by the
 * server when it was a failure, and is the caller's own request when it was not.
 */
export function ownFailure(tool: string, err: unknown): ToolFailure | null {
  if (err instanceof NooticrError) {
    // One outage, one issue: the cause (refused, reset, timed out) and the path are
    // the network's words, which would split it into as many issues as it has.
    if (err.status === 0) return { tool, message: "nooticr-server unreachable", kind: "unreachable" };
    return null;
  }
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return { tool, message, kind: "threw" };
}

/** Whether a call came through a session nooticr-server forwarded (its chat, its employees). */
export function forwardedByServer(extra: unknown): boolean {
  const token = (extra as { authInfo?: { token?: string } } | undefined)?.authInfo?.token;
  return Boolean(forwardedSession(token));
}

/**
 * Checks a finished call the way the SDK will, and reports what is ours.
 * Called from the one `registerTool` wrapper in `createMcpServer`, after the
 * handler returns and before the SDK validates the result.
 */
export async function observeToolCall(
  tool: string,
  outputSchema: unknown,
  extra: unknown,
  result: { structuredContent?: unknown; isError?: boolean; content?: unknown } | undefined
): Promise<void> {
  if (!config() || forwardedByServer(extra) || !result) return;
  if (result.isError) {
    const err = FAILED_WITH.get(result);
    const own = err === undefined ? null : ownFailure(tool, err);
    if (own) reportToolFailure(own);
    return;
  }
  if (!outputSchema || !("content" in result)) return;
  if (!result.structuredContent) {
    reportToolFailure({
      tool,
      code: -32602,
      kind: "output_schema",
      message: `Output validation error: Tool ${tool} has an output schema but no structured content was provided`,
    });
    return;
  }
  try {
    const schema = normalizeObjectSchema(outputSchema as never);
    if (!schema) return;
    const parsed = await safeParseAsync(schema, result.structuredContent);
    if (!parsed.success) {
      const error = "error" in parsed ? parsed.error : "Unknown error";
      reportToolFailure({
        tool,
        code: -32602,
        kind: "output_schema",
        message: `Output validation error: Invalid structured content for tool ${tool}: ${getParseErrorMessage(error)}`,
      });
    }
  } catch {
    /* the SDK will say what it says; this check only reports */
  }
}
