/**
 * String helpers that run on text from outside: URLs a user pastes, the
 * Authorization header, configured base URLs.
 *
 * Both replace regexes CodeQL flagged as polynomial (js/polynomial-redos):
 * `/\/+$/` retries the whole run of slashes from every starting position when
 * the run is not at the end ("////////x"), and `^Bearer\s+(.+)$` lets `\s+`
 * and `.+` split a run of spaces every possible way before failing. A loop and
 * a prefix check do the same job in one pass.
 */

/** `s` without its trailing slashes ("https://a.b///" → "https://a.b"). */
export function trimTrailingSlashes(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 47 /* "/" */) end--;
  return s.slice(0, end);
}

/**
 * The token from an `Authorization: Bearer <token>` header, or undefined. The
 * scheme is case-insensitive (RFC 7235); an empty token is no token.
 */
export function bearerToken(header: string | null | undefined): string | undefined {
  if (!header || !/^bearer\s/i.test(header)) return undefined;
  const token = header.slice("bearer".length).trim();
  return token || undefined;
}
