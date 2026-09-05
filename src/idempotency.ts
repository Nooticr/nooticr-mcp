/**
 * The stdio package's billing key.
 *
 * Its own module rather than a function in `index.ts` because `index.ts` calls
 * `main()` at module scope: importing it to reach one pure function would
 * start the server, which is not something a test should have to do to check a
 * string.
 */
import { argumentsDigest } from "./shared/tools.js";

/**
 * The key the Worker has always sent, which the local package never did.
 *
 * `NooticrClient` documents "a retried tool call is billed once" and the
 * backend implements it — `mcp:<user>:<tool>:<key>` in mcp_tools.rs — but the
 * guarantee only ever reached the hosted connector. The stdio client was
 * constructed without a key, so no `idempotency-key` header was sent at all
 * and a local `npx @nooticr/mcp` user whose call was cut short mid-flight (a
 * dropped pipe, a client that gave up and re-sent) paid for it twice.
 *
 * Same shape as cloudflare/src/endpoint.ts, for the same two reasons: the
 * request id keeps a genuine second call distinct — two identical searches are
 * two searches and bill twice, deliberately — while the arguments digest stops
 * a client that restarts its ids from charging one call for another. There is
 * no session prefix and none is needed: the backend namespaces the reference
 * by user and tool before it ever compares keys, so two people can hold the
 * same string without meeting.
 */
export function stdioIdempotencyKey(ctx: {
  requestId?: string | number;
  arguments?: unknown;
}): string | undefined {
  if (ctx.requestId === undefined) return undefined;
  return `stdio:${String(ctx.requestId)}:${argumentsDigest(ctx.arguments)}`;
}
