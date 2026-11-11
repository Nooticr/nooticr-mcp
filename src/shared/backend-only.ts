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
  publish_post_now:
    "The public surface does not publish (#92, decided 2026-10-16): it sends a post already approved in the dashboard out now instead of at its time. On the backend an owner asks their Social Media Manager for it in the dashboard chat (nooticr-server #1707); a Claude or ChatGPT host has no approval to stand on.",
  reschedule_post:
    "Moves a post already in the publishing schedule, which the public surface has no part in (#92, decided 2026-10-16: schedule_post and publishing stay with the dashboard and its approval queue). On the backend an owner asks their Social Media Manager for it in the dashboard chat (nooticr-server #1707).",
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
  shopify_draft_article:
    "Commerce writes stay in the dashboard (decided 2026-11-05, like the listing and price writes above): it creates an article in the merchant's own Shopify blog, which on the backend is the Web & Growth Analyst's draft, approved in the dashboard Inbox unless auto mode runs it. From a Claude or ChatGPT host there is no approval queue, so the call would write to the store at once; wordpress_draft_post is not public either.",
  brand_watch_history:
    "Not a deliberate exclusion: a candidate for the public surface once it has a trend view to draw. Listed so it reads as pending, not forgotten.",
  creative_slides:
    "Hands a slideshow to an Opus design session paid from an AI employee's cost ledger (nooticr-server #1765); the server refuses it outside an employee's work (not_in_employee_work), so from a Claude or ChatGPT host it could only refuse.",
  creative_video_design:
    "Hands a short video to an Opus design session paid from an AI employee's cost ledger, like creative_slides; the session asks for its voice-over and music through that employee's own tools. The server refuses it outside an employee's work (not_in_employee_work), so from a Claude or ChatGPT host it could only refuse.",
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
  care_lookup_order:
    "Employee-internal (nooticr-server E3b): it looks up the order a customer wrote about, and only inside a Customer Care employee's run tied to that support thread, which is what scopes a buyer's order details to the person asking. A Claude or ChatGPT host has no support thread, so there is nothing for it to look up against.",
  add_team_member:
    "The confirmed call adds a paid seat to a team and charges the workspace's card on the spot (Stripe's prorated amount due now). That is a purchase of a digital good made from the host, which the public surface does not offer (#100) and which, unlike hire_team, has no payment page to hand off to the dashboard; seats are added on the team's page.",
  sdr_draft_first_email:
    "Emails a first-party lead (someone the business met in person, a referral, an inbound request, an existing customer) in the business's name, one to one through agentmail, once a workspace owner or admin approves it in the dashboard's action queue, which shows who the lead is, how the business knows them, and the whole email; it is never on autopilot. A Claude or ChatGPT host has no approval to stand on, and the server keeps it out of the dashboard chat for the same reason (nooticr-server NOT_IN_CHAT).",
  change_member_level:
    "An upgrade's confirmed call charges the workspace's card on the spot for the difference, a purchase of a digital good made from the host, which the public surface does not offer (#100); levels are changed on the team's page.",
};
