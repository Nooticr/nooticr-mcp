/**
 * Asking before spending someone's credits.
 *
 * ## Which calls this is for
 *
 * Not all of them. Every tool advertises its price in its own description, so
 * for a fixed-price tool the model and the user already know what a call costs
 * before it is made — a confirmation there is a dialog that tells you what you
 * just read.
 *
 * The calls worth confirming are the ones whose price is *set by an argument*,
 * because nothing the caller read tells them the number. `search_mentions` is
 * the sharp case: it bills per network swept, so "monitor my brand" with no
 * `platforms` argument means all nine, which is 21 credits, and the user
 * authorised that without ever seeing it. `catch_up_watchlist` has the same
 * shape — per creator, and the watchlist length is not in the prompt.
 *
 * ## Why elicitation and not something else
 *
 * `elicitation/create` is the one client→user channel that is both live today
 * (Claude Code declares `elicitation: {}`; measured, not assumed) and not
 * deprecated. Sampling is deprecated and unimplemented, and MRTR — which will
 * eventually carry this exact request — is shipped in the Claude Code binary
 * but not switched on. When MRTR lands the SDK moves elicitation into it and
 * this code does not change.
 *
 * ## When the client cannot ask
 *
 * A client that never declared `elicitation` gets no prompt and the call runs.
 * Refusing to work for such a client would be worse than the problem: the tool
 * has always spent these credits, and the tool description says the price.
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

/** Mirrors `mcp_tool_cost_for` in crates/server/src/mcp_tools.rs. */
export const SEARCH_PLATFORMS = [
  "youtube",
  "tiktok",
  "instagram",
  "douyin",
  "xiaohongshu",
  "twitter",
  "bilibili",
  "reddit",
  "weibo",
] as const;

/** Two per network, except the one that costs an order of magnitude more upstream. */
export const CREDITS_PER_NETWORK = 2;
export const XIAOHONGSHU_CREDITS = 5;
/** Per creator checked, so the price is the length of the watchlist. */
export const CREDITS_PER_CREATOR = 2;

/**
 * The hard ceilings `search_spoken_mentions` cannot cross, whatever it is
 * asked for.
 *
 * Every other fan-out in this file prices something whose size is already
 * known once a cheap first call returns — the watchlist length, the post
 * count of a feed already fetched. A transcript search cannot do that: there
 * is no way to know how many of a niche's candidates actually say the term
 * without transcribing them, so the candidate count can never be the number
 * that sets the price. Left uncapped, a wide niche sweep could spend a hundred
 * credits transcribing to find three hits. These are the caps that make that
 * impossible regardless of what `maxTranscripts` or the handle list ask for —
 * clamp server-side, never trust the argument alone.
 */
export const MAX_SPOKEN_TRANSCRIPTS = 20;
/** get_user_posts calls a spoken-mention search will make, across explicit handles and the watchlist combined. */
export const MAX_SPOKEN_HANDLE_CALLS = 8;

/**
 * What each backend call costs, so a tool that fans out can price itself.
 *
 * The job tools in jobs.ts are compositions: `answer_my_audience` is one
 * `get_user_posts` plus a `get_post_comments` per post it opens, and nothing
 * else. Billing is therefore the sum of what it actually called, which is only
 * knowable if the per-call prices are written down somewhere. Mirrors
 * `mcp_tool_cost_for` in crates/server/src/mcp_tools.rs, same as the constants
 * above — a call missing from here prices as zero, which would understate a
 * confirmation rather than overstate it, so add to it when a tool grows a
 * new fetch.
 */
export const BACKEND_CALL_CREDITS: Record<string, number> = {
  get_social_media: 1,
  get_post_transcript: 1,
  get_user_posts: 2,
  get_post_comments: 2,
  discover_social_posts: 2,
  search_creators: 2,
  get_similar_creators: 2,
  discover_sounds: 2,
  discover_hashtags: 2,
  get_post_frames: 2,
};

/** What a run of backend calls costs, named one per call actually made. */
export function costOf(calls: string[]): number {
  return calls.reduce((total, name) => total + (BACKEND_CALL_CREDITS[name] ?? 0), 0);
}

/**
 * What a `search_mentions` call will cost.
 *
 * Omitting `platforms` means every network — which is the expensive default,
 * and the reason this function exists.
 */
export function searchMentionsCost(platforms?: string[]): number {
  const chosen =
    platforms && platforms.length > 0
      ? platforms
          .map((p) => String(p).toLowerCase())
          .filter((p) => (SEARCH_PLATFORMS as readonly string[]).includes(p))
      : [...SEARCH_PLATFORMS];
  if (chosen.length === 0) return CREDITS_PER_NETWORK;
  return chosen.reduce(
    (total, p) => total + (p === "xiaohongshu" ? XIAOHONGSHU_CREDITS : CREDITS_PER_NETWORK),
    0,
  );
}

/**
 * Above this, ask. Below it, the number is small enough that a prompt costs
 * the user more attention than the credits are worth.
 *
 * Six is deliberate: a three-network sweep (6) passes silently, a four-network
 * one (8) does not, and the all-networks default (21) never does.
 */
export const CONFIRM_ABOVE_CREDITS = 6;

export interface SpendDecision {
  proceed: boolean;
  /** Set when the user said no, for the message the caller returns. */
  declined?: "decline" | "cancel";
}

/** A client that never declared elicitation must not be sent one. */
function canAsk(server: Server): boolean {
  const caps = server.getClientCapabilities();
  return Boolean(caps && "elicitation" in caps && caps.elicitation);
}

/**
 * Ask before spending. Returns whether to go ahead.
 *
 * Anything unexpected — a client that declared elicitation and then threw, a
 * transport that dropped — proceeds. The failure mode of a broken confirmation
 * should be the behaviour we had before it existed, not a tool that stopped
 * working.
 */
export async function confirmSpend(
  server: Server,
  opts: { credits: number; summary: string; cheaper?: string },
): Promise<SpendDecision> {
  if (opts.credits <= CONFIRM_ABOVE_CREDITS) return { proceed: true };
  if (!canAsk(server)) return { proceed: true };

  const lines = [`${opts.summary} This costs ${opts.credits} nooticr credits.`];
  if (opts.cheaper) lines.push(opts.cheaper);

  let result: { action: string };
  try {
    result = (await server.elicitInput({
      mode: "form",
      message: lines.join(" "),
      requestedSchema: {
        type: "object",
        properties: {
          proceed: {
            type: "boolean",
            title: `Spend ${opts.credits} credits`,
            description: "Run the search now.",
          },
        },
        required: ["proceed"],
      },
    })) as { action: string; content?: { proceed?: unknown } };
    // "accept" with proceed:false is a user who read the form and said no; it
    // is not the same as dismissing the dialog, but it is still a no.
    const accepted =
      result.action === "accept" &&
      (result as { content?: { proceed?: unknown } }).content?.proceed !== false;
    if (accepted) return { proceed: true };
    return { proceed: false, declined: result.action === "decline" ? "decline" : "cancel" };
  } catch {
    return { proceed: true };
  }
}

/**
 * What the caller returns when the user said no. Not an error — a choice.
 *
 * `cheaper` is the way out. It defaults to the platforms argument because
 * `search_mentions` was the first caller and that is its lever, but a tool
 * that fans out over posts rather than networks has a different one, and
 * telling a user to narrow a "platforms" argument the tool does not have is
 * worse than saying nothing.
 */
export function declinedResult(credits: number, what: string, cheaper?: string) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          `Cancelled — no credits were spent. ${what} would have cost ${credits} credits. ` +
          (cheaper ?? `Narrow it with the "platforms" argument to spend less.`),
      },
    ],
    structuredContent: { cancelled: true, wouldHaveCost: credits },
  };
}
