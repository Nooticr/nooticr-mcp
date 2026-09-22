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

