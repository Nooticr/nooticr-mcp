/**
 * nooticr-server tools this public surface deliberately does not register.
 *
 * `POST /mcp` also serves the dashboard's internal copilot, so it carries
 * tools that have no business in a Claude or ChatGPT host. Absence alone
 * reads the same as "nobody got round to it", so each exclusion is written
 * down with its reason (#106). A tool leaving this list for `TOOL_NAMES` is a
 * product decision, not a cleanup; tests/backend-only.test.ts keeps the two
 * lists disjoint.
 */
export const BACKEND_ONLY_TOOLS: Readonly<Record<string, string>> = {
  get_watchlist_baseline:
    "Plumbing for BackendWatchStore, which reads a creator's baseline itself; a host has nothing to do with the raw row.",
  advance_watchlist_baseline:
    "Plumbing for BackendWatchStore; catch_up_watchlist advances the baseline after the user confirms, so a host never needs to.",
  buy_nooticr_credits:
    "No purchase path is exposed to a model (#100). Credits are topped up on the nooticr website.",
  overlay_bake: "Rendering and publishing stay in the dashboard (#92).",
  bake_job_status: "Rendering and publishing stay in the dashboard (#92).",
  compose_sequence: "Rendering and publishing stay in the dashboard (#92).",
  spawn_variants: "Rendering and publishing stay in the dashboard (#92).",
  enqueue_publish_job: "Rendering and publishing stay in the dashboard (#92).",
  schedule_post: "Rendering and publishing stay in the dashboard (#92).",
  get_batch_history:
    "History of the dashboard's compose batches, which only exist once rendering does; stays with #92.",
  get_latest_analysis:
    "Returns the dashboard's stored AI fleet-analysis verdict; the public surface sells the evidence, not a judgement of ours.",
  brand_watch_history:
    "Not a deliberate exclusion: a candidate for the public surface once it has a trend view to draw. Listed so it reads as pending, not forgotten.",
};
