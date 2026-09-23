/**
 * nooticr API keys — the credential for a caller with no browser.
 *
 * Everything else this package can authenticate with ends at a 15-minute JWT:
 * `login` writes one (plus a refresh token) to a credentials file, and the
 * OAuth flows mint one behind a consent screen. Both assume a machine someone
 * can sit at once. A partner's backend cannot run either, so it gets a key
 * instead: one string, set once, valid until it is revoked.
 *
 * The prefix is load-bearing in two places that must agree — this file and
 * nooticr-server's `routes::api_keys::API_KEY_PREFIX`. The server uses it to
 * decide whether a bearer token is a key at all (and therefore whether to look
 * in its database); this package uses it to decide whether a token can be
 * refreshed. A JWT is three base64url segments, so it can never collide.
 */

export const API_KEY_PREFIX = "nk_";

/** Whether a bearer token is a nooticr API key rather than a JWT. */
export function looksLikeApiKey(token: string | undefined | null): token is string {
  return typeof token === "string" && token.startsWith(API_KEY_PREFIX);
}

/**
 * A nooticr session forwarded by nooticr-server's own agent — the dashboard's
 * chat, calling these tools on behalf of the user who is signed in there.
 *
 * The chat used to call a second, Rust copy of 28 of these tools, so it had
 * none of the others and none of their guidance. It now calls this server,
 * and needs a way to say "as this user" that is not an OAuth grant (there is
 * no browser in the loop) and not an API key (the user never minted one).
 *
 * Shape: `nooticr-session.<conversation id or ->.<nooticr access token>`. The
 * token is the user's own, forwarded to the backend exactly as a key is, and
 * the backend checks it on every call. The conversation rides along so the
 * backend's run ledger files each call under the chat thread that made it,
 * rather than as an anonymous connector call. The prefix keeps it from ever
 * being read as an OAuth token this process issued, which a bare JWT would be.
 */
export const SESSION_TOKEN_PREFIX = "nooticr-session.";

export type ForwardedSession = { token: string; conversationId?: string };

/** The session inside a forwarded bearer, or undefined for anything else. */
export function forwardedSession(bearer: string | undefined | null): ForwardedSession | undefined {
  if (typeof bearer !== "string" || !bearer.startsWith(SESSION_TOKEN_PREFIX)) return undefined;
  const rest = bearer.slice(SESSION_TOKEN_PREFIX.length);
  const dot = rest.indexOf(".");
  if (dot < 0) return undefined;
  const conversation = rest.slice(0, dot);
  const token = rest.slice(dot + 1).trim();
  if (!token) return undefined;
  return /^[0-9a-f-]{36}$/i.test(conversation) ? { token, conversationId: conversation } : { token };
}

/** Headers that attribute a forwarded call to the chat thread that made it. */
export function forwardedHeaders(session: ForwardedSession): Record<string, string> {
  return {
    "x-nooticr-surface": "chat",
    ...(session.conversationId ? { "x-nooticr-conversation": session.conversationId } : {}),
  };
}
