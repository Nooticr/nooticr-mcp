// Arguments good enough to make every tool actually run against the fixture
// backend, so the chain map reads REAL guidance text rather than guessing at
// it from the source.
//
// Two layers, on purpose. The synthesiser covers the ~40 tools whose inputs
// are a url/handle/keyword and nothing else, and keeps working when someone
// adds another one of those. The overrides below are for the shapes no
// synthesiser can invent: the show_* tools take the calling model's own
// writing, so their arguments are a small piece of plausible authored
// content, not a placeholder.

// The URL quests and probes use.
//
// Not nooticr-server's own `https://e2e.nooticr.test/import/tiktok/e2e-stub`
// convention, deliberately: a real model reads that hostname, correctly
// concludes it has been handed test scaffolding, tells the user so and
// stops — which shows up in a chaining report as a broken chain even though
// the guidance was never reached. The fixture backend answers any
// post-shaped URL (see scripts/fixture-server.mjs), so quests use one that
// reads like a post. The stub URL is still what the mechanical smoke tiers
// (scripts/mcp-smoke-client.mjs) use, and still works.
export const STUB_URL = "https://www.tiktok.com/@lena.mornings/video/7318842211";

/** Hand-written arguments where a synthesised value would be rejected or meaningless. */
export const ARG_OVERRIDES = {
  show_analysis: {
    url: STUB_URL,
    analysis: {
      summary: "A close-up open, a product beat at 2s, and a caption-card CTA at the end.",
      hookStrength: 7,
      scriptStructure: { hook: "close-up on a face", buildUp: "product on a table", payoff: "caption card", cta: "link in bio" },
      keyQuotes: ["This is a fixture transcript for testing."],
      suggestedHashtags: ["#fixture"],
      targetAudience: "people testing MCP harnesses",
    },
  },
  show_comparison: {
    posts: [
      { platform: "tiktok", caption: "Fixture post 1", externalUrl: STUB_URL, views: 1000 },
      { platform: "tiktok", caption: "Fixture post 2", externalUrl: STUB_URL, views: 2000 },
    ],
    winner: 1,
    winnerReason: "Twice the views on the same hook shape.",
    differences: [{ factor: "hook", detail: "Post 2 opens on motion, post 1 on a static frame." }],
    lessons: ["Open on movement."],
    nextTest: "Re-shoot post 1's opener with a moving subject.",
  },
  show_hooks: {
    url: STUB_URL,
    hooks: [
      { hook: "You are testing this wrong.", device: "accusation", stops: "anyone who just wrote a test" },
      { hook: "Three frames is all it takes.", device: "number", stops: "skimmers" },
    ],
  },
  show_variants: {
    sourceUrl: STUB_URL,
    variants: [
      { angle: "contrarian", caption: "Everyone samples evenly. That is the bug." },
      { angle: "practical", caption: "Here is the three-frame version." },
    ],
  },
  show_repurposed_post: {
    sourceUrl: STUB_URL,
    versions: [
      { surface: "linkedin", body: "A short note on why fixtures derail agents." },
      { surface: "x", body: "Fixtures that look broken make models bail." },
    ],
  },
  show_comment_review: {
    url: STUB_URL,
    comments: [
      { id: "comment:1:1", text: "this stopped working for me after a week", kind: "bug report", reply: "Sorry — which version?" },
    ],
    summary: "One bug report, no praise worth answering.",
  },
  show_audience_replies: {
    username: "fixture_creator_1",
    replies: [{ id: "comment:1:1", question: "does this work on android?", reply: "Yes, since 1.2." }],
    summary: "One answerable question.",
  },
  show_collab_shortlist: {
    niche: "morning routines",
    candidates: [
      { platform: "tiktok", username: "fixture_creator_1", why: "Same audience, half the followers.", followers: 10000 },
    ],
    recommended: "fixture_creator_1",
  },
  prepare_handoff: {
    items: [
      { id: "comment:1:1", text: "this stopped working for me after a week", kind: "bug report", permalink: STUB_URL },
    ],
  },
  compare_posts: { urls: [STUB_URL, STUB_URL] },
  score_draft: { draft: "Three frames is all it takes. Link in bio." },
  repurpose_post: { url: STUB_URL, targets: ["linkedin", "x"] },
  create_product: { name: "Quest Fixture Product", slug: "quest-fixture-product" },
  connect_social_account: { platform: "tiktok" },
  analyze_product_status: { jobId: "00000000-0000-0000-0000-000000000000" },
  create_brand_watch: { kind: "term", term: "nooticr", cadence: "daily" },
  draft_post: { topic: "morning routines" },
};

const NAME_HINTS = [
  [/^url$|^sourceUrl$|^permalink$/i, () => STUB_URL],
  [/^urls$/i, () => [STUB_URL]],
  [/^username$|^handle$/i, () => "fixture_creator_1"],
  [/^keyword$|^term$|^niche$|^topic$|^query$/i, () => "morning routines"],
  [/^platform$/i, () => "tiktok"],
  [/^platforms$/i, () => ["tiktok"]],
  [/^limit$|^count$|^pageSize$|^candidateLimit$|^maxTranscripts$|^commentsPerPost$|^supplyLimit$/i, () => 2],
  [/^draft$|^caption$|^body$|^text$/i, () => "A fixture draft, written for the harness."],
  [/^slug$/i, () => "quest-fixture"],
  [/^name$|^title$/i, () => "Quest Fixture"],
];

function synthesise(name, schema) {
  const type = Array.isArray(schema?.type) ? schema.type[0] : schema?.type;
  for (const [re, make] of NAME_HINTS) if (re.test(name)) return make();
  if (schema?.enum?.length) return schema.enum[0];
  switch (type) {
    case "string": return "fixture";
    case "number": case "integer": return 1;
    case "boolean": return false;
    case "array": return [];
    case "object": return {};
    default: return "fixture";
  }
}

/**
 * Arguments to probe one tool with. Required fields only: an optional
 * argument left out is the shape a host most often sends, and several
 * guidance builders branch on absence.
 */
export function argsFor(tool) {
  if (ARG_OVERRIDES[tool.name]) return ARG_OVERRIDES[tool.name];
  const schema = tool.inputSchema ?? {};
  const required = schema.required ?? [];
  const props = schema.properties ?? {};
  const args = {};
  for (const key of required) args[key] = synthesise(key, props[key]);
  return args;
}
