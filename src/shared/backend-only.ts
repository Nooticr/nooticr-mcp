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
  overlay_bake: "Rendering stays in the dashboard: it takes storage keys a public caller has no way to produce (#92).",
  bake_job_status: "Rendering stays in the dashboard: it takes storage keys a public caller has no way to produce (#92).",
  compose_sequence: "Rendering stays in the dashboard: it takes storage keys a public caller has no way to produce (#92).",
  spawn_variants: "Rendering stays in the dashboard: it takes storage keys a public caller has no way to produce (#92).",
  enqueue_publish_job:
    "The public surface does not publish (#92, decided 2026-10-16): a post goes out when a person approves an AI employee's schedule_post action in the dashboard Inbox, or on its own if the customer turned on autopilot for publishing for that employee.",
  schedule_post:
    "The public surface does not publish (#92, decided 2026-10-16): AI employees propose it as an action, which a person approves in the dashboard Inbox unless the customer turned on autopilot for publishing for that employee.",
  get_batch_history:
    "History of the dashboard's compose batches, which only exist once rendering does; stays with #92.",
  get_latest_analysis:
    "Returns the dashboard's stored AI fleet-analysis verdict; the public surface sells the evidence, not a judgement of ours.",
  propose_listing_update:
    "Commerce writes (nooticr-server C1 3/4) stay in the dashboard until exposing store writes to hosts is a product decision.",
  apply_listing_update:
    "Commerce writes (nooticr-server C1 3/4) stay in the dashboard until exposing store writes to hosts is a product decision; applying a change edits the merchant's live store.",
  propose_price_change:
    "Commerce writes (nooticr-server C1 3/4) stay in the dashboard until exposing store writes to hosts is a product decision.",
  apply_price_change:
    "Commerce writes (nooticr-server C1 3/4) stay in the dashboard until exposing store writes to hosts is a product decision; applying a change edits the merchant's live prices.",
  brand_watch_history:
    "Not a deliberate exclusion: a candidate for the public surface once it has a trend view to draw. Listed so it reads as pending, not forgotten.",
  creative_allowance_status:
    "Reports an AI employee's remaining included work, keyed to the employee's run on the server (#333 BM5); employees reach it through the server's own /mcp. From a Claude or ChatGPT host there is no employee, so it could only answer that creative tools are paid in credits, which every creative tool's quote and creative_settings_get already say.",
  bank_list_accounts:
    "Bank feed (nooticr-server BK1) stays on the backend /mcp and the dashboard chat until exposing a merchant's bank accounts and transactions to Claude or ChatGPT hosts is a product decision.",
  bank_list_transactions:
    "Bank feed (nooticr-server BK1) stays on the backend /mcp and the dashboard chat until exposing a merchant's bank accounts and transactions to Claude or ChatGPT hosts is a product decision.",
  bank_balances:
    "Bank feed (nooticr-server BK1) stays on the backend /mcp and the dashboard chat until exposing a merchant's bank accounts and transactions to Claude or ChatGPT hosts is a product decision.",
  bank_sync_status:
    "Bank feed (nooticr-server BK1) stays on the backend /mcp and the dashboard chat until exposing a merchant's bank accounts and transactions to Claude or ChatGPT hosts is a product decision.",
};
