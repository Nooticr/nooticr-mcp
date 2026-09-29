#!/usr/bin/env node
// The whole tool surface, called for real and drawn for real, in one pass.
//
// Every other deterministic check here looks at one seam. This one walks all
// of them for every tool the built server lists, because the bugs CLAUDE.md
// keeps recording — an optional argument the zod schema accepts and the
// guidance builder drops, a field a tool computes that the view never reads, a
// fixture answered by the generic `default:` case and so proving nothing, a
// view that draws off the design system's tokens — each sit between two
// artifacts and are invisible to a test of either one.
//
// It is a probe, not a gate: it exits 0 whenever it produced its report, with
// whatever it found in `findings`. A verify layer decides what blocks, against
// a baseline. It exits non-zero only when it crashed or could not write the
// report, because a report that silently did not happen reads as a clean one.
//
// Needs a backend booted and NOOTICR_BASE_URL/NOOTICR_ACCESS_TOKEN exported,
// with FIXTURE_TRACE pointing at the file the fixture writes —
// scripts/run-surface-probe.sh does all of that:
//   node scripts/surface-probe.mjs --out <file.json> --screens <dir> [--tokens <tokens.json>]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { connectBuiltServer, resultText, REPO_ROOT } from "./quest-lib/mcp-client.mjs";
import { argsFor, STUB_URL } from "./quest-lib/probe-args.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const outFile = opt("--out", null);
const screensDir = opt("--screens", null);
const tokensPath = opt("--tokens", path.resolve(REPO_ROOT, "../nooticr-server/verify/vendor/design-system/tokens.json"));
const CONCURRENCY = Math.max(1, Number(opt("--concurrency", "4")));
const CALL_TIMEOUT_MS = 20_000;
// How long a result has to replace the loading skeleton before it counts as
// stuck on it. The template's own shimmer is shorter than this; a view still
// on it after 1.5s never got its result drawn.
const SKELETON_GRACE_MS = 1500;
const THEME_SETTLE_MS = 400;
const TRACE_FILE = process.env.FIXTURE_TRACE || "";
const BASE_URL = process.env.NOOTICR_BASE_URL || "";

if (!outFile || !screensDir) {
  console.error("usage: node scripts/surface-probe.mjs --out <file.json> --screens <dir> [--tokens <tokens.json>]");
  process.exit(2);
}
if (!fs.existsSync(tokensPath)) {
  // The style check is a comparison against these tokens; without them there
  // is nothing to compare to, and a report missing a whole check would read
  // as that check passing.
  console.error(`surface-probe: no design-system tokens at ${tokensPath} (pass --tokens)`);
  process.exit(2);
}
const say = (...a) => console.error(...a);

// ─── Design-system tokens ───

function loadTokens(file) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const byName = new Map((doc.color?.tokens ?? []).map((t) => [t.name, t.value ?? {}]));
  const resolve = (value, theme, seen = new Set()) => {
    const m = typeof value === "string" ? /^\{(.+)\}$/.exec(value.trim()) : null;
    if (!m) return value;
    if (seen.has(m[1])) throw new Error(`tokens.json: alias cycle at {${m[1]}}`);
    seen.add(m[1]);
    const target = byName.get(m[1]);
    if (!target) throw new Error(`tokens.json: unknown alias {${m[1]}}`);
    return resolve(target[theme], theme, seen);
  };
  const themes = (doc.color?.themes ?? [{ id: "light" }, { id: "dark" }]).map((t) => t.id);
  const colors = {};
  for (const theme of themes) {
    colors[theme] = [...byName.entries()].map(([name, v]) => ({ name, value: resolve(v[theme], theme) }));
  }
  const fontSizes = [];
  for (const g of doc.type?.groups ?? []) for (const s of g.styles ?? []) if (s.fontSize) fontSizes.push(parseFloat(s.fontSize));
  const radii = (doc.radius?.tokens ?? []).map((t) => parseFloat(t.value)).filter((n) => !Number.isNaN(n));
  return { colors, fontSizes: [...new Set(fontSizes)], radii: [...new Set(radii)] };
}
const TOKENS = loadTokens(tokensPath);

// ─── Backend sessions ───

/**
 * One workspace per worker, so the watchlist and brand-watch tools — which
 * read state other tools write — see only their own worker's writes, in an
 * order fixed by the tool list rather than by which call happened to land
 * first. Its token is also how the trace attributes a backend call.
 */
async function provisionSession(index) {
  const post = async (route, body, token) => {
    const res = await fetch(`${BASE_URL}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`);
    return res.json();
  };
  try {
    const boot = await post("/auth/dev-login", {});
    const ws = await post("/graphql", {
      query: "mutation($name: String!, $createdBy: UUID!) { createWorkspace(name: $name, createdBy: $createdBy) { id } }",
      variables: { name: `surface-probe-${index}`, createdBy: "00000000-0000-0000-0000-000000000000" },
    }, boot.token);
    const workspaceId = ws.data.createWorkspace.id;
    const app = await post("/graphql", {
      query: "mutation($workspaceId: UUID!, $name: String!, $slug: String!) { createApp(workspaceId: $workspaceId, name: $name, slug: $slug) { id } }",
      variables: { workspaceId, name: "Surface Probe App", slug: `surface-probe-${index}` },
    }, boot.token);
    const scoped = await post("/auth/dev-login", { workspace_id: workspaceId });
    return { token: scoped.token, appId: app.data.createApp.id };
  } catch (err) {
    // A backend without dev-login provisioning still gets probed, on the
    // caller's own session: the trace then cannot tell workers apart, so the
    // run drops to one worker (see main).
    say(`surface-probe: could not provision worker ${index} (${err.message}); using NOOTICR_ACCESS_TOKEN`);
    return { token: process.env.NOOTICR_ACCESS_TOKEN ?? "", appId: process.env.NOOTICR_E2E_APP_ID ?? null, shared: true };
  }
}

// ─── The trace the fixture writes ───

function traceLinesFor(session) {
  if (!TRACE_FILE || !fs.existsSync(TRACE_FILE)) return [];
  return fs
    .readFileSync(TRACE_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((l) => l && (session == null || l.session === session));
}

// ─── Calling tools ───

async function callOnce(worker, name, args) {
  const before = traceLinesFor(worker.traceKey).length;
  let result;
  let error = null;
  try {
    result = await worker.client.callTool({ name, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
  } catch (err) {
    error = String(err?.message ?? err).slice(0, 300);
  }
  const trace = traceLinesFor(worker.traceKey).slice(before).map(({ name: n, args: a, handled }) => ({ name: n, args: a, handled }));
  return {
    error,
    isError: Boolean(error || result?.isError),
    text: result ? resultText(result) : "",
    structured: result?.structuredContent ?? null,
    content: result?.content ?? [],
    trace,
  };
}

// Values that differ call to call for reasons that have nothing to do with the
// arguments: ids the backend mints, clocks. Without this a tool that returns
// a fresh run id reads as "every argument changes it".
function normalise(s) {
  return String(s)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, "<ts>")
    .replace(/\b1[6-9]\d{11}\b/g, "<epoch>");
}
const channels = (r) => ({
  text: normalise(r.text),
  structured: normalise(JSON.stringify(r.structured)),
  backend: normalise(JSON.stringify(r.trace.map(({ name, args }) => ({ name, args })))),
  error: normalise(r.error ?? ""),
});

// ─── Plausible values for an optional argument ───

const SENTENCE = "Mornings go better when the first decision is made the night before.";
const STRING_HINTS = [
  [/^(since|from|weekStart)$/i, () => "2026-08-01"],
  [/^to$/i, () => "2026-09-20"],
  [/^language$/i, () => "es"],
  [/^focus$/i, () => "whether the first two seconds earn the rest of the video"],
  [/^tone$/i, () => "dry and deadpan"],
  [/^angle$/i, () => "contrarian"],
  [/^note$/i, () => "Met at a creator meetup; strong comment section"],
  [/^platform$/i, () => "instagram"],
  [/^niche$/i, () => "home espresso"],
  [/^country$/i, () => "GB"],
  [/^industryId$/i, () => "22000000000"],
  [/^(keywords|query|term|topic)$/i, () => "cold brew at home"],
  [/^(seed|username|handle|recommended)$/i, () => "fixture_creator_2"],
  [/url$/i, () => "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
  [/^metric$/i, () => "likes"],
  [/^watchId$/i, () => "00000000-0000-0000-0000-000000000001"],
  [/^tool$/i, () => "analyze_post"],
  [/^domain$/i, () => "www.amazon.co.uk"],
  [/^market$/i, () => "de"],
  [/^(asin|id)$/i, () => "B07VJ5KFXZ"],
  [/^scanId$/i, () => "scan-fixture-2"],
  [/^deliverTo$/i, () => "email"],
  [/^confirmationToken$/i, () => "confirm-fixture-token"],
  [/^contentType$/i, () => "carousel"],
  [/^product_type$/i, () => "app"],
  [/^slug$/i, () => "espresso-kit"],
  [/^name$/i, () => "Espresso Kit"],
  [/^(ios_bundle_id|android_package)$/i, () => "com.example.espresso"],
  [/^external_listing_id$/i, () => "id1234567890"],
  [/^primary_cta_label$/i, () => "Download"],
  [/^product$/i, () => "Nooticr"],
  [/^(title|titleB)$/i, () => "The coffee trick that fixed my mornings"],
  [/^caption$/i, () => "Set it up at ten, drink it at six. #morningroutine"],
];
const INT_HINTS = [
  [/^(limit|count|pageSize|supplyLimit)$/i, 5],
  [/^days$/i, 30],
  [/^offset$/i, 10],
  [/^window$/i, 12],
  [/^(commentsPerPost|maxTranscripts)$/i, 4],
  [/^candidateLimit$/i, 10],
  [/^minCredits$/i, 3],
  [/^before$/i, 100],
  [/^waitSeconds$/i, 1],
  [/^durationSec$/i, 30],
  [/^slideCount$/i, 5],
  [/^budgetCredits$/i, 50],
];

function schemaType(schema) {
  if (Array.isArray(schema?.type)) return schema.type.find((t) => t !== "null");
  if (schema?.type) return schema.type;
  const branch = (schema?.anyOf ?? schema?.oneOf ?? []).find((b) => b?.type !== "null");
  return branch ? schemaType(branch) : undefined;
}
function effective(schema) {
  if (schema?.type || schema?.enum) return schema;
  return (schema?.anyOf ?? schema?.oneOf ?? []).find((b) => b?.type !== "null") ?? schema ?? {};
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function plausible(name, rawSchema, current, ctx, depth = 0) {
  const schema = effective(rawSchema);
  const avoid = (v) => same(v, current) || (schema.default !== undefined && same(v, schema.default));
  if (Array.isArray(schema.enum) && schema.enum.length) {
    const others = schema.enum.filter((v) => !avoid(v));
    return others.length > 1 ? others[1] : (others[0] ?? schema.enum[0]);
  }
  const type = schemaType(schema);
  if (/^appId$/i.test(name) && (type === "integer" || type === "number")) {
    const id = Number(ctx.appId);
    return Number.isFinite(id) && !avoid(id) ? id : 1;
  }
  switch (type) {
    case "boolean":
      return schema.default !== undefined ? !schema.default : current !== undefined ? !current : true;
    case "integer":
    case "number": {
      const hint = INT_HINTS.find(([re]) => re.test(name));
      let v = hint ? hint[1] : 3;
      const lo = schema.minimum ?? -Infinity;
      const hi = schema.maximum ?? Infinity;
      v = Math.min(hi, Math.max(lo, v));
      for (let step = 1; avoid(v) && step < 50; step += 1) v = Math.min(hi, Math.max(lo, v + (v + 1 <= hi ? 1 : -1)));
      return v;
    }
    case "array": {
      const items = effective(schema.items ?? {});
      const singular = name.replace(/ies$/, "y").replace(/s$/, "");
      let item;
      if (Array.isArray(items.enum) && items.enum.length) {
        const cur = Array.isArray(current) ? current : [];
        item = items.enum.find((v) => !cur.includes(v) && v !== items.enum[0]) ?? items.enum.find((v) => !cur.includes(v)) ?? items.enum[0];
      } else if (schemaType(items) === "object" || !schemaType(items)) {
        item = depth < 2 ? plausibleObject(singular, items, ctx, depth + 1) : {};
      } else if (schemaType(items) === "integer" || schemaType(items) === "number") {
        item = 1;
      } else {
        item = /^(theme|nextStep|lesson|query|tooThin)$/i.test(singular)
          ? SENTENCE
          : (STRING_HINTS.find(([re]) => re.test(singular))?.[1]() ?? stringFor(singular));
      }
      const out = Array.from({ length: Math.max(1, schema.minItems ?? 1) }, () => item);
      return avoid(out) ? [...out, item] : out;
    }
    case "object":
      return depth < 2 ? plausibleObject(name, schema, ctx, depth + 1) : {};
    default: {
      const v = STRING_HINTS.find(([re]) => re.test(name))?.[1]() ?? stringFor(name);
      return avoid(v) ? `${v} (again)` : v;
    }
  }
}
function stringFor(name) {
  if (/summary|verdict|reason|detail|description|question|ranking|nextTest|hint|why|who|angle|label/i.test(name)) return SENTENCE;
  return "espresso";
}
function plausibleObject(name, schema, ctx, depth) {
  const props = schema.properties ?? {};
  const keys = Object.keys(props);
  if (!keys.length) {
    // An open object ({}, additionalProperties) — the shape the show_* tools
    // take a post or a product in. Give it something that reads as one.
    if (/post/i.test(name)) return { platform: "tiktok", caption: "the 6am routine that actually stuck", externalUrl: STUB_URL, views: 1200 };
    if (/rollup/i.test(name)) return { productsScanned: 3, reviewsCollected: 12 };
    if (/product|item/i.test(name)) return { asin: "B07VJ5KFXZ", title: "Organic ashwagandha, 120 capsules", rating: 4.5 };
    if (/media/i.test(name)) return { url: "https://www.example.com/frame.jpg", type: "image" };
    return { note: SENTENCE };
  }
  const required = schema.required ?? keys;
  const out = {};
  for (const k of required) out[k] = plausible(k, props[k], undefined, ctx, depth);
  return out;
}

/** The SDK's answer to arguments its zod schema refused: nothing ran. */
function isInputRejection(r) {
  return /-32602|Input validation error/i.test(r.error ?? "") || (r.isError && /^MCP error -32602/.test(r.text));
}
function synthesiseArgs(tool, ctx) {
  const schema = tool.inputSchema ?? {};
  const out = {};
  for (const key of schema.required ?? []) out[key] = plausible(key, schema.properties?.[key] ?? {}, undefined, ctx);
  return out;
}

// ─── The browser half ───

/** A 1x1 GIF, so an <img> gets bytes it can decode instead of an error. */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

// Which renderer drew the result. The renderers are closures inside the
// template's script, so the only way to see which one ran is to have each say
// so: a one-statement push at the top of every `function render*` (and the
// card builders the dispatch uses without a render* of its own). The template
// on disk is untouched; this edits the probe's copy.
const TRACED = /function (render[A-Za-z]*|analysisCard|galleryWrap|creatorCard|postCard|emptyState)\(([^)]*)\)\{/g;
function instrumentTemplate(html) {
  return html.replace(TRACED, (m, fn) => `${m}if(window.__ntR)window.__ntR.push(${JSON.stringify(fn)});`);
}
/**
 * Run `fn` before the template's own script. page.addInitScript does not
 * reach a document written by page.setContent, so it goes in the markup: the
 * first `<head>` is the document's, ahead of the template's only <script>.
 */
function withPrelude(html, fn) {
  const at = html.indexOf("<head>");
  if (at < 0) throw new Error("template has no <head> to put the probe's prelude in");
  const cut = at + "<head>".length;
  return `${html.slice(0, cut)}<script>(${fn.toString()})();</script>${html.slice(cut)}`;
}
const NOT_A_RENDERER = new Set(["render", "renderView", "renderToolResult", "renderLoading", "renderIdle"]);
function rendererFrom(trace, generic) {
  if (generic) return "generic";
  const names = trace.filter((n) => !NOT_A_RENDERER.has(n));
  return (
    names.find((n) => n.startsWith("render")) ??
    ["galleryWrap", "analysisCard", "creatorCard", "postCard", "emptyState"].find((n) => names.includes(n)) ??
    "none"
  );
}

/** Runs before the template's script (see withPrelude), so its message listener is wrapped. */
function fieldTrackerInit() {
  const accessed = new Set();
  window.__ntFields = accessed;
  let paused = 0;
  // Serialising the payload — the template takes a signature of every result
  // with JSON.stringify — reads every key, and would mark every field drawn.
  const stringify = JSON.stringify;
  JSON.stringify = function (...a) {
    paused += 1;
    try {
      return stringify.apply(this, a);
    } finally {
      paused -= 1;
    }
  };
  const cache = new WeakMap();
  const wrap = (obj, prefix, depth) => {
    if (!obj || typeof obj !== "object" || depth > 2) return obj;
    const key = `${depth}|${prefix}`;
    let per = cache.get(obj);
    if (!per) cache.set(obj, (per = new Map()));
    if (per.has(key)) return per.get(key);
    const isArr = Array.isArray(obj);
    const proxy = new Proxy(obj, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r);
        if (typeof k !== "string" || paused) return v;
        if (isArr) {
          if (/^\d+$/.test(k)) return wrap(v, `${prefix}[]`, depth + 1);
          return v;
        }
        const p = prefix ? `${prefix}.${k}` : k;
        if (Object.prototype.hasOwnProperty.call(t, k)) accessed.add(p);
        return depth === 0 ? wrap(v, p, 1) : v;
      },
      has(t, k) {
        if (typeof k === "string" && !paused && !isArr) accessed.add(prefix ? `${prefix}.${k}` : k);
        return Reflect.has(t, k);
      },
    });
    per.set(key, proxy);
    return proxy;
  };
  const add = window.addEventListener;
  window.addEventListener = function (type, fn, opts) {
    if (type !== "message" || typeof fn !== "function") return add.call(this, type, fn, opts);
    const wrapped = function (ev) {
      const d = ev.data;
      const sc = d && d.params && d.params.structuredContent;
      if (!d || d.method !== "ui/notifications/tool-result" || !sc || typeof sc !== "object") return fn.call(this, ev);
      const data = { ...d, params: { ...d.params, structuredContent: wrap(sc, "", 0) } };
      return fn.call(this, { data, source: ev.source, origin: ev.origin, ports: ev.ports, type: ev.type, target: ev.target, currentTarget: ev.currentTarget, lastEventId: ev.lastEventId });
    };
    return add.call(this, type, wrapped, opts);
  };
}

/** Runs in the page: blank/skeleton state and the design-token audit. */
function auditPage({ allowedColors, fontSizes, radii }) {
  const app = document.getElementById("app") || document.body;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  };
  const skeleton = [...document.querySelectorAll(".nt-sk, .nt-commerce-loading, .load-centre, .nt-loadbar")].some(visible);
  const text = (app.innerText || "").trim();
  const anyElement = [...app.querySelectorAll("*")].some((el) => visible(el) && !el.closest("svg.mk"));

  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext("2d", { willReadFrequently: true });
  // Both sides go through the same canvas, so an oklch() or color-mix() the
  // engine computes and a hex in tokens.json are compared as the same thing:
  // the sRGB bytes a screen would get.
  const rgba = (v) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  };
  const allowed = allowedColors.map((c) => ({ name: c.name, px: rgba(c.value) }));
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= 2);
  const colorOk = (v) => {
    const px = rgba(v);
    if (px[3] === 0) return true;
    return allowed.some((t) => near(t.px, px));
  };
  const IGNORE = ".nt-glyph, .nt-feeds-ptile, .nt-commerce-mtile, .mkt-logo, .mkt-generic, [class*='logo']";
  const seg = (el) => {
    const cls = [...el.classList].filter((c) => c !== "nt-in").slice(0, 3);
    return el.tagName.toLowerCase() + cls.map((c) => `.${c}`).join("");
  };
  const sig = (el) => {
    const parts = [];
    for (let cur = el, i = 0; cur && i < 3 && cur !== document.body && cur !== app; cur = cur.parentElement, i += 1) parts.unshift(seg(cur));
    return parts.join(" > ") || seg(el);
  };
  const out = new Map();
  const flag = (prop, value, el) => {
    const key = `${prop}\u0000${value}\u0000${sig(el)}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  };
  const TEXTISH = new Set(["INPUT", "TEXTAREA", "SELECT"]);
  for (const el of document.body.querySelectorAll("*")) {
    if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IMG", "VIDEO", "PICTURE", "CANVAS", "IFRAME", "SOURCE"].includes(el.tagName)) continue;
    if (el.closest("svg") || el.closest(IGNORE)) continue;
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const ownText = TEXTISH.has(el.tagName) || [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (ownText) {
      if (!colorOk(cs.color)) flag("color", cs.color, el);
      const fs = parseFloat(cs.fontSize);
      if (!fontSizes.some((s) => Math.abs(s - fs) < 0.01)) flag("font-size", cs.fontSize, el);
      const family = cs.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (family !== "Geist" && family !== "Geist Mono") flag("font-family", family, el);
    }
    if (!el.style.backgroundImage && !colorOk(cs.backgroundColor)) flag("background-color", cs.backgroundColor, el);
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(cs[`border${side}Width`]);
      const style = cs[`border${side}Style`];
      if (w > 0 && style !== "none" && style !== "hidden" && !colorOk(cs[`border${side}Color`])) {
        flag("border-color", cs[`border${side}Color`], el);
      }
    }
    for (const corner of ["TopLeft", "TopRight", "BottomRight", "BottomLeft"]) {
      const v = cs[`border${corner}Radius`];
      const ok = v.split(" ").every((part) => {
        if (part === "50%") return true;
        const n = parseFloat(part);
        if (part.endsWith("%")) return n === 0;
        return n === 0 || n >= 9999 || radii.some((r) => Math.abs(r - n) < 0.01);
      });
      if (!ok) flag("border-radius", v, el);
    }
  }
  return {
    blank: !text && !anyElement,
    skeleton,
    generic: Boolean(document.querySelector(".nt-view-json")),
    offToken: [...out.entries()].map(([k, count]) => {
      const [prop, value, selector] = k.split("\u0000");
      return { prop, value, selector, count };
    }),
  };
}

async function newPage(browser, errors, stage) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1400 }, colorScheme: "light" });
  const page = await context.newPage();
  // Nothing the probe draws may reach the network: payloads carry real media
  // URLs, and a fetch that fails is logged as a console error, which would
  // then read as the view's fault. Served here, as tests/e2e/guarded-test.ts
  // does for production hosts, and for every other host too.
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (!/^https?:/i.test(url)) return route.fallback();
    const kind = req.resourceType();
    if (kind === "media" || /\.(mp4|webm|m3u8|mov)(\?|$)/i.test(url)) {
      return route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
    }
    if (kind === "image" || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url)) {
      return route.fulfill({ status: 200, contentType: "image/gif", body: PIXEL });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  page.on("pageerror", (e) => errors.push({ stage: stage(), message: String(e?.message ?? e) }));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push({ stage: stage(), message: m.text() });
  });
  return { context, page };
}

async function post(page, message) {
  await page.evaluate((m) => window.postMessage(m, "*"), message);
}

async function renderTool(browser, uiTemplateFor, tool, probe, screenFile) {
  const errors = [];
  let stage = "boot";
  const html = withPrelude(instrumentTemplate(uiTemplateFor(tool.name)), () => {
    window.__ntR = [];
  });
  const params = { content: probe.content, structuredContent: probe.structured ?? undefined, isError: probe.isError };
  const out = { errors, themes: {}, renderer: "none", accessed: null, screenshots: [] };

  const { context, page } = await newPage(browser, errors, () => stage);
  try {
    await page.setContent(html, { waitUntil: "load" });
    await post(page, { method: "ui/notifications/host-context-changed", params: { theme: "light" } });
    // The order a host sends them in: the input first, which draws the
    // skeleton; then the result, which has to replace it.
    await post(page, { method: "ui/notifications/tool-input", params: { name: tool.name, arguments: probe.args } });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.__ntR.length = 0;
    });
    stage = "light";
    await post(page, { method: "ui/notifications/tool-result", params });
    await page.waitForTimeout(SKELETON_GRACE_MS);
    const light = await page.evaluate(auditPage, { allowedColors: TOKENS.colors.light, fontSizes: TOKENS.fontSizes, radii: TOKENS.radii });
    out.themes.light = light;
    out.renderer = rendererFrom(await page.evaluate(() => window.__ntR.slice()), light.generic);
    await page.screenshot({ path: screenFile("light"), fullPage: true });
    out.screenshots.push(screenFile("light"));

    stage = "dark";
    await post(page, { method: "ui/notifications/host-context-changed", params: { theme: "dark" } });
    await page.waitForTimeout(THEME_SETTLE_MS);
    out.themes.dark = await page.evaluate(auditPage, { allowedColors: TOKENS.colors.dark, fontSizes: TOKENS.fontSizes, radii: TOKENS.radii });
    await page.screenshot({ path: screenFile("dark"), fullPage: true });
    out.screenshots.push(screenFile("dark"));
  } finally {
    await context.close();
  }

  // Field reads on a page of their own: the tracking Proxy is instrumentation,
  // and any error it caused must not be reported as the view's.
  if (probe.structured && typeof probe.structured === "object") {
    const ignored = [];
    const tracked = await newPage(browser, ignored, () => "fields");
    try {
      await tracked.page.setContent(withPrelude(uiTemplateFor(tool.name), fieldTrackerInit), { waitUntil: "load" });
      await post(tracked.page, { method: "ui/notifications/tool-result", params });
      await tracked.page.waitForTimeout(THEME_SETTLE_MS);
      out.accessed = await tracked.page.evaluate(() => [...window.__ntFields]);
    } finally {
      await tracked.context.close();
    }
  }
  return out;
}

// ─── Main ───

async function pool(items, size, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}

function presentFields(sc) {
  const fields = [];
  const skip = (k) => k.startsWith("_") || k === "guidance";
  for (const [k, v] of Object.entries(sc ?? {})) {
    if (skip(k)) continue;
    fields.push({ path: k, parent: null });
    const inner = Array.isArray(v) ? v.find((x) => x && typeof x === "object" && !Array.isArray(x)) : v && typeof v === "object" ? v : null;
    if (!inner) continue;
    const prefix = Array.isArray(v) ? `${k}[]` : k;
    for (const sub of Object.keys(inner)) if (!skip(sub)) fields.push({ path: `${prefix}.${sub}`, parent: k });
  }
  return fields;
}

async function main() {
  const started = Date.now();
  const { uiTemplateFor } = await import(pathToFileURL(path.join(REPO_ROOT, "dist", "shared", "tools.js")).href);
  if (TRACE_FILE) fs.writeFileSync(TRACE_FILE, "", { flag: "a" });

  const sessions = [];
  for (let i = 0; i < CONCURRENCY; i += 1) {
    const s = await provisionSession(i);
    sessions.push(s);
    if (s.shared) break;
  }
  const workers = await Promise.all(
    sessions.map(async (s, i) => ({
      index: i,
      appId: s.appId,
      traceKey: s.shared ? null : s.token,
      client: await connectBuiltServer({ token: s.token, name: `surface-probe-${i}` }),
    })),
  );
  const { tools } = await workers[0].client.listTools();
  say(`surface-probe: ${tools.length} tools, ${workers.length} worker(s)`);

  // Round-robin by position, so which worker (and so which workspace) a tool
  // runs in is a function of the tool list, not of timing.
  const probes = new Array(tools.length);
  await Promise.all(
    workers.map(async (w) => {
      for (let i = w.index; i < tools.length; i += workers.length) {
        const tool = tools[i];
        let args = argsFor(tool);
        let first = await callOnce(w, tool.name, args);
        let argsSource = "probe-args";
        if (isInputRejection(first)) {
          // The shared probe arguments no longer match this tool's schema.
          // Every variant would then be rejected the same way and read as
          // "ignored", so build the required fields from the schema instead.
          const synthesised = synthesiseArgs(tool, { appId: w.appId });
          const retry = await callOnce(w, tool.name, synthesised);
          if (!isInputRejection(retry)) {
            say(`  ${tool.name}: probe-args rejected by its schema; using schema-built arguments`);
            args = synthesised;
            first = retry;
            argsSource = "schema";
          }
        }
        const base = await callOnce(w, tool.name, args);
        const c1 = channels(first);
        const c2 = channels(base);
        // A channel that differs between two identical calls cannot say
        // anything about an argument; only the steady ones are compared.
        const steady = Object.keys(c2).filter((k) => c1[k] === c2[k]);
        const required = new Set(tool.inputSchema?.required ?? []);
        const argEffects = {};
        const variants = {};
        for (const [prop, schema] of Object.entries(tool.inputSchema?.properties ?? {})) {
          if (required.has(prop)) continue;
          const value = plausible(prop, schema, args[prop], { appId: w.appId });
          const v = await callOnce(w, tool.name, { ...args, [prop]: value });
          const cv = channels(v);
          const changed = steady.some((k) => cv[k] !== c2[k]) || (steady.length === 0 && Object.keys(cv).some((k) => cv[k] !== c2[k]));
          if (isInputRejection(v) && !isInputRejection(base)) {
            say(`  ${tool.name}.${prop}: probe value ${JSON.stringify(value).slice(0, 80)} rejected by the schema`);
          }
          argEffects[prop] = changed ? "changes" : "ignored";
          variants[prop] = { value, trace: v.trace };
        }
        probes[i] = { tool, args, argsSource, first, base, argEffects, variants, steady };
        say(`  ${tool.name}: ${Object.keys(argEffects).length} optional arg(s) probed`);
      }
    }),
  );
  await Promise.all(workers.map((w) => w.client.close()));

  fs.mkdirSync(screensDir, { recursive: true });
  const outDir = path.dirname(path.resolve(outFile));
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  });
  let renders;
  try {
    renders = await pool(probes, CONCURRENCY, async (p) => {
      const screenFile = (theme) => path.join(screensDir, `${p.tool.name}-${theme}.png`);
      try {
        return await renderTool(browser, uiTemplateFor, p.tool, { ...p.base, args: p.args }, screenFile);
      } catch (err) {
        return { crashed: String(err?.message ?? err).slice(0, 300), errors: [], themes: {}, renderer: "none", accessed: null, screenshots: [] };
      }
    });
  } finally {
    await browser.close();
  }

  const findings = new Map();
  const add = (check, tool, detail, message, severity) => {
    const id = `${check}|${tool}|${detail}`;
    if (!findings.has(id)) findings.set(id, { id, check, tool, message, severity });
  };
  const screenshots = [];
  const toolRows = [];
  for (let i = 0; i < probes.length; i += 1) {
    const p = probes[i];
    const r = renders[i];
    const name = p.tool.name;
    const sc = p.base.structured;
    const hasData = sc && typeof sc === "object" && Object.keys(sc).some((k) => !k.startsWith("_") && k !== "guidance");

    // 1. The generic default answered — the call proved nothing.
    const unmodeled = new Set();
    for (const call of [p.first, p.base, ...Object.values(p.variants)]) {
      for (const t of call.trace ?? []) if (!t.handled) unmodeled.add(t.name);
    }
    for (const backend of unmodeled) {
      add("fixture-default", name, backend, `the fixture's generic default: case answered backend call ${backend}, so this tool's probe proves nothing about its real output`, "block");
    }

    // 2–4. What the view did with the result.
    if (r.crashed) {
      add("render-error", name, "probe-crashed", `rendering crashed the probe: ${r.crashed}`, "block");
    }
    for (const e of r.errors) {
      const msg = e.message.replace(/\s+/g, " ").trim().slice(0, 160);
      add("render-error", name, `${e.stage}:${msg}`, `${e.stage === "dark" ? "dark" : "light"} render raised: ${msg}`, "block");
    }
    for (const [theme, a] of Object.entries(r.themes)) {
      if (a.blank) add("render-blank", name, `${theme}:blank`, `the ${theme} view has no visible text or element after the result was posted`, "block");
      if (a.skeleton) add("render-blank", name, `${theme}:skeleton`, `a loading skeleton is still visible ${SKELETON_GRACE_MS}ms after the result was posted (${theme})`, "block");
    }
    if (r.renderer === "generic" && hasData) {
      add("render-generic", name, "json-card", "the result fell through to the generic \"Result\" JSON card although it carried structured data", "warn");
    }

    // 5. Optional arguments accepted and dropped.
    for (const [prop, effect] of Object.entries(p.argEffects)) {
      if (effect !== "ignored") continue;
      add("arg-ignored", name, prop, `optional argument "${prop}" (probed with ${JSON.stringify(p.variants[prop].value).slice(0, 80)}) changed neither the text blocks, nor structuredContent, nor the backend call`, "block");
    }

    // 6. Fields the view never reads. A generic render prints them all as
    // JSON, which render-generic already reports.
    if (r.accessed && r.renderer !== "generic") {
      const seen = new Set(r.accessed);
      for (const f of presentFields(sc)) {
        if (seen.has(f.path)) continue;
        if (f.parent && !seen.has(f.parent)) continue;
        add("field-unrendered", name, f.path, `structuredContent.${f.path} is present but the view never reads it`, "warn");
      }
    }

    // 7. Off the design system's tokens.
    for (const [theme, a] of Object.entries(r.themes)) {
      for (const o of a.offToken ?? []) {
        add("style-offtoken", name, `${theme}:${o.prop}=${o.value}@${o.selector}`, `${theme}: ${o.prop} ${o.value} on ${o.selector} is not a design-system token`, "block");
      }
    }

    for (const s of r.screenshots) screenshots.push(path.relative(outDir, s));
    toolRows.push({ name, args: p.args, isError: p.base.isError, renderer: r.renderer, argEffects: p.argEffects });
  }

  const report = {
    generated_at: new Date().toISOString(),
    toolCount: tools.length,
    tools: toolRows,
    findings: [...findings.values()].sort((a, b) => a.id.localeCompare(b.id)),
    screenshots,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  const byCheck = {};
  for (const f of report.findings) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
  say(`surface-probe: ${report.findings.length} finding(s) ${JSON.stringify(byCheck)} in ${Math.round((Date.now() - started) / 1000)}s`);
  say(`wrote ${outFile}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`surface-probe: crashed: ${err?.stack ?? err}`);
    process.exit(1);
  },
);
