/// <reference types="@cloudflare/workers-types" />

interface Env {
  STORE: KVNamespace;
  MCP_ENDPOINT: DurableObjectNamespace;
  PUBLIC_URL: string;
  NOOTICR_BASE_URL: string;
  NOOTICR_ACCESS_TOKEN?: string;
  POLL_TIMEOUT_MS?: string;
  /** Set via `wrangler secret put` once OpenAI issues it during app submission. */
  OPENAI_APPS_VERIFICATION_TOKEN?: string;
}
