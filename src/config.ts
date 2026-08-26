import path from "node:path";
import os from "node:os";

export const DEFAULT_BASE_URL = "https://api.orchyn.com";
export const DEFAULT_PUBLIC_URL = "http://localhost:3457";
export const DEFAULT_PORT = 3457;

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getBaseUrl(): string {
  const raw = process.env.ORCHYN_BASE_URL || DEFAULT_BASE_URL;
  const url = stripTrailingSlash(raw);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid ORCHYN_BASE_URL "${raw}": must be a valid http(s) URL.`
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid ORCHYN_BASE_URL "${raw}": only http and https are supported.`
    );
  }
  return url;
}

export function getPublicUrl(): string {
  const raw = process.env.ORCHYN_PUBLIC_URL || DEFAULT_PUBLIC_URL;
  const url = stripTrailingSlash(raw);
  try {
    new URL(url);
  } catch {
    throw new Error(
      `Invalid ORCHYN_PUBLIC_URL "${raw}": must be a valid http(s) URL.`
    );
  }
  return url;
}

export function getPort(): number {
  const raw = process.env.ORCHYN_PORT || String(DEFAULT_PORT);
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid ORCHYN_PORT "${raw}": must be a valid port number.`);
  }
  return port;
}

export function getCredentialsFile(): string {
  if (process.env.ORCHYN_CREDENTIALS_FILE) {
    return process.env.ORCHYN_CREDENTIALS_FILE;
  }
  return path.join(os.homedir(), ".config", "orchyn-mcp", "credentials.json");
}

export type TransportMode = "stdio" | "http";

export function getTransportMode(): TransportMode {
  const raw = (process.env.ORCHYN_TRANSPORT || "").toLowerCase();
  if (raw === "http") return "http";
  return "stdio";
}
