/**
 * Shared shell for every page mcp.orchyn.com serves.
 *
 * The MCP site is its own product surface — landing, legal and dashboard —
 * so it owns its own look rather than borrowing orchyn.com's. It stores no
 * data of its own: the dashboard reads everything from the orchyn API with
 * the user's bearer token.
 *
 * Everything is inlined (no CDN, no build step) because the Worker serves
 * these pages directly and a connector review will fetch them cold.
 */

export const BRAND = {
  name: "Orchyn MCP",
  tagline: "Social intelligence for AI agents",
  supportEmail: "support@orchyn.com",
  company: "Orchyn",
} as const;

/** Orchyn starburst mark. */
export function logoMark(size = 28): string {
  return (
    `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" aria-hidden="true">` +
    `<g fill="currentColor" transform="translate(24 24)"><circle r="4.1"/>` +
    `<g id="ray"><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g>` +
    [45, 90, 135, 180, 225, 270, 315]
      .map((d) => `<use href="#ray" transform="rotate(${d})"/>`)
      .join("") +
    `</g></svg>`
  );
}

/**
 * One stylesheet for the whole site. Dark-first with a light-mode override,
 * because the people installing this live in dark IDEs — but a reviewer on a
 * default-light machine still gets a deliberate design rather than an
 * inverted accident.
 */
const CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{
  --bg:#08090c;--bg-soft:#0e1016;--panel:#12141c;--panel-2:#171a24;
  --fg:#f4f5f7;--muted:#9aa1ae;--faint:#6b7280;
  --border:#232734;--border-soft:#1b1f2a;
  --brand:#ff4d23;--brand-soft:rgba(255,77,35,.12);
  --good:#34d399;--warn:#fbbf24;--bad:#f87171;--info:#60a5fa;
  --r:14px;--r-sm:9px;--r-lg:22px;
  --max:74rem;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 8px 32px rgba(0,0,0,.32);
  --font:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  color-scheme:dark;
}
@media(prefers-color-scheme:light){:root{
  --bg:#ffffff;--bg-soft:#f7f8fa;--panel:#ffffff;--panel-2:#f4f5f7;
  --fg:#0d0f14;--muted:#5b6472;--faint:#8b94a3;
  --border:#e4e7ec;--border-soft:#eef0f4;
  --shadow:0 1px 2px rgba(16,24,40,.05),0 12px 32px rgba(16,24,40,.08);
  color-scheme:light;
}}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);
  line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}
img,svg{max-width:100%}
.wrap{max-width:var(--max);margin:0 auto;padding:0 24px;width:100%}

/* ── header ── */
header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--border-soft)}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:62px;gap:16px}
.logo{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em;flex-shrink:0}
.logo .logo-mark{color:var(--brand);flex-shrink:0}
.logo small{font-weight:600;letter-spacing:.1em;font-size:9px;color:var(--muted);
  text-transform:uppercase;border:1px solid var(--border);border-radius:5px;padding:2px 5px}
nav.links{display:none;gap:26px;font-size:14px;color:var(--muted);font-weight:500}
nav.links a:hover{color:var(--fg)}
@media(min-width:900px){nav.links{display:flex}}
.head-cta{display:flex;gap:9px;align-items:center;flex-shrink:0}
/* Below ~360px the logo plus two buttons cannot fit; drop the secondary one
   rather than letting the header push the whole page sideways. */
@media(max-width:379px){
  .head-cta .btn:not(.btn-primary){display:none}
  .wrap{padding:0 16px}
}

/* ── buttons ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;
  padding:10px 17px;border-radius:999px;font-weight:600;font-size:14px;
  border:1px solid transparent;cursor:pointer;transition:.16s ease;white-space:nowrap;
  font-family:inherit}
.btn-primary{background:var(--brand);color:#fff}
.btn-primary:hover{filter:brightness(1.08);transform:translateY(-1px)}
.btn-ghost{border-color:var(--border);background:var(--panel);color:var(--fg)}
.btn-ghost:hover{border-color:var(--muted)}
.btn-sm{padding:7px 13px;font-size:13px}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}

/* ── type ── */
h1,h2,h3{letter-spacing:-.028em;line-height:1.15;margin:0}
.eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;
  letter-spacing:.06em;text-transform:uppercase;color:var(--brand);
  background:var(--brand-soft);border-radius:999px;padding:5px 13px}
.lede{color:var(--muted);font-size:18px;max-width:40rem}
code,kbd{font-family:var(--mono);font-size:.86em;background:var(--panel-2);
  border:1px solid var(--border-soft);padding:2px 6px;border-radius:6px}
pre{font-family:var(--mono);background:var(--panel);border:1px solid var(--border);
  border-radius:var(--r);padding:16px 18px;overflow-x:auto;font-size:13px;margin:0;line-height:1.65}
pre code{background:none;border:none;padding:0;font-size:inherit}

/* ── surfaces ── */
.panel{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:22px}
.grid{display:grid;gap:18px}
/* Grid and flex items default to min-width:auto, so a long unbreakable word
   (a monospace tool name, say) makes the track wider than its share and
   pushes the whole page sideways. Let tracks shrink instead. */
.grid>*,.cols>*,.stats>*,.cloud>*,.steps>*,.clients>*,.prices>*{min-width:0}
@media(min-width:720px){.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}}
@media(min-width:1000px){.g4{grid-template-columns:repeat(4,1fr)}}
.muted{color:var(--muted)}
.faint{color:var(--faint)}
.mono{font-family:var(--mono)}
.tabnum{font-variant-numeric:tabular-nums}

/* ── footer ── */
footer{border-top:1px solid var(--border-soft);margin-top:72px;padding:38px 0 46px;
  color:var(--muted);font-size:13.5px;background:var(--bg-soft)}
footer .cols{display:grid;gap:26px;grid-template-columns:1fr}
@media(min-width:760px){footer .cols{grid-template-columns:2fr 1fr 1fr 1fr}}
footer h4{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--fg);margin:0 0 11px}
footer a{display:block;padding:3.5px 0}
footer a:hover{color:var(--fg)}
.legal-bar{margin-top:30px;padding-top:20px;border-top:1px solid var(--border-soft);
  display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;font-size:12.5px}

/* ── legal / prose ── */
.prose{max-width:46rem;margin:0 auto}
.prose h1{font-size:34px;margin-bottom:10px}
.prose h2{font-size:20px;margin:38px 0 10px}
.prose h3{font-size:16px;margin:24px 0 6px}
.prose p,.prose li{color:var(--muted);font-size:15px}
.prose ul{padding-left:22px}
.prose li{margin:5px 0}
.prose strong{color:var(--fg);font-weight:600}
/* Wide tables scroll inside their own box rather than widening the page. */
.prose table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;
  display:block;overflow-x:auto;white-space:nowrap}
@media(min-width:640px){.prose table{display:table;white-space:normal}}
.prose th,.prose td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--border-soft)}
.prose th{color:var(--fg);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.prose td{color:var(--muted)}
`;

export interface PageOpts {
  title: string;
  description?: string;
  publicUrl: string;
  /** Extra <style> appended after the base sheet. */
  css?: string;
  /** Script injected before </body>. */
  script?: string;
  /** Hide the marketing nav (dashboard uses its own). */
  bareNav?: boolean;
  canonicalPath?: string;
}

export function page(opts: PageOpts, body: string): string {
  const desc =
    opts.description ??
    "Give Claude, ChatGPT and Cursor the ability to fetch, discover and understand posts across TikTok, Instagram, YouTube, X, Douyin, Xiaohongshu, Bilibili and LinkedIn.";
  const canonical = opts.publicUrl + (opts.canonicalPath ?? "");
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(opts.title)}</title>` +
    `<meta name="description" content="${esc(desc)}">` +
    `<link rel="canonical" href="${esc(canonical)}">` +
    `<meta property="og:title" content="${esc(opts.title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:type" content="website">` +
    `<meta property="og:url" content="${esc(canonical)}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><g fill="#ff4d23" transform="translate(24 24)"><circle r="4.1"/><path d="M-2.85 -5.2 L0 -20.6 L2.85 -5.2 L1.15 1.1 L-1.15 1.1 Z"/></g></svg>`
    )}">` +
    `<style>${CSS}${opts.css ?? ""}</style></head><body>` +
    header(opts.publicUrl, opts.bareNav) +
    body +
    footer(opts.publicUrl) +
    (opts.script ? `<script>${opts.script}</script>` : "") +
    `</body></html>`
  );
}

function header(publicUrl: string, bare?: boolean): string {
  const links = bare
    ? ""
    : `<nav class="links">` +
      `<a href="/#how">How it works</a>` +
      `<a href="/#tools">Tools</a>` +
      `<a href="/#platforms">Platforms</a>` +
      `<a href="/#pricing">Pricing</a>` +
      `<a href="/#install">Install</a>` +
      `<a href="/documentation">Docs</a>` +
      `</nav>`;
  return (
    `<header><div class="wrap">` +
    `<a class="logo" href="/">${logoMark(26)}<span>Orchyn</span><small>MCP</small></a>` +
    links +
    `<div class="head-cta">` +
    `<a class="btn btn-ghost btn-sm" href="/dashboard">Dashboard</a>` +
    `<a class="btn btn-primary btn-sm" href="/#install">Connect</a>` +
    `</div></div></header>`
  );
}

function footer(publicUrl: string): string {
  const year = new Date().getUTCFullYear();
  return (
    `<footer><div class="wrap"><div class="cols">` +
    `<div><a class="logo" href="/" style="margin-bottom:12px">${logoMark(24)}<span>Orchyn</span><small>MCP</small></a>` +
    `<p class="muted" style="margin:0;max-width:22rem;font-size:13.5px">${esc(BRAND.tagline)}. An MCP server that lets AI assistants read and analyse public social posts.</p></div>` +
    `<div><h4>Product</h4><a href="/#tools">Tools</a><a href="/#pricing">Pricing</a><a href="/dashboard">Dashboard</a><a href="/health">Status</a></div>` +
    `<div><h4>Developers</h4><a href="/documentation">Documentation</a><a href="/#install">Install</a><a href="https://www.npmjs.com/package/@orchyn/mcp" rel="noopener">npm package</a><a href="https://github.com/orchynX/mcp" rel="noopener">GitHub</a><a href="/.well-known/oauth-authorization-server">OAuth metadata</a></div>` +
    `<div><h4>Legal</h4><a href="/terms">Terms of Use</a><a href="/privacy">Privacy Policy</a><a href="mailto:${esc(BRAND.supportEmail)}">Contact</a></div>` +
    `</div><div class="legal-bar"><span>© ${year} ${esc(BRAND.company)}. All rights reserved.</span>` +
    `<span class="faint">${esc(publicUrl.replace(/^https?:\/\//, ""))}</span></div></div></footer>`
  );
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
