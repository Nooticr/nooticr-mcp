#!/usr/bin/env node
// A stand-in for nooticr-server, implementing only the handful of endpoints
// scripts/e2e-server-lib.sh and this repo's own NooticrClient actually touch
// during the E2E harness's boot/login/tool-call sequence: GET /health,
// POST /auth/dev-login, POST /graphql (createWorkspace/createApp only), and
// POST /mcp (tools/call for the tools scripts/mcp-smoke-client.mjs and
// tests/e2e/agentic-visual.e2e.ts exercise). Pure Node, no native deps, no
// network calls of its own.
//
// What this is for: nooticr-server needs a real Rust/Postgres/FFmpeg/ONNX
// toolchain to build — not available in every environment (this one
// included: ort-sys's prebuilt-binary fetch is blocked by this session's
// network egress policy) — so there was previously no way to exercise
// scripts/run-mechanical-e2e-smoke.sh's actual MCP-protocol plumbing
// (does dist/index.js spawn, connect, and round-trip a real tools/call)
// without a full nooticr-server build. This fixture makes that path
// buildable and runnable anywhere Node runs, no Rust required.
//
// What this is NOT for: it proves nothing about nooticr-server's real
// behavior — no workspace-authz enforcement, no real credit ledger, no real
// social-post fetching. Run scripts/run-mechanical-e2e-smoke.sh (default
// mode) or scripts/run-quests.sh with NOOTICR_E2E_BACKEND=real against a
// real nooticr-server before trusting a change to either repo's
// backend-facing logic; this fixture only earns confidence in the harness
// scripts and this repo's own MCP-protocol wiring, not in nooticr-server.
//
// Usage: node scripts/fixture-server.mjs [port]  (default 8080)

import http from "node:http";
import { randomUUID } from "node:crypto";
import zlib from "node:zlib";

const PORT = Number(process.argv[2] || 8080);
const STUB_URL = "https://e2e.nooticr.test/import/tiktok/e2e-stub";

// One post's worth of plausible content, shared by every case that returns a
// post, a caption or a transcript.
//
// It reads like a real post on purpose, and that is a testing decision rather
// than set dressing. The quest suite puts a real model in front of these
// results and asks whether it follows the guidance to the next tool. A model
// handed a caption that says "not real content" and a transcript that says
// "this is a fixture" does the right thing — it tells the user it is looking
// at test scaffolding and stops — and the chaining report then shows a broken
// chain that says nothing about the guidance. Plausible content is what keeps
// the measurement about the server. It is still obviously not a real post to
// anyone reading the code: the handle, the numbers and the URL are invented.
// Captions for the multi-post cases. Three, so a set of posts has a spread to
// reason about rather than one caption repeated with the index changed —
// several tools (track_creator, find_hook_pattern) exist to compare posts
// against each other, and cannot be exercised by posts that differ only by a
// number.
const POST_CAPTIONS = [
  "the 6am routine that actually stuck (after 3 that didn't)",
  "I stopped setting 4 alarms and slept better immediately",
  "3 things I quit before I found the one that worked",
];

const FIXTURE_POST = {
  creatorHandle: "lena.mornings",
  caption: "the 6am routine that actually stuck (after 3 that didn't) #morningroutine #5amclub",
  transcript:
    "I tried the 5am thing for two years and hated every second of it. What finally worked was " +
    "moving one thing — the coffee — to the night before. I set it up at ten, and in the morning " +
    "there is one less decision between me and being awake. That is the whole trick. You are not " +
    "lazy, you are just deciding too much before you have had anything to drink. Try one thing " +
    "tonight and tell me how it goes.",
};

// The marketplace fixture: a real-shaped Amazon category, three listings deep.
//
// Same reasoning as FIXTURE_POST above — a model asked to read purchase
// drivers out of reviews that say "review one, review two" reports that it is
// looking at scaffolding, and the chaining measurement then says nothing about
// the guidance. These are invented brands' worth of plausible review text, in
// the exact shape `amazon_scrap_rs` returns (snake_case, `review_aspects`,
// `rating_histogram`), so the normaliser in src/shared/amazon.ts is exercised
// rather than bypassed.
const FIXTURE_AMAZON_PRODUCTS = [
  {
    "asin": "B07VJ5KFXZ",
    "url": "https://www.amazon.com/dp/B07VJ5KFXZ",
    "domain": "www.amazon.com",
    "title": "NutriRise Ashwagandha 1300mg with Black Pepper \u2014 Organic KSM-66 Root Extract, 120 Veggie Capsules",
    "brand": "NutriRise",
    "price": "$21.95",
    "price_value": 21.95,
    "currency": "$",
    "list_price": "$29.95",
    "availability": "In Stock",
    "rating": 4.5,
    "rating_count": 48213,
    "image": null,
    "images": [],
    "features": [
      "1300mg organic ashwagandha root per serving with 10mg organic black pepper for absorption",
      "USDA Organic, non-GMO, vegan, gluten free \u2014 third-party tested"
    ],
    "categories": [
      "Health & Household",
      "Vitamins & Dietary Supplements",
      "Herbal Supplements",
      "Ashwagandha"
    ],
    "specs": {
      "Brand": "NutriRise",
      "Item Form": "Capsule",
      "Unit Count": "120 Count",
      "Primary Supplement Type": "Ashwagandha",
      "Diet Type": "Vegan"
    },
    "rating_histogram": {
      "1": "4%",
      "2": "3%",
      "3": "7%",
      "4": "13%",
      "5": "73%"
    },
    "reviews": [
      {
        "author": "Danielle R.",
        "rating": 5.0,
        "title": "The 3am wake-ups stopped",
        "body": "I was waking up at 3am every night with my brain already running. Two weeks on this and that stopped. I am not claiming it is magic \u2014 I still get stressed \u2014 but I fall back asleep instead of lying there doing math about work. Started with one capsule at night because two made me groggy the first morning.",
        "date": "August 2, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Marcus T.",
        "rating": 5.0,
        "title": "Cheaper than the one my naturopath sells and it is the same KSM-66",
        "body": "Paid $60 for a bottle of 60 from a clinic. This is 120 for twenty-two dollars and the label says the same standardised extract. Been through three bottles.",
        "date": "July 19, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "K. Whitfield",
        "rating": 4.0,
        "title": "Works, but these capsules are horse pills",
        "body": "No complaints about the effect \u2014 steadier through the afternoon, less of the wired feeling after meetings. But the capsules are genuinely large and I have to take them one at a time with a full glass of water. My mother gave up on them for that reason alone.",
        "date": "July 3, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Angela",
        "rating": 2.0,
        "title": "Upset stomach every time",
        "body": "Wanted this to work. Every time I take it on an empty stomach I get about an hour of nausea. With food it is better but then I forget to take it. Returned the second bottle.",
        "date": "June 22, 2026",
        "verified": true,
        "source": "pdp"
      }
    ],
    "reviews_gated": false,
    "review_summary": "Customers find this ashwagandha helps with stress and sleep, with many noticing a calmer baseline within two weeks. They appreciate the organic certification and the value at two capsules a day. Some mention the capsules are large and a few report stomach upset when taken without food.",
    "review_aspects": [
      {
        "name": "Stress relief",
        "mentions": 1840,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Sleep quality",
        "mentions": 1122,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Value for money",
        "mentions": 903,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Capsule size",
        "mentions": 411,
        "sentiment": "negative",
        "summary": null
      },
      {
        "name": "Stomach comfort",
        "mentions": 288,
        "sentiment": "mixed",
        "summary": null
      },
      {
        "name": "Taste",
        "mentions": 176,
        "sentiment": "mixed",
        "summary": null
      }
    ],
    "fetched_at": "2026-09-11T09:12:44Z",
    "fetch_meta": {
      "attempts": 1,
      "profile": "Chrome144",
      "url_form": "https://www.amazon.com/dp/B07VJ5KFXZ",
      "status": 200,
      "bytes": 1482003,
      "elapsed_ms": 8140,
      "attempt_log": []
    }
  },
  {
    "asin": "B0C4KNW2T1",
    "url": "https://www.amazon.com/dp/B0C4KNW2T1",
    "domain": "www.amazon.com",
    "title": "Goli Ashwagandha & Vitamin D Gummies \u2014 KSM-66, Mixed Berry, 60 Count",
    "brand": "Goli",
    "price": "$18.98",
    "price_value": 18.98,
    "currency": "$",
    "list_price": "$21.99",
    "availability": "In Stock",
    "rating": 4.3,
    "rating_count": 31544,
    "image": null,
    "images": [],
    "features": [
      "300mg KSM-66 ashwagandha root extract plus vitamin D per 2-gummy serving",
      "Vegan, gluten free, no gelatin \u2014 mixed berry flavour"
    ],
    "categories": [
      "Health & Household",
      "Vitamins & Dietary Supplements",
      "Herbal Supplements",
      "Ashwagandha"
    ],
    "specs": {
      "Brand": "Goli",
      "Item Form": "Gummy",
      "Unit Count": "60 Count",
      "Flavor": "Mixed Berry",
      "Diet Type": "Vegan"
    },
    "rating_histogram": {
      "1": "6%",
      "2": "4%",
      "3": "9%",
      "4": "16%",
      "5": "65%"
    },
    "reviews": [
      {
        "author": "Sam",
        "rating": 5.0,
        "title": "The only supplement I have ever finished a bottle of",
        "body": "I have a graveyard of half-full capsule bottles. These taste like a berry chew so I actually take them. Six weeks in and the low-grade hum of anxiety I carry around is quieter. That is worth more to me than a higher dose I would not take.",
        "date": "August 9, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "R. Okafor",
        "rating": 2.0,
        "title": "300mg is a third of what the studies used",
        "body": "Taste is great, marketing is great, but the trials everyone cites use 600mg of KSM-66. You would need four gummies and then you are eating a lot of sugar and paying twice as much per month as capsules. Do the maths before you buy.",
        "date": "July 28, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Jenna M.",
        "rating": 5.0,
        "title": "Husband actually takes these",
        "body": "He will not swallow a pill. Will eat a gummy. That is the whole review. He says he is less snappy after work and I agree.",
        "date": "July 14, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Curtis",
        "rating": 1.0,
        "title": "Arrived as one solid brick",
        "body": "Shipped in July, sat in a hot truck, arrived fused into a single lump I had to cut with a knife. Second bottle same thing. Amazon refunded but I am not ordering gummies in summer again.",
        "date": "July 6, 2026",
        "verified": true,
        "source": "pdp"
      }
    ],
    "reviews_gated": false,
    "review_summary": "Customers like the taste and say gummies are far easier to keep taking than capsules. Many report feeling calmer and sleeping better. Some find the dose low compared with capsules and several mention the gummies arriving melted together in warm weather.",
    "review_aspects": [
      {
        "name": "Taste",
        "mentions": 2210,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Ease of use",
        "mentions": 1408,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Stress relief",
        "mentions": 1190,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Dosage strength",
        "mentions": 640,
        "sentiment": "negative",
        "summary": null
      },
      {
        "name": "Packaging",
        "mentions": 520,
        "sentiment": "negative",
        "summary": null
      },
      {
        "name": "Value for money",
        "mentions": 486,
        "sentiment": "mixed",
        "summary": null
      }
    ],
    "fetched_at": "2026-09-11T09:12:44Z",
    "fetch_meta": {
      "attempts": 1,
      "profile": "Chrome144",
      "url_form": "https://www.amazon.com/dp/B0C4KNW2T1",
      "status": 200,
      "bytes": 1482003,
      "elapsed_ms": 8140,
      "attempt_log": []
    }
  },
  {
    "asin": "B0BN4VQ7HG",
    "url": "https://www.amazon.com/dp/B0BN4VQ7HG",
    "domain": "www.amazon.com",
    "title": "Double Wood Supplements Ashwagandha KSM-66 600mg, 150 Capsules",
    "brand": "Double Wood",
    "price": "$19.95",
    "price_value": 19.95,
    "currency": "$",
    "list_price": "$24.95",
    "availability": "In Stock",
    "rating": 4.6,
    "rating_count": 12750,
    "image": null,
    "images": [],
    "features": [
      "600mg KSM-66 per capsule \u2014 the dose used in most published trials",
      "150 capsules, a 5-month supply at one per day"
    ],
    "categories": [
      "Health & Household",
      "Vitamins & Dietary Supplements",
      "Herbal Supplements",
      "Ashwagandha"
    ],
    "specs": {
      "Brand": "Double Wood",
      "Item Form": "Capsule",
      "Unit Count": "150 Count",
      "Primary Supplement Type": "Ashwagandha"
    },
    "rating_histogram": {
      "1": "3%",
      "2": "2%",
      "3": "6%",
      "4": "14%",
      "5": "75%"
    },
    "reviews": [
      {
        "author": "Owen H.",
        "rating": 5.0,
        "title": "600mg KSM-66, one capsule, 13 cents a day",
        "body": "Every study I could find used 600mg of KSM-66. This gives exactly that in one capsule and the bottle lasts five months. The 1300mg 'proprietary blend' bottles are marketing at twice the price per effective milligram.",
        "date": "August 7, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Carmen",
        "rating": 4.0,
        "title": "Extremely vivid dreams",
        "body": "Not bad dreams, just extremely detailed ones, every night since I started. Sleep itself is deeper. Mentioning it because nothing on the label warns you.",
        "date": "July 24, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Ty",
        "rating": 5.0,
        "title": "Replaced a $45 bottle with this",
        "body": "Same active ingredient at the same dose. The expensive one had a nicer label.",
        "date": "July 9, 2026",
        "verified": true,
        "source": "pdp"
      },
      {
        "author": "Renee W.",
        "rating": 3.0,
        "title": "Worked for six weeks then plateaued",
        "body": "Great first six weeks. Then it felt like nothing again. Took two weeks off and it came back. Wish the industry would just say whether you are supposed to cycle it.",
        "date": "June 20, 2026",
        "verified": true,
        "source": "pdp"
      }
    ],
    "reviews_gated": false,
    "review_summary": "Customers highlight the dose matching clinical studies and the very low cost per day. Many mention it is a single capsule rather than two. Some report vivid dreams and a few say the effect faded after a couple of months.",
    "review_aspects": [
      {
        "name": "Value for money",
        "mentions": 1340,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Dosage strength",
        "mentions": 1120,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Sleep quality",
        "mentions": 690,
        "sentiment": "positive",
        "summary": null
      },
      {
        "name": "Vivid dreams",
        "mentions": 385,
        "sentiment": "mixed",
        "summary": null
      },
      {
        "name": "Effect over time",
        "mentions": 302,
        "sentiment": "mixed",
        "summary": null
      }
    ],
    "fetched_at": "2026-09-11T09:12:44Z",
    "fetch_meta": {
      "attempts": 1,
      "profile": "Chrome144",
      "url_form": "https://www.amazon.com/dp/B0BN4VQ7HG",
      "status": 200,
      "bytes": 1482003,
      "elapsed_ms": 8140,
      "attempt_log": []
    }
  }
];

/** The scan envelope the backend wraps those listings in. */
function fixtureAmazonScan(args, scanId) {
  const asked = Number(args?.limit) || FIXTURE_AMAZON_PRODUCTS.length;
  const products = FIXTURE_AMAZON_PRODUCTS.slice(0, Math.max(1, Math.min(asked, FIXTURE_AMAZON_PRODUCTS.length)));
  const reviews = products.reduce((n, p) => n + (p.reviews?.length ?? 0), 0);
  const aspects = new Map();
  for (const p of products) {
    for (const a of p.review_aspects ?? []) {
      const key = a.name.toLowerCase();
      const row = aspects.get(key) ?? {
        name: a.name, mentions: 0, brands: 0, brandNames: [],
        positiveBrands: 0, negativeBrands: 0, mixedBrands: 0,
      };
      row.mentions += a.mentions ?? 0;
      if (!row.brandNames.includes(p.brand)) { row.brandNames.push(p.brand); row.brands += 1; }
      if (a.sentiment === "positive") row.positiveBrands += 1;
      else if (a.sentiment === "negative") row.negativeBrands += 1;
      else row.mixedBrands += 1;
      aspects.set(key, row);
    }
  }
  const prices = products.map((p) => p.price_value).sort((a, b) => a - b);
  const ratings = products.map((p) => p.rating);
  const lowShare = (p) =>
    Math.round((parseFloat(p.rating_histogram["1"]) + parseFloat(p.rating_histogram["2"])) * 10) / 10;
  return {
    marketplace: "amazon",
    scanId,
    status: "done",
    complete: true,
    query: args?.query ?? null,
    domain: args?.domain ?? "www.amazon.com",
    progress: { done: products.length, total: products.length, message: `${products.length} listing(s)`, elapsedMs: 41230, fromCache: 0 },
    rollup: {
      products: products.length,
      brands: products.map((p) => p.brand).sort(),
      reviewsCollected: reviews,
      ratingsRepresented: products.reduce((n, p) => n + p.rating_count, 0),
      reviewsGatedProducts: 0,
      price: { min: prices[0], max: prices[prices.length - 1], median: prices[Math.floor(prices.length / 2)] },
      rating: {
        min: Math.min(...ratings),
        max: Math.max(...ratings),
        mean: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100,
      },
      negativeStarShareMean:
        Math.round((products.reduce((n, p) => n + lowShare(p), 0) / products.length) * 10) / 10,
      aspects: [...aspects.values()].sort((a, b) => b.mentions - a.mentions),
      perProduct: products.map((p) => ({
        asin: p.asin, brand: p.brand, title: p.title, price: p.price, priceValue: p.price_value,
        rating: p.rating, ratingCount: p.rating_count, reviewsCollected: p.reviews?.length ?? 0,
        negativeStarShare: lowShare(p), reviewsGated: false,
      })),
      productsScanned: products.length,
    },
    products,
    errors: [],
    billable: true,
  };
}

/** @type {Map<string, { workspaceId?: string }>} */
const tokens = new Map();
/** @type {Map<string, { apps: Array<{ id: string; name: string }> }>} */
const workspaces = new Map();
let nextAppId = 1;

// A real, decodable PNG with something actually in it.
//
// This used to be a 1x1 transparent pixel, which is a valid PNG and was
// fine for the mechanical smoke tests: they check that a frame round-trips,
// not what is in it. It stopped being fine the moment a real model was put
// in front of these frames. A 1x1 image comes back from the API as
// unprocessable, and the model reads three unprocessable frames as "this
// post is broken or stub content" and abandons the rest of the job — which
// is a verdict about the fixture, arriving in the middle of a test about
// whether the server's guidance chains. A fixture that changes the
// behaviour under test is measuring itself.
//
// So each frame is a small, distinct, describable image: a vertical
// gradient that darkens frame by frame, with a solid block that moves
// across it. Enough for a model to say something true and specific about
// what it saw, and different enough between frames that "describe the
// motion" has an honest answer. Pure zlib, no image library.
function fixtureFramePng(index, total) {
  const W = 96;
  const H = 72;
  const shift = total <= 1 ? 0 : index / (total - 1);
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let o = 0;
  for (let y = 0; y < H; y += 1) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < W; x += 1) {
      const base = Math.round(230 - (y / H) * 120 - index * 40);
      const inBlock = x > shift * (W - 28) && x < shift * (W - 28) + 28 && y > H * 0.35 && y < H * 0.75;
      raw[o++] = inBlock ? 240 : Math.max(0, base);
      raw[o++] = inBlock ? 80 : Math.max(0, base - 10);
      raw[o++] = inBlock ? 60 : Math.max(0, base + 15);
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([len, typed, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

function bearerToken(req) {
  const header = req.headers.authorization;
  const match = header && /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : undefined;
}

function handleGraphql(body) {
  const query = String(body.query ?? "");
  const variables = body.variables ?? {};
  if (query.includes("createWorkspace")) {
    const id = randomUUID();
    workspaces.set(id, { apps: [] });
    return { data: { createWorkspace: { id } } };
  }
  if (query.includes("createApp")) {
    const ws = workspaces.get(variables.workspaceId);
    if (!ws) return { errors: [{ message: `no such workspace: ${variables.workspaceId}` }] };
    const id = String(nextAppId++);
    ws.apps.push({ id, name: variables.name });
    return { data: { createApp: { id } } };
  }
  return { errors: [{ message: `fixture-server: unhandled GraphQL query: ${query.slice(0, 80)}` }] };
}

function handleMcpCall(name, args, workspaceId) {
  switch (name) {
    case "check_nooticr_credits":
      return {
        content: [{ type: "text", text: "You have 20 nooticr credits remaining (fixture)." }],
        structuredContent: {
          balance: 20,
          tier: "free",
          isAdmin: false,
          bypassCredits: true,
          firstFreeTools: [],
        },
      };
    case "list_own_apps": {
      const apps = (workspaces.get(workspaceId)?.apps ?? []).map((a) => ({
        appId: a.id,
        name: a.name,
        description: null,
        niche: null,
      }));
      return {
        content: [{ type: "text", text: `You have ${apps.length} app(s) in this workspace (fixture).` }],
        structuredContent: { apps },
      };
    }
    case "list_social_connections":
      return {
        content: [{ type: "text", text: "No social accounts connected (fixture)." }],
        structuredContent: { connections: [] },
      };
    case "discover_social_posts": {
      // Flat shape the UI template's postCard() actually reads (see
      // tests/e2e/ui-template.e2e.ts's POSTS fixture) — this is what lets
      // tests/e2e/agentic-visual.e2e.ts render and click real posts that
      // came from an actual tools/call, not a hand-crafted fixture.
      const niche = String(args?.niche ?? "demo");
      const platform = String(args?.platform ?? "tiktok");
      // Three posts, not two, and carrying tags — because `discover_hashtags`
      // derives its answer for every network but TikTok by counting tags
      // across this sweep, and it drops any tag only one post uses. Two
      // untagged posts made that route return an empty list against the
      // fixture, which proves the plumbing and nothing about the answer.
      // The tags are split between the array and the caption on purpose: X,
      // Reddit and LinkedIn routinely fill only the caption.
      //
      // The captions read like captions on purpose: a quest run is a real
      // model reasoning over these, and one that can tell it is looking at
      // a fixture stops and says so, which scores as a broken chain.
      const posts = [1, 2, 3].map((i) => ({
        platform,
        caption: `${["the", "another", "one more"][i - 1]} ${niche} habit that actually stuck #${niche} ${i === 3 ? "#护肤" : "#fixturetag"}`,
        hashtags: i === 1 ? [`#${niche}`, "#fixturetag"] : [],
        creatorHandle: `fixture_creator_${i}`,
        externalUrl: `https://www.tiktok.com/@fixture_creator_${i}/video/${i}`,
        videoUrl: "https://e2e.nooticr.test/fixture/video.mp4",
        contentType: "video",
        views: 1000 * i,
        likes: 100 * i,
        comments: 10 * i,
      }));
      return {
        content: [{ type: "text", text: `Found ${posts.length} fixture posts about ${niche}.` }],
        structuredContent: { platform, posts },
      };
    }
    case "get_social_media": {
      // Any post-shaped URL, not only the E2E stub. The quest suite
      // (scripts/run-quests.sh) drives a real model through these tools, and
      // a model handed "e2e.nooticr.test/.../e2e-stub" correctly refuses to
      // analyse it — it can see it is looking at test scaffolding, says so,
      // and stops, which reads in a chaining report as a broken chain when
      // nothing about the chain was broken. So the fixture answers a
      // plausible URL too, and answers it with plausible content.
      if (!/^https?:\/\//.test(String(args?.url ?? ""))) {
        return { error: { code: -32602, message: `fixture wants a post URL, got ${args?.url}` } };
      }
      // Flat — ui-template.ts's renderView falls back `postCard(d.post||d,
      // true)`, and postCard() (ui-template.ts:2007-2018) reads
      // p.externalUrl, p.creatorHandle, p.videoUrl and flat
      // p.views/likes/comments/shares directly off whatever it's handed.
      // An earlier version of this fixture used a nested `stats` object and
      // `mediaUrl` instead of `videoUrl`, and no `externalUrl` at all — none
      // of postCard's own field names, so the view rendered with no
      // open-link and no stat pills. scripts/mcp-smoke-client.mjs also
      // reads `contentType` at this top level, so keep this flat rather
      // than nesting under `.post` — either is plausible against the real
      // backend's loosely-declared schema (output-schemas.ts), but this
      // repo's own passthrough (toToolResult) does not flatten one into the
      // other, so pick one and keep every consumer of this fixture
      // consistent with it.
      return {
        content: [{ type: "text", text: "Fetched fixture post media." }],
        structuredContent: {
          platform: "tiktok",
          contentType: "video",
          caption: FIXTURE_POST.caption,
          creatorHandle: FIXTURE_POST.creatorHandle,
          externalUrl: String(args?.url ?? STUB_URL),
          videoUrl: "https://e2e.nooticr.test/fixture/video.mp4",
          views: 184300,
          likes: 21400,
          comments: 612,
          shares: 1890,
          fetchedAt: new Date().toISOString(),
        },
      };
    }
    case "search_creators": {
      const creators = [1, 2].map((i) => ({
        platform: "tiktok",
        username: `fixture_creator_${i}`,
        nickname: `Fixture Creator ${i}`,
        followers: 10000 * i,
        signature: `Fixture bio ${i} — not a real creator.`,
        verified: i === 1,
      }));
      return {
        content: [{ type: "text", text: `Found ${creators.length} fixture creators.` }],
        structuredContent: { platform: "tiktok", creators },
      };
    }
    case "get_user_posts": {
      const username = String(args?.username ?? "fixture_user");
      // Echo the platform asked for rather than hardcoding tiktok: several
      // tools default the argument silently, and a fixture that always says
      // "tiktok" cannot tell a honoured platform from an ignored one.
      const platform = String(args?.platform ?? "tiktok").toLowerCase();
      // A handle that finds nothing is a real case with its own guidance path
      // (the competitor-on-the-wrong-network failure), and the generic empty
      // response cannot exercise it. Any handle starting `missing_` misses.
      // Honour `limit` rather than always returning three. compare_creators
      // and watchlist_standings score a window against its own median, and a
      // three-post window is below the floor at which they will rank anything
      // — so a fixture stuck at three could only ever exercise the "too thin
      // to call" path. Three stays the default, so nothing that assumed it
      // moves.
      const count = Math.min(Math.max(1, Number(args?.limit) || 3), 30);
      // Views vary by handle, not just by index. Identical distributions make
      // every creator identical, and a comparison of identical columns
      // demonstrates the plumbing and nothing about the comparison. Derived
      // from the handle so it is deterministic across runs.
      const seed = [...username].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 97, 7) + 3;
      const posts = username.startsWith("missing_")
        ? []
        : Array.from({ length: count }, (_, k) => k + 1).map((i) => ({
            platform,
            caption: POST_CAPTIONS[(i - 1) % POST_CAPTIONS.length],
            creatorHandle: username,
            externalUrl: `https://www.tiktok.com/@${username}/video/${i}`,
            videoUrl: "https://e2e.nooticr.test/fixture/video.mp4",
            contentType: "video",
            // One post per handle carries the outlier, so hit rates and win
            // ratios differ between handles instead of lining up.
            views: 1000 * i * (i === seed % count + 1 ? seed : 1),
            likes: 100 * i,
            comments: 10 * i,
          }));
      return {
        content: [{ type: "text", text: `Found ${posts.length} fixture posts for ${username}.` }],
        structuredContent: { platform, username, posts },
      };
    }
    case "get_similar_creators": {
      const creators = [1, 2].map((i) => ({
        platform: "tiktok",
        username: `fixture_similar_${i}`,
        nickname: `Fixture Similar ${i}`,
        followers: 20000 * i,
        signature: `Fixture lookalike bio ${i}.`,
      }));
      return {
        content: [{ type: "text", text: `Found ${creators.length} similar fixture creators.` }],
        structuredContent: { platform: "tiktok", creators },
      };
    }
    case "get_post_frames": {
      const count = Math.max(1, Math.min(Number(args?.count ?? 3), 8));
      const frames = Array.from({ length: count }, (_, i) => ({
        data: fixtureFramePng(i, count),
        mimeType: "image/png",
        atSeconds: i * 2,
        atFraction: count === 1 ? 0 : i / (count - 1),
      }));
      return {
        content: [{ type: "text", text: `Sampled ${frames.length} fixture frames.` }],
        structuredContent: {
          frames,
          selection: "even",
          scenesDetected: frames.length,
          truncated: false,
          scanComplete: true,
          coverageNote: "Fixture frames, evenly sampled across the full (fixture) duration.",
        },
      };
    }
    case "get_post_transcript": {
      // Real shape (see ui-template.ts's transcript-view gate): `available`
      // must be truthy or the view renders "No transcript available."
      return {
        content: [{ type: "text", text: "Fetched fixture transcript." }],
        structuredContent: {
          available: true,
          wordCount: FIXTURE_POST.transcript.split(" ").length,
          language: "en",
          autoGenerated: true,
          transcript: FIXTURE_POST.transcript,
        },
      };
    }
    case "discover_hashtags": {
      return {
        content: [{ type: "text", text: "Found fixture trending hashtags." }],
        structuredContent: {
          country: "US",
          days: 7,
          hashtags: [
            { hashtag: "fixturetag1", posts: 1000, views: 100000, trend: "rising", url: "https://www.tiktok.com/tag/fixturetag1" },
            { hashtag: "fixturetag2", posts: 500, views: 50000, trend: "steady", url: "https://www.tiktok.com/tag/fixturetag2" },
          ],
        },
      };
    }
    case "get_post_comments": {
      return {
        content: [{ type: "text", text: "Fetched fixture comments." }],
        structuredContent: {
          url: STUB_URL,
          platform: "tiktok",
          summary: "Mostly praise, one repeatable bug report, one question worth answering.",
          comments: [
            // Long on purpose: it is what exercises the widget's
            // show-more/show-less toggle. It also has to read like a comment
            // somebody actually left, for the reason FIXTURE_POST states.
            { text: "ok the night-before coffee thing genuinely changed my mornings and I want to be annoyed about how simple it is, I have bought three alarm clocks and a sunrise lamp this year and the thing that worked was moving one jar six feet", author: "priya_makes", likes: 412 },
            // A bug report, so the analyze_comments -> prepare_handoff chain
            // has something real to carry (docs/tool-call-strategies.md's
            // worked example). Kept in the taxonomy's own words.
            { text: "this stopped working for me after the last update, the timer just never fires now", author: "d_almeida", likes: 88 },
            { text: "does this work if you have kids though", author: "sam.h", likes: 47 },
            { text: "first", author: "throwaway_2291", likes: 0 },
          ],
        },
      };
    }
    case "discover_sounds": {
      return {
        content: [{ type: "text", text: "Found fixture sounds." }],
        structuredContent: {
          sounds: [
            {
              title: "Fixture Sound 1",
              author: "fixture_artist_1",
              duration: 30,
              playUrl: "https://e2e.nooticr.test/fixture/sound1.mp3",
              coverUrl: "https://e2e.nooticr.test/fixture/cover1.jpg",
              videoCount: 100,
            },
          ],
        },
      };
    }
    case "search_mentions": {
      // Real shape (output-schemas.ts's search_mentions entry): threads[]
      // grouped under a post, each carrying its own mentions[] with a
      // stable `id` — that id is exactly what ui-template.ts's data-mention-id
      // renders (verbatim, not synthesized), so these ids are what
      // tests/e2e/agentic-visual-full-app.e2e.ts picks by selector.
      const term = String(args?.term ?? "fixture");
      const posts = [1, 2];
      const threads = posts.map((i) => ({
        post: {
          platform: "reddit",
          caption: `Fixture thread ${i} mentioning ${term}`,
          externalUrl: `https://reddit.com/r/fixture/comments/${i}`,
          contentType: "text",
        },
        postIsAboutTerm: i === 1,
        postHits: i,
        mentionCount: 2,
        mentions: [
          { id: `fixture-mention-${i}-a`, text: `Fixture mention ${i}a about ${term}.`, username: `fixture_user_${i}a`, likes: 3, replies: 0, hits: 1 },
          { id: `fixture-mention-${i}-b`, text: `Fixture mention ${i}b about ${term}.`, username: `fixture_user_${i}b`, likes: 1, replies: 0, hits: 1 },
        ],
      }));
      return {
        content: [{ type: "text", text: `Found ${threads.length} fixture threads mentioning ${term}.` }],
        structuredContent: {
          term,
          searched: ["reddit"],
          totalMentions: threads.length * 2,
          totalThreads: threads.length,
          // renderMonitor()'s platform-filter chips (ui-template.ts:1250)
          // build entirely from `byPlatform` and render nothing at all —
          // not even the "All" chip — when it's empty, regardless of
          // `threads`. Easy to miss: this fixture's first draft omitted it
          // and the whole .mchips row silently failed to render.
          byPlatform: { reddit: threads.length * 2 },
          threads,
          hasMore: false,
        },
      };
    }
    case "analyze_comments": {
      // Real inputSchema is {url, limit?}.strict() (tools.ts) — this fixture
      // case is what a *correctly* wired caller (postAiActions' "Read
      // comments" button, ui-template.ts:614) reaches. Contrast with the
      // Monitor view's "Analyse these" button, which sends {comments, ids}
      // instead and never reaches any backend at all — rejected by this
      // repo's own zod schema before a request is even made. See
      // tests/e2e/agentic-visual-full-app.e2e.ts for both.
      return {
        content: [{ type: "text", text: "Analyzed fixture comments." }],
        structuredContent: {
          report: { themes: ["fixture theme"], objections: [], whatToMakeNext: ["fixture idea"] },
          commentsAnalyzed: 2,
        },
      };
    }
    case "generate_captions": {
      // Real shape (own-account.ts passthrough): {ok, cues, transcript, cost,
      // provider} — no `available`/`wordCount`. See ui-template.ts's
      // transcript-view gate: `transcript` present but `available` absent
      // means `!d.available` is true and it renders "No transcript
      // available." despite `cues`/`transcript` being real data — a real
      // product bug this fixture lets tests/e2e/agentic-visual-full-app.e2e.ts
      // demonstrate concretely rather than just assert against a schema.
      return {
        content: [{ type: "text", text: "Generated fixture captions." }],
        structuredContent: {
          ok: true,
          provider: "mock",
          cost: 1,
          transcript: "Fixture caption transcript.",
          cues: [{ text: "Fixture caption transcript.", start_sec: 0, end_sec: 3 }],
        },
      };
    }
    case "draft_post": {
      const topic = String(args?.topic ?? "a fixture topic");
      return {
        content: [{ type: "text", text: `Drafted a fixture post about ${topic}.` }],
        structuredContent: {
          ok: true,
          provider: "mock",
          draft: {
            title: `A fixture draft about ${topic}`,
            caption: `Fixture caption for a post about ${topic} (mock provider, not real content).`,
            hashtags: ["fixture", "test"],
          },
        },
      };
    }
    case "growth_brief": {
      return {
        content: [{ type: "text", text: "Generated a fixture growth brief." }],
        structuredContent: {
          ok: true,
          brief: {
            headline: "Fixture headline: this is mock data, not a real brief.",
            wins: [{ text: "Fixture win 1" }],
            risks: [{ text: "Fixture risk 1" }],
            actions: [{ text: "Fixture action 1" }],
          },
        },
      };
    }
    case "generate_content_plan": {
      return {
        content: [{ type: "text", text: "Generated a fixture content plan." }],
        structuredContent: {
          ok: true,
          plan: {
            weekStart: new Date().toISOString().slice(0, 10),
            plan: [],
          },
        },
      };
    }
    case "get_content_plan": {
      return {
        content: [{ type: "text", text: "No content plan generated yet (fixture)." }],
        structuredContent: { ok: true, plan: null },
      };
    }
    case "review_post": {
      return {
        content: [{ type: "text", text: "Reviewed the fixture draft." }],
        structuredContent: {
          review: {
            degraded: false,
            scoreA: { hookStrength: 6 },
            aestheticAdvice: "Fixture aesthetic advice.",
            storytellingAdvice: "Fixture storytelling advice.",
            improvedHooks: ["Fixture improved hook."],
            improvedCaptions: ["Fixture improved caption."],
          },
        },
      };
    }
    case "create_brand_watch": {
      const platforms = args.platforms ?? ["tiktok", "reddit", "youtube"];
      const cadence = args.cadence ?? "daily";
      const runsPerDay = { hourly: 24, every_6_hours: 4, every_12_hours: 2, daily: 1, weekly: 1 / 7 }[cadence] ?? 1;
      const costPerRun = platforms.reduce((sum, p) => sum + (p === "xiaohongshu" ? 5 : 2), 0);
      if (args.confirm === true) {
        if (args.confirmationToken !== "fixture-confirm-token") {
          return {
            content: [{ type: "text", text: "That confirmation token didn't match — nothing was created." }],
            structuredContent: { rejected: true, message: "Confirmation token mismatch; nothing was created." },
          };
        }
        return {
          content: [{ type: "text", text: `Created a brand watch for "${args.term}".` }],
          structuredContent: {
            created: true,
            watchId: "watch-fixture-1",
            term: args.term,
            platforms,
            cadence,
            costPerRun,
            creditsPerDay: Math.round(costPerRun * runsPerDay * 100) / 100,
            budgetPerRun: args.budgetCredits ?? costPerRun,
            deliverTo: args.deliverTo ?? "fixture-user@example.com",
            firstRun: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            message: `Watching for "${args.term}" on ${platforms.join(", ")}, ${cadence}.`,
          },
        };
      }
      return {
        content: [{ type: "text", text: `Quote: watching "${args.term}" costs ${costPerRun} credits per run, ${cadence}.` }],
        structuredContent: {
          requiresConfirmation: true,
          confirmationToken: "fixture-confirm-token",
          expiresInSeconds: 300,
          quote: {
            term: args.term,
            platforms,
            cadence,
            cadenceMinutes: cadence === "hourly" ? 60 : cadence === "every_6_hours" ? 360 : cadence === "every_12_hours" ? 720 : cadence === "weekly" ? 10080 : 1440,
            costPerRun,
            runsPerDay,
            creditsPerDay: Math.round(costPerRun * runsPerDay * 100) / 100,
            budgetPerRun: args.budgetCredits ?? costPerRun,
            deliverTo: args.deliverTo ?? "fixture-user@example.com",
            summary: `${costPerRun} credits per run on ${platforms.join(", ")}, ${cadence}.`,
            balance: 500,
            runsAffordableAtCurrentBalance: Math.floor(500 / costPerRun),
          },
          instructions: "Call again with confirm: true and this confirmationToken to actually create the watch.",
        },
      };
    }
    case "brand_watch_history": {
      // A real series, because the generic empty case cannot exercise the one
      // thing mention_trend's guidance is for: telling a short series apart
      // from a quiet one. Eight weekly points, a network that grows while the
      // total holds, and a run that found plenty and mailed nothing.
      const runs = [0, 1, 2, 3, 4, 5, 6, 7].map((w) => {
        const ranAt = new Date(Date.now() - w * 7 * 864e5).toISOString();
        const tiktok = 12 - w;
        const reddit = 4 + w;
        return {
          ranAt,
          found: tiktok + reddit,
          reported: w === 0 ? 0 : Math.max(0, 5 - w),
          perPlatform: {
            tiktok: { found: tiktok, reported: w === 0 ? 0 : Math.max(0, 3 - w) },
            reddit: { found: reddit, reported: w === 0 ? 0 : Math.min(2, w) },
          },
          medianViews: null,
          postsScored: null,
          costCredits: 4,
        };
      });
      return {
        content: [{ type: "text", text: `Fixture history: ${runs.length} runs.` }],
        structuredContent: {
          watchId: "11111111-2222-3333-4444-555555555555",
          kind: "mentions",
          term: String(args?.term ?? "nooticr"),
          platforms: ["tiktok", "reddit"],
          windowDays: 90,
          retainedDays: 365,
          watchCreatedAt: new Date(Date.now() - 8 * 7 * 864e5).toISOString(),
          runs,
          runCount: runs.length,
          found: { newest: runs[0].found, oldest: runs[runs.length - 1].found },
          medianViews: { newest: null, oldest: null },
          recurring: [
            {
              mentionKey: "fixture-sticky-key",
              timesSeen: 6,
              firstReportedAt: runs[runs.length - 1].ranAt,
              lastSeenAt: runs[0].ranAt,
            },
          ],
        },
      };
    }
    case "list_brand_watches": {
      return {
        content: [{ type: "text", text: "1 active brand watch." }],
        structuredContent: {
          watches: [
            {
              watchId: "watch-fixture-1",
              term: "fixture-brand",
              platforms: ["reddit", "tiktok"],
              cadence: "daily",
              costPerRun: 4,
              budgetPerRun: 4,
              creditsSpent: 12,
              runs: 3,
              deliverTo: "fixture-user@example.com",
              enabled: true,
              stoppedBecause: null,
              nextRun: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              lastRun: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
            },
          ],
          activeCount: 1,
          creditsPerDayAcrossAllWatches: 4,
        },
      };
    }
    case "stop_brand_watch": {
      return {
        content: [{ type: "text", text: `Stopped the brand watch for "${args.term ?? args.watchId}".` }],
        structuredContent: {
          stopped: true,
          watchId: args.watchId ?? "watch-fixture-1",
          term: args.term ?? "fixture-brand",
          creditsSpent: 12,
          runs: 3,
          stoppedBecause: "user requested",
          message: `Stopped watching "${args.term ?? args.watchId}".`,
        },
      };
    }
    case "scan_amazon_category":
    case "amazon_scan_status":
    case "get_amazon_product": {
      const scanId = String(args?.scanId ?? "scan_fixture_1");
      const single = name === "get_amazon_product";
      const scan = fixtureAmazonScan(single ? { ...args, limit: 1 } : args, scanId);
      if (single) scan.product = scan.products[0] ?? null;
      if (name === "amazon_scan_status") scan.billable = false;
      return {
        content: [
          {
            type: "text",
            text: `${scan.products.length} Amazon listing(s) collected, ${scan.rollup.reviewsCollected} review(s) (fixture).`,
          },
        ],
        structuredContent: scan,
      };
    }
    default:
      // Not a failure: keeps other tool calls from hard-crashing the
      // fixture if a future test case exercises one this stand-in doesn't
      // model yet. scripts/mcp-smoke-client.mjs only asserts on the tools
      // above; anything else getting an empty result is expected, not a bug.
      return {
        content: [{ type: "text", text: `fixture-server: ${name} is not modeled, returning an empty result.` }],
        structuredContent: {},
      };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true, database: "ok (fixture)", ffmpeg: "n/a (fixture)" });
    }

    if (req.method === "POST" && req.url === "/auth/dev-login") {
      const body = await readJson(req);
      const token = randomUUID();
      tokens.set(token, { workspaceId: body.workspace_id });
      return sendJson(res, 200, { token });
    }

    if (req.method === "POST" && req.url === "/graphql") {
      const body = await readJson(req);
      return sendJson(res, 200, handleGraphql(body));
    }

    if (req.method === "POST" && req.url === "/mcp") {
      const body = await readJson(req);
      if (body.method !== "tools/call") {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: `fixture-server only implements tools/call, got ${body.method}` },
        });
      }
      const token = bearerToken(req);
      const session = token ? tokens.get(token) : undefined;
      const { name, arguments: args } = body.params ?? {};
      const result = handleMcpCall(name, args, session?.workspaceId);
      if (result.error) {
        return sendJson(res, 200, { jsonrpc: "2.0", id: body.id, error: result.error });
      }
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id: body.id,
        result: { content: result.content, structuredContent: result.structuredContent, isError: false },
      });
    }

    sendJson(res, 404, { error: `fixture-server: no route for ${req.method} ${req.url}` });
  } catch (err) {
    sendJson(res, 500, { error: String(err?.stack ?? err) });
  }
});

server.listen(PORT, () => {
  console.error(`[fixture-server] listening on http://localhost:${PORT} (stand-in for nooticr-server — see this file's header)`);
});
