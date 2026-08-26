/// <reference types="@cloudflare/workers-types" />

interface Env {
  STORE: KVNamespace;
  MCP_ENDPOINT: DurableObjectNamespace;
  PUBLIC_URL: string;
  ORCHYN_BASE_URL: string;
  ORCHYN_ACCESS_TOKEN?: string;
  POLL_TIMEOUT_MS?: string;
}
