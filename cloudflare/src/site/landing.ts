/**
 * mcp.orchyn.com landing page.
 *
 * Written for two very different readers: a developer deciding whether to
 * connect this, and a connector reviewer checking that the server is what it
 * claims to be. So it states plainly what the tools do, which networks are
 * covered, what a call costs, and where the legal terms live — no claim on
 * this page that the server does not actually implement.
 */
import { page, esc, logoMark } from "./layout.js";
import { PLATFORMS, CLIENTS, platformIcon } from "./platforms.js";
import { TOOLS } from "./catalogue.js";

const CSS = `
.hero{padding:78px 0 22px;text-align:center;position:relative}
.hero::before{content:"";position:absolute;inset:-10% 0 40%;pointer-events:none;z-index:-1;
  background:radial-gradient(60% 55% at 50% 0%,var(--brand-soft),transparent 70%)}
.hero h1{font-size:clamp(34px,6.4vw,60px);max-width:19ch;margin:20px auto 0}
.hero h1 .hl{color:var(--brand)}
.hero .lede{margin:20px auto 0;font-size:clamp(16px,2.1vw,19px)}
.hero-cta{display:flex;gap:11px;justify-content:center;margin-top:30px;flex-wrap:wrap}
.copy-row{display:flex;align-items:center;gap:8px;margin:22px auto 0;max-width:31rem;
  background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:7px 8px 7px 17px}
.copy-row code{background:none;border:none;flex:1;text-align:left;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--fg)}

section{padding:52px 0}
.sec-head{text-align:center;max-width:40rem;margin:0 auto 34px}
.sec-head h2{font-size:clamp(24px,3.6vw,34px);margin:12px 0 0}
.sec-head p{color:var(--muted);margin:12px 0 0}

/* logo cloud */
.cloud{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
@media(min-width:640px){.cloud{grid-template-columns:repeat(4,1fr)}}
.plat{display:flex;flex-direction:column;gap:9px;align-items:flex-start;padding:17px;
  background:var(--panel);border:1px solid var(--border);border-radius:var(--r);transition:.16s}
.plat:hover{border-color:var(--brand);transform:translateY(-2px)}
.plat .ic{color:var(--fg);opacity:.92}
.plat b{font-size:14px;font-weight:600}
.plat span{font-size:12.5px;color:var(--muted);line-height:1.45}

/* steps */
.steps{counter-reset:s;display:grid;gap:16px}
@media(min-width:860px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{position:relative;padding:24px 22px 22px;background:var(--panel);
  border:1px solid var(--border);border-radius:var(--r)}
.step::before{counter-increment:s;content:counter(s);position:absolute;top:-13px;left:22px;
  width:28px;height:28px;border-radius:50%;background:var(--brand);color:#fff;
  display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.step h3{font-size:16px;margin:8px 0 7px}
.step p{margin:0;font-size:14px;color:var(--muted)}

/* tools */
.tool{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:20px}
.tool-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
/* The tool name is an unbreakable monospace identifier; let it wrap rather
   than shove the credit badge past the edge of the card. */
.tool h3{font-size:15px;font-family:var(--mono);font-weight:600;min-width:0;overflow-wrap:anywhere}
.cost{font-size:11px;font-weight:700;color:var(--brand);background:var(--brand-soft);
  border-radius:999px;padding:3px 9px;white-space:nowrap}
.tool p{margin:0;font-size:13.5px;color:var(--muted)}
.free-badge{font-size:11px;color:var(--good);font-weight:600;margin-top:9px;display:block}

/* clients */
.clients{display:grid;gap:12px;grid-template-columns:repeat(2,1fr)}
@media(min-width:860px){.clients{grid-template-columns:repeat(4,1fr)}}
.client{padding:16px;border:1px solid var(--border);border-radius:var(--r);background:var(--panel)}
.client b{display:block;font-size:14px}
.client span{font-size:12.5px;color:var(--muted)}

/* pricing */
.prices{display:grid;gap:17px}
@media(min-width:860px){.prices{grid-template-columns:repeat(3,1fr)}}
.price{border:1px solid var(--border);border-radius:var(--r-lg);padding:27px;
  background:var(--panel);position:relative;display:flex;flex-direction:column}
.price.hot{border-color:var(--brand);box-shadow:var(--shadow)}
.tag{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:var(--brand);
  color:#fff;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;font-weight:700;
  padding:4px 11px;border-radius:999px}
.price h3{font-size:16px}
.amt{font-size:38px;font-weight:800;letter-spacing:-.03em;margin:9px 0 2px}
.per{color:var(--muted);font-size:13.5px}
.price ul{list-style:none;padding:0;margin:18px 0 22px;flex:1}
.price li{font-size:13.5px;color:var(--muted);padding:5px 0 5px 23px;position:relative}
.price li::before{content:"";position:absolute;left:0;top:12px;width:11px;height:2px;
  background:var(--brand);border-radius:2px}

/* install */
.tabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:15px}
.tab{padding:8px 15px;border-radius:999px;border:1px solid var(--border);background:var(--panel);
  font-size:13.5px;font-weight:600;cursor:pointer;color:var(--muted);font-family:inherit}
.tab[aria-selected="true"]{background:var(--brand);border-color:var(--brand);color:#fff}
.pane{display:none}.pane.on{display:block}
.pane p{font-size:14px;color:var(--muted);margin:0 0 11px}

.faq details{border:1px solid var(--border);border-radius:var(--r);background:var(--panel);
  padding:15px 19px;margin-bottom:10px}
.faq summary{cursor:pointer;font-weight:600;font-size:14.5px;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";float:right;color:var(--brand);font-weight:700}
.faq details[open] summary::after{content:"–"}
.faq p{margin:11px 0 0;font-size:14px;color:var(--muted)}
`;

const SCRIPT = `
document.querySelectorAll('.tab').forEach(function(t){
  t.addEventListener('click',function(){
    var g=t.getAttribute('data-group');
    document.querySelectorAll('.tab[data-group="'+g+'"]').forEach(function(x){
      x.setAttribute('aria-selected', String(x===t));
    });
    document.querySelectorAll('.pane[data-group="'+g+'"]').forEach(function(p){
      p.classList.toggle('on', p.getAttribute('data-pane')===t.getAttribute('data-pane'));
    });
  });
});
document.querySelectorAll('[data-copy]').forEach(function(b){
  b.addEventListener('click',function(){
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){
      var o=b.textContent; b.textContent='Copied'; setTimeout(function(){b.textContent=o;},1400);
    }).catch(function(){});
  });
});
`;

export function landingPage(publicUrl: string, orchynBase: string): string {
  const cloud = PLATFORMS.map(
    (p) =>
      `<div class="plat"><span class="ic">${platformIcon(p, 24)}</span>` +
      `<b>${esc(p.name)}</b><span>${esc(p.supports)}</span></div>`
  ).join("");

  const tools = TOOLS.filter((t) => t.cost > 0)
    .sort((a, b) => a.cost - b.cost)
    .map(
      (t) =>
        `<div class="tool"><div class="tool-top"><h3>${esc(t.name)}</h3>` +
        `<span class="cost">${t.cost} cr</span></div><p>${esc(t.desc)}</p>` +
        (t.freeFirstUse ? `<span class="free-badge">First use free</span>` : "") +
        `</div>`
    ).join("");

  const clients = CLIENTS.map(
    (c) => `<div class="client"><b>${esc(c.name)}</b><span>${esc(c.note)}</span></div>`
  ).join("");

  const body =
    `<main>` +
    // ── hero ──
    `<div class="wrap"><section class="hero">` +
    `<span class="eyebrow">${logoMark(13)} Model Context Protocol server</span>` +
    `<h1>Give your AI <span class="hl">eyes on social</span></h1>` +
    `<p class="lede">Orchyn MCP lets Claude, ChatGPT and Cursor pull real posts from ten networks — video, slideshows, comments, creators and sounds — and reason over what they actually contain.</p>` +
    `<div class="hero-cta">` +
    `<a class="btn btn-primary" href="#install">Connect your assistant</a>` +
    `<a class="btn btn-ghost" href="#pricing">See pricing</a></div>` +
    `<div class="copy-row"><code>npx -y @orchyn/mcp login</code>` +
    `<button class="btn btn-ghost btn-sm" data-copy="npx -y @orchyn/mcp login">Copy</button></div>` +
    `<p class="faint" style="margin-top:14px;font-size:13px">20 free credits on signup · every AI tool free once · no card to start</p>` +
    `</section></div>` +

    // ── platforms ──
    `<div class="wrap"><section id="platforms">` +
    `<div class="sec-head"><span class="eyebrow">Coverage</span>` +
    `<h2>Ten networks, one interface</h2>` +
    `<p>Ask in plain language. Orchyn resolves the URL, fetches the media and hands your assistant structured data it can reason about.</p></div>` +
    `<div class="cloud">${cloud}</div></section></div>` +

    // ── how ──
    `<div class="wrap"><section id="how">` +
    `<div class="sec-head"><span class="eyebrow">How it works</span>` +
    `<h2>Three steps to a connected assistant</h2></div>` +
    `<div class="steps">` +
    `<div class="step"><h3>Connect</h3><p>Add the connector URL, or run the npm package. Sign in with Orchyn over OAuth 2.1 — no API keys to paste or rotate.</p></div>` +
    `<div class="step"><h3>Ask</h3><p>"What's the hook in this TikTok?" · "Find fitness creators under 50k" · "What audio is trending in beauty?"</p></div>` +
    `<div class="step"><h3>Get real answers</h3><p>Posts come back with playable media and inline cards, so the assistant reasons over the content itself — not a guess from the URL.</p></div>` +
    `</div></section></div>` +

    // ── tools ──
    `<div class="wrap"><section id="tools">` +
    `<div class="sec-head"><span class="eyebrow">Tools</span>` +
    `<h2>Every tool your assistant can call</h2>` +
    `<p>Priced in credits. You are only ever charged for a call that succeeds — failures are refunded automatically.</p></div>` +
    `<div class="grid g3">${tools}</div></section></div>` +

    // ── clients ──
    `<div class="wrap"><section>` +
    `<div class="sec-head"><span class="eyebrow">Works with</span><h2>Any MCP client</h2></div>` +
    `<div class="clients">${clients}</div></section></div>` +

    // ── pricing ──
    `<div class="wrap"><section id="pricing">` +
    `<div class="sec-head"><span class="eyebrow">Pricing</span>` +
    `<h2>Pay for what you use</h2>` +
    `<p>Credits never expire. Top up from your assistant with <code>buy_orchyn_credits</code> or from the dashboard.</p></div>` +
    `<div class="prices">` +
    `<div class="price"><h3>Starter</h3><div class="amt">$15</div>` +
    `<div class="per">600 credits · $0.025 each</div>` +
    `<ul><li>600 post lookups</li><li>300 discovery searches</li><li>~100 AI analyses</li></ul>` +
    `<a class="btn btn-ghost" href="/dashboard?buy=starter">Choose Starter</a></div>` +
    `<div class="price hot"><span class="tag">Most popular</span><h3>Pro</h3><div class="amt">$40</div>` +
    `<div class="per">2,000 credits · $0.020 each</div>` +
    `<ul><li>~333 AI analyses</li><li>~1,000 discovery searches</li><li>Best value for daily use</li></ul>` +
    `<a class="btn btn-primary" href="/dashboard?buy=pro">Choose Pro</a></div>` +
    `<div class="price"><h3>Scale</h3><div class="amt">$85</div>` +
    `<div class="per">5,000 credits · $0.017 each</div>` +
    `<ul><li>~833 AI analyses</li><li>~2,500 discovery searches</li><li>For agents running unattended</li></ul>` +
    `<a class="btn btn-ghost" href="/dashboard?buy=scale">Choose Scale</a></div>` +
    `</div>` +
    `<p class="faint" style="text-align:center;margin-top:20px;font-size:13px">` +
    `Payments are handled by Stripe. Orchyn never sees or stores your card details.</p>` +
    `</section></div>` +

    // ── install ──
    `<div class="wrap"><section id="install">` +
    `<div class="sec-head"><span class="eyebrow">Install</span><h2>Connect in under a minute</h2></div>` +
    `<div class="panel" style="max-width:52rem;margin:0 auto">` +
    `<div class="tabs" role="tablist">` +
    `<button class="tab" data-group="i" data-pane="claude" role="tab" aria-selected="true">Claude.ai</button>` +
    `<button class="tab" data-group="i" data-pane="code" role="tab" aria-selected="false">Claude Code</button>` +
    `<button class="tab" data-group="i" data-pane="gpt" role="tab" aria-selected="false">ChatGPT</button>` +
    `<button class="tab" data-group="i" data-pane="cursor" role="tab" aria-selected="false">Cursor</button>` +
    `</div>` +
    `<div class="pane on" data-group="i" data-pane="claude">` +
    `<p>Settings → Connectors → <strong>Add custom connector</strong>, then paste this URL and sign in when prompted.</p>` +
    `<pre><code>${esc(publicUrl)}/mcp</code></pre></div>` +
    `<div class="pane" data-group="i" data-pane="code">` +
    `<p>From the Claude Code prompt:</p>` +
    `<pre><code>/plugin marketplace add orchynX/mcp\n/plugin install orchyn@orchyn</code></pre></div>` +
    `<div class="pane" data-group="i" data-pane="gpt">` +
    `<p>Settings → Connectors → Advanced → <strong>Developer mode</strong>, then add:</p>` +
    `<pre><code>${esc(publicUrl)}/mcp</code></pre></div>` +
    `<div class="pane" data-group="i" data-pane="cursor">` +
    `<p>Add to <code>~/.cursor/mcp.json</code>:</p>` +
    `<pre><code>{\n  "mcpServers": {\n    "orchyn": {\n      "command": "npx",\n      "args": ["-y", "@orchyn/mcp"]\n    }\n  }\n}</code></pre></div>` +
    `</div></section></div>` +

    // ── faq ──
    `<div class="wrap"><section class="faq">` +
    `<div class="sec-head"><span class="eyebrow">Questions</span><h2>Before you connect</h2></div>` +
    `<div style="max-width:46rem;margin:0 auto">` +
    faq("What data does Orchyn access?", "Only public posts you or your assistant explicitly ask for, by URL or search. Orchyn never reads your private messages, drafts or account data, and never posts on your behalf.") +
    faq("Do I need a credit card to try it?", "No. New accounts get 20 credits, and every AI analysis tool is free the first time you use it. You only pay when you choose to top up.") +
    faq("What happens if a tool call fails?", "You are not charged. Failed calls are refunded to your balance automatically, and a call interrupted mid-flight is billed once at most, never twice.") +
    faq("Where is my usage visible?", `Your <a href="/dashboard" style="color:var(--brand)">dashboard</a> shows balance, credits spent, calls per tool and recent activity. Your assistant can also call <code>check_orchyn_credits</code> at any time.`) +
    faq("Can I revoke access?", `Yes. Disconnect the connector in your AI client, or email <a href="mailto:support@orchyn.com" style="color:var(--brand)">support@orchyn.com</a> to have the account and its data deleted.`) +
    faq("How is authentication handled?", "OAuth 2.1 with PKCE and dynamic client registration. Your assistant receives a scoped access token; Orchyn never asks you to paste a long-lived API key into a chat window.") +
    `</div></section></div>` +

    // ── final cta ──
    `<div class="wrap"><section>` +
    `<div class="panel" style="text-align:center;padding:46px 26px;border-radius:var(--r-lg)">` +
    `<h2 style="font-size:clamp(22px,3.4vw,30px)">Start with 20 free credits</h2>` +
    `<p class="muted" style="margin:12px auto 0;max-width:32rem">No card required. Connect your assistant and ask it about any post you like.</p>` +
    `<div class="hero-cta"><a class="btn btn-primary" href="#install">Connect your assistant</a>` +
    `<a class="btn btn-ghost" href="/dashboard">Open dashboard</a></div></div>` +
    `</section></div>` +
    `</main>`;

  return page(
    {
      title: "Orchyn MCP — Social intelligence for AI agents",
      publicUrl,
      css: CSS,
      script: SCRIPT,
      canonicalPath: "/",
    },
    body
  );
}

function faq(q: string, a: string): string {
  return `<details><summary>${esc(q)}</summary><p>${a}</p></details>`;
}
