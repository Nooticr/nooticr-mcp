/**
 * OAuth Client ID Metadata Documents.
 *
 * ## Why
 *
 * Dynamic Client Registration is deprecated (MCP `2026-07-28`, PR #2858),
 * with CIMD as the named migration. We advertised `registration_endpoint` and
 * not `client_id_metadata_document_supported`, so every connector fell through
 * the client priority order onto the deprecated path.
 *
 * The deprecation is the reason to do this, but not the reason it is worth
 * doing. Under DCR we accepted any `client_id` string paired with any https
 * `redirect_uri` — nothing tied the two together, so the redirect was checked
 * for shape and never for ownership. With CIMD the `client_id` *is* an https
 * URL we fetch, and the redirect has to appear in the document it serves. The
 * client proves the redirect is theirs. It also removes state: there is no
 * registration to store, so nothing to keep in KV and nothing to expire.
 *
 * ## Fetching a URL an attacker controls
 *
 * `client_id` arrives in a query string, and this module turns it into an
 * outbound request. That is server-side request forgery unless it is fenced,
 * so: https only, no credentials, no redirects followed, a hard timeout, a
 * size cap, and a refusal to resolve anything that looks internal. The
 * document's own `redirect_uris` may perfectly well be loopback — that is what
 * a native client uses — and they are never fetched, only compared.
 */

/** The fields the spec requires a metadata document to carry. */
export interface ClientMetadata {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  client_uri?: string;
  logo_uri?: string;
  [key: string]: unknown;
}

export type CimdResult =
  | { ok: true; metadata: ClientMetadata }
  | { ok: false; error: "invalid_client" | "invalid_request"; description: string };

/** Documents are small; anything larger is not one. */
const MAX_DOC_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 5_000;
/** Floor and ceiling on how long a fetched document is reused. */
const MIN_CACHE_MS = 60_000;
const MAX_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * Is this `client_id` a metadata document URL rather than an opaque string?
 *
 * Per the spec the URL "MUST use the https scheme and contain a path
 * component" — so a bare origin is not one, which conveniently means an
 * existing DCR-issued id can never be mistaken for a URL.
 */
export function isClientIdMetadataUrl(clientId: string): boolean {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.pathname.length > 1;
}

/**
 * Hosts we refuse to fetch a metadata document from.
 *
 * A hostname check cannot see where DNS will actually point, so this is a
 * first line rather than the only one — it stops the obvious `client_id=
 * https://127.0.0.1/x` and `https://[::1]/x` and the cloud metadata endpoint,
 * which is the case that turns SSRF into credential theft.
 */
function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  // Link-local, including the 169.254.169.254 metadata service.
  if (h.startsWith("169.254.")) return true;
  // IPv6 unique-local and link-local.
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** How long the response says it may be reused, clamped to something sane. */
function cacheMsFrom(headers: Headers): number {
  const cc = headers.get("cache-control") ?? "";
  if (/no-store|no-cache/i.test(cc)) return MIN_CACHE_MS;
  const maxAge = cc.match(/max-age\s*=\s*(\d+)/i);
  if (!maxAge) return MIN_CACHE_MS;
  const ms = Number(maxAge[1]) * 1000;
  return Math.min(Math.max(ms, MIN_CACHE_MS), MAX_CACHE_MS);
}

/**
 * Documents are fetched on the authorize path, which a user is waiting on, and
 * a client's document is the same for every user. The spec asks caches to
 * respect the response's own headers, so that is what bounds an entry.
 */
const cache = new Map<string, { at: number; ttl: number; metadata: ClientMetadata }>();

/** Test seam — a shared cache across tests would make them order-dependent. */
export function clearClientMetadataCache(): void {
  cache.clear();
}

function validateShape(clientId: string, body: unknown): CimdResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_client", description: "Client metadata is not a JSON object." };
  }
  const doc = body as Record<string, unknown>;
  // "Clients MUST ensure the client_id value in the metadata matches the
  // document URL exactly." Without this, anyone who can host JSON anywhere can
  // claim to be any client.
  if (doc.client_id !== clientId) {
    return {
      ok: false,
      error: "invalid_client",
      description: "The client_id in the metadata document does not match its URL.",
    };
  }
  if (typeof doc.client_name !== "string" || !doc.client_name.trim()) {
    return { ok: false, error: "invalid_client", description: "Client metadata has no client_name." };
  }
  const uris = doc.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || !uris.every((u) => typeof u === "string")) {
    return { ok: false, error: "invalid_client", description: "Client metadata has no redirect_uris." };
  }
  return { ok: true, metadata: doc as unknown as ClientMetadata };
}

/**
 * Resolve a `client_id` URL to its metadata document.
 *
 * `fetchImpl` is injected so tests never touch the network, and so the Worker
 * can pass its own fetch.
 */
export async function fetchClientMetadata(
  clientId: string,
  fetchImpl: typeof fetch = fetch
): Promise<CimdResult> {
  if (!isClientIdMetadataUrl(clientId)) {
    return {
      ok: false,
      error: "invalid_request",
      description: "client_id must be an https URL with a path component.",
    };
  }
  const url = new URL(clientId);
  if (isInternalHost(url.hostname)) {
    return { ok: false, error: "invalid_request", description: "client_id host is not routable." };
  }

  const hit = cache.get(clientId);
  if (hit && Date.now() - hit.at < hit.ttl) return { ok: true, metadata: hit.metadata };

  let res: Response;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    res = await fetchImpl(clientId, {
      // A redirect could land somewhere the host check already rejected, so it
      // is refused rather than followed.
      redirect: "error",
      headers: { accept: "application/json" },
      signal: abort.signal,
    });
  } catch {
    return {
      ok: false,
      error: "invalid_client",
      description: "Could not fetch the client metadata document.",
    };
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    return {
      ok: false,
      error: "invalid_client",
      description: `Client metadata document returned ${res.status}.`,
    };
  }
  const text = await res.text();
  if (text.length > MAX_DOC_BYTES) {
    return { ok: false, error: "invalid_client", description: "Client metadata document is too large." };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_client", description: "Client metadata document is not valid JSON." };
  }
  const checked = validateShape(clientId, body);
  if (checked.ok) {
    cache.set(clientId, { at: Date.now(), ttl: cacheMsFrom(res.headers), metadata: checked.metadata });
  }
  return checked;
}

/**
 * The whole check an authorize handler needs: resolve the document and confirm
 * the redirect belongs to it.
 *
 * Exact string comparison, deliberately. Loosening this to a prefix or an
 * origin match is the classic redirect_uri bypass, and the spec says
 * authorization servers "MUST validate redirect URIs presented in an
 * authorization request against those in the metadata document".
 */
export async function verifyClientIdMetadata(
  clientId: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch
): Promise<CimdResult> {
  const doc = await fetchClientMetadata(clientId, fetchImpl);
  if (!doc.ok) return doc;
  if (!doc.metadata.redirect_uris.includes(redirectUri)) {
    return {
      ok: false,
      error: "invalid_request",
      description: "redirect_uri is not listed in the client metadata document.",
    };
  }
  return doc;
}
