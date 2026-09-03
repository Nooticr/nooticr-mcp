/**
 * Public documentation for mcp.nooticr.com.
 *
 * Two audiences, in this order:
 *
 *   1. An IT administrator deciding whether to approve this server for their
 *      organisation. They need to know what it reaches, what it cannot do,
 *      where data goes, and how access is revoked — before anything else. So
 *      that section comes first and answers plainly, including the negatives.
 *   2. A developer or creator wiring it up and choosing between tools.
 *
 * Every factual claim here has to match the implementation. The tool table is
 * generated from the shared catalogue rather than retyped, and tests pin the
 * prices to what nooticr-server charges.
 */
import { page, esc, BRAND } from "./layout.js";
import { PLATFORMS } from "./platforms.js";
import { GROUPS, PACKS, TOOLS, toolsIn } from "./catalogue.js";

const CSS = `
.doc{display:grid;gap:34px;padding:38px 0 10px}
@media(min-width:1000px){.doc{grid-template-columns:224px 1fr;gap:46px;align-items:start}}
.toc{display:none}
@media(min-width:1000px){
  .toc{display:block;position:sticky;top:82px;font-size:13.5px}
  .toc a{display:block;padding:5px 0;color:var(--muted);border-left:2px solid transparent;padding-left:12px}
  .toc a:hover{color:var(--fg);border-left-color:var(--brand)}
  .toc .grp{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--faint);
    font-weight:700;margin:18px 0 6px;padding-left:12px}
  .toc .grp:first-child{margin-top:0}
}
.doc-body{min-width:0;max-width:52rem}
.doc-body h2{font-size:24px;margin:44px 0 12px;scroll-margin-top:86px}
.doc-body h2:first-child{margin-top:0}
.doc-body h3{font-size:17px;margin:26px 0 8px;scroll-margin-top:86px}
.doc-body p,.doc-body li{color:var(--muted);font-size:15px;line-height:1.65}
.doc-body ul{padding-left:22px}
.doc-body li{margin:6px 0}
.doc-body strong{color:var(--fg);font-weight:600}
.doc-body a:not(.btn){color:var(--brand)}
.doc-body a:not(.btn):hover{text-decoration:underline}

.lead{font-size:17px;color:var(--muted);line-height:1.6;margin-bottom:8px}
.callout{border:1px solid var(--border);border-left:3px solid var(--brand);border-radius:var(--r-sm);
  background:var(--panel);padding:15px 18px;margin:18px 0}
.callout p{margin:0;font-size:14.5px}
.callout.good{border-left-color:var(--good)}

table.doc-t{width:100%;border-collapse:collapse;font-size:14px;margin:14px 0;
  display:block;overflow-x:auto;white-space:nowrap}
@media(min-width:720px){table.doc-t{display:table;white-space:normal}}
table.doc-t th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--muted);font-weight:700;padding:10px 12px;border-bottom:1px solid var(--border)}
table.doc-t td{padding:11px 12px;border-bottom:1px solid var(--border-soft);color:var(--muted);
  vertical-align:top}
table.doc-t td:first-child{color:var(--fg)}
table.doc-t code{font-size:12.5px;white-space:nowrap}
.cost-cell{font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600;color:var(--brand)}
.free-note{display:block;font-size:11px;color:var(--good);font-weight:600;margin-top:2px}

.yesno{display:grid;gap:14px;margin:18px 0}
@media(min-width:700px){.yesno{grid-template-columns:1fr 1fr}}
.yesno>div{border:1px solid var(--border);border-radius:var(--r);padding:17px;background:var(--panel)}
.yesno h4{margin:0 0 9px;font-size:13px;text-transform:uppercase;letter-spacing:.06em}
.yesno .does h4{color:var(--good)}
.yesno .nope h4{color:var(--bad)}
.yesno ul{margin:0;padding-left:19px}
.yesno li{font-size:14px;margin:5px 0}

.grp-head{margin:30px 0 6px}
.grp-head h3{margin:0}
.grp-head p{margin:3px 0 0;font-size:14px}
`;

const SCRIPT = `
// Highlight the section currently on screen in the table of contents.
var links = [].slice.call(document.querySelectorAll('.toc a[href^="#"]'));
var heads = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
function sync() {
  var best = 0;
  heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 140) best = i; });
  links.forEach(function (a, i) {
    a.style.color = i === best ? 'var(--fg)' : '';
    a.style.borderLeftColor = i === best ? 'var(--brand)' : '';
  });
}
document.addEventListener('scroll', sync, { passive: true });
sync();
`;

interface Section {
  id: string;
  title: string;
  group?: string;
  body: string;
}

export function documentationPage(publicUrl: string, nooticrBase: string): string {
  const host = esc(publicUrl.replace(/^https?:\/\//, ""));
  const platformNames = PLATFORMS.map((p) => p.name).join(", ");

  const toolTable = (group: (typeof GROUPS)[number]) => {
    const rows = toolsIn(group.id)
      .map(
        (t) =>
          `<tr><td><code>${esc(t.name)}</code></td>` +
          `<td class="cost-cell">${t.cost === 0 ? "Free" : `${t.cost} cr`}` +
          (t.freeFirstUse ? `<span class="free-note">1st use free</span>` : "") +
          `</td>` +
          `<td><code>${esc(t.args ?? "—")}</code></td>` +
          `<td>${esc(t.desc)}${t.when ? `<br><span style="opacity:.75">${esc(t.when)}</span>` : ""}</td></tr>`
      )
      .join("");
    return (
      `<div class="grp-head"><h3 id="tools-${group.id}">${esc(group.title)}</h3>` +
      `<p>${esc(group.blurb)}</p></div>` +
      `<table class="doc-t"><thead><tr><th>Tool</th><th>Cost</th><th>Inputs</th><th>What it does</th></tr></thead>` +
      `<tbody>${rows}</tbody></table>`
    );
  };

  const sections: Section[] = [
    {
      id: "overview",
      title: "Overview",
      group: "Start here",
      body:
        `<p class="lead">Nooticr MCP is a Model Context Protocol server that lets an AI assistant read public social posts across ${PLATFORMS.length} networks and act on what it finds.</p>` +
        `<p>It connects over Streamable HTTP at <code>${esc(publicUrl)}/mcp</code>, authenticates with OAuth 2.1, and exposes ${TOOLS.length} tools. Assistants use it to fetch a post's media and spoken transcript, read its comment section, survey a niche, and then produce work from that: alternative hooks, variants to film, a draft scored before publication.</p>` +
        `<p>Networks covered: ${esc(platformNames)}.</p>`,
    },
    {
      id: "admins",
      title: "For IT administrators",
      group: "Start here",
      body:
        `<p>If you are deciding whether to approve this server for your organisation, this section is the short version. Everything here is enforced in the implementation, not policy alone.</p>` +
        `<div class="yesno">` +
        `<div class="does"><h4>What it does</h4><ul>` +
        `<li>Reads <strong>public</strong> posts your users or their assistant explicitly request, by URL or search term</li>` +
        `<li>Runs AI analysis over that retrieved content</li>` +
        `<li>Draws on the signed-in user's own credit balance</li>` +
        `<li>Returns structured data and rendered cards to the assistant</li>` +
        `</ul></div>` +
        `<div class="nope"><h4>What it cannot do</h4><ul>` +
        `<li><strong>Connect to any social account.</strong> It holds no social credentials and has no such capability</li>` +
        `<li><strong>Post, comment, like, follow or message</strong> anywhere, on anyone's behalf</li>` +
        `<li>Read private messages, drafts, or non-public profile data</li>` +
        `<li>Access anything on the user's device or network</li>` +
        `<li>Reach other systems in your environment — it only calls out to the services listed below</li>` +
        `</ul></div></div>` +
        `<div class="callout good"><p><strong>Every tool is read-only with respect to your organisation's data.</strong> The only state it writes is the user's own Nooticr credit ledger. The MCP tool annotations declare this: all 24 tools carry <code>destructiveHint: false</code>, and all but the two account actions carry <code>readOnlyHint: true</code>.</p></div>` +

        `<h3 id="admins-access">Access and revocation</h3>` +
        `<p>Authentication is OAuth 2.1 with PKCE (S256) and dynamic client registration. No API key is ever pasted into a chat window. Tokens are scoped and expiring.</p>` +
        `<p>Two scopes are granted, and they describe exactly what the tools do:</p>` +
        `<ul><li><code>social:read</code> — read public posts, transcripts, comments, creators, sounds and hashtags</li>` +
        `<li><code>credits:spend</code> — run AI tools and open a checkout, both of which draw on the user's credit balance</li></ul>` +
        `<p><strong>To revoke:</strong> the user removes the connector in their AI client, which invalidates its tokens immediately. To remove the account and its data entirely, email <a href="mailto:${esc(BRAND.supportEmail)}">${esc(BRAND.supportEmail)}</a>.</p>` +

        `<h3 id="admins-data">Data handling</h3>` +
        `<table class="doc-t"><thead><tr><th>Data</th><th>Stored?</th><th>Retention</th></tr></thead><tbody>` +
        `<tr><td>Account identity (email, display name, user id)</td><td>Yes</td><td>Until the account is deleted</td></tr>` +
        `<tr><td>OAuth tokens issued to the AI client</td><td>Yes</td><td>Until expiry or revocation</td></tr>` +
        `<tr><td>Credit ledger (tool name, credits, timestamp)</td><td>Yes</td><td>Retained as a financial record</td></tr>` +
        `<tr><td>URLs and search terms passed to tools</td><td>No</td><td>Processed, not retained after the call</td></tr>` +
        `<tr><td><strong>Content of retrieved posts</strong></td><td><strong>No</strong></td><td>Streamed through; media cached only transiently so it can be displayed</td></tr>` +
        `<tr><td>Chat conversation content</td><td>No</td><td>The server sees the tool call, not the surrounding conversation</td></tr>` +
        `<tr><td>Payment card details</td><td>No</td><td>Stripe handles payment; Nooticr receives only a reference</td></tr>` +
        `<tr><td>Operational logs (timestamps, status codes, errors)</td><td>Yes</td><td>Up to 30 days</td></tr>` +
        `</tbody></table>` +
        `<p>Data is not sold, not shared for advertising, and not used to train models.</p>` +

        `<h3 id="admins-subprocessors">Subprocessors and egress</h3>` +
        `<p>The server calls out to these services and no others:</p>` +
        `<table class="doc-t"><thead><tr><th>Service</th><th>Purpose</th></tr></thead><tbody>` +
        `<tr><td>Cloudflare</td><td>Hosting and edge delivery of this server</td></tr>` +
        `<tr><td>${esc(nooticrBase.replace(/^https?:\/\//, ""))}</td><td>The Nooticr API — accounts, credits, tool execution</td></tr>` +
        `<tr><td>Stripe</td><td>Payment processing</td></tr>` +
        `<tr><td>Social data provider</td><td>Retrieving public posts from the supported networks</td></tr>` +
        `<tr><td>AI provider</td><td>The analysis and generation tools</td></tr>` +
        `</tbody></table>` +
        `<p>If you allowlist egress, the assistant only needs to reach <code>${host}</code>. Everything else is server-to-server.</p>` +

        `<h3 id="admins-cost">Cost control</h3>` +
        `<p>Spend is bounded by the user's prepaid credit balance — there is no invoice, no overage and no auto-renewal. A user cannot spend more than they have loaded. Every tool declares its price in its own description and in <code>_meta.nooticr/creditCost</code>, so an assistant can budget before calling. Failed calls are refunded automatically, and a call interrupted mid-flight is billed once at most.</p>` +

        `<h3 id="admins-content">Third-party content</h3>` +
        `<p>Retrieved posts are published by third parties and may contain personal data about the people who published them. Nooticr processes it only to answer the request. Your users are responsible for using it lawfully — see the <a href="/terms">acceptable use section of the Terms</a>. Nooticr is not affiliated with, endorsed by or sponsored by any of the platforms; their names and marks identify coverage only.</p>` +

        `<p style="margin-top:20px"><a class="btn btn-ghost" href="/privacy">Privacy Policy</a> <a class="btn btn-ghost" href="/terms">Terms of Use</a></p>`,
    },
    {
      id: "connect",
      title: "Connecting",
      group: "Start here",
      body:
        `<h3 id="connect-claude">Claude.ai and Claude Desktop</h3>` +
        `<p>Settings → Connectors → <strong>Add custom connector</strong>, then paste:</p>` +
        `<pre><code>${esc(publicUrl)}/mcp</code></pre>` +
        `<p>Sign in with Nooticr when prompted. No key to copy.</p>` +
        `<h3 id="connect-code">Claude Code</h3>` +
        `<pre><code>/plugin marketplace add orchynX/nooticr-mcp\n/plugin install nooticr@nooticr</code></pre>` +
        `<h3 id="connect-gpt">ChatGPT</h3>` +
        `<p>Settings → Connectors → Advanced → <strong>Developer mode</strong>, then add the same URL.</p>` +
        `<h3 id="connect-stdio">Cursor and other stdio clients</h3>` +
        `<pre><code>{\n  "mcpServers": {\n    "nooticr": {\n      "command": "npx",\n      "args": ["-y", "@nooticr/mcp"]\n    }\n  }\n}</code></pre>` +
        `<p>Then <code>npx -y @nooticr/mcp login</code> once to sign in.</p>`,
    },
    {
      id: "tools",
      title: "Tool reference",
      group: "Reference",
      body:
        `<p>${TOOLS.length} tools. Costs are in credits and match what the server charges; an argument marked <code>?</code> is optional.</p>` +
        GROUPS.map(toolTable).join(""),
    },
    {
      id: "billing",
      title: "Billing",
      group: "Reference",
      body:
        `<p>Usage is prepaid in credits. New accounts start with <strong>20 free credits</strong>, and each AI tool is <strong>free the first time</strong> you use it.</p>` +
        `<table class="doc-t"><thead><tr><th>Pack</th><th>Price</th><th>Credits</th><th>Per credit</th></tr></thead><tbody>` +
        PACKS.map(
          (p) =>
            `<tr><td>${esc(p.name)}</td><td>${esc(p.price)}</td><td>${p.credits.toLocaleString("en-US")}</td><td>${esc(p.per)}</td></tr>`
        ).join("") +
        `</tbody></table>` +
        `<ul>` +
        `<li><strong>Credits do not expire</strong> and there is no subscription or recurring charge.</li>` +
        `<li>A call that fails is refunded automatically.</li>` +
        `<li>A call interrupted after it was charged — a deploy, a dropped connection, a timeout — is billed <strong>once at most</strong>. Retries carry an idempotency key.</li>` +
        `<li>Payment is handled by Stripe. Nooticr never sees or stores card details.</li>` +
        `</ul>` +
        `<p>Check the balance any time with <code>check_nooticr_credits</code>, top up with <code>buy_nooticr_credits</code>, or use the <a href="/dashboard">dashboard</a>.</p>`,
    },
    {
      id: "errors",
      title: "Errors and limits",
      group: "Reference",
      body:
        `<table class="doc-t"><thead><tr><th>You see</th><th>Meaning</th><th>Do</th></tr></thead><tbody>` +
        `<tr><td><code>401 Unauthorized</code></td><td>No valid token</td><td>Reconnect the connector, or run <code>nooticr_login</code></td></tr>` +
        `<tr><td><code>-32002</code> insufficient credits</td><td>Balance too low for this tool</td><td><code>buy_nooticr_credits</code>, or top up in the dashboard</td></tr>` +
        `<tr><td><code>available: false</code></td><td>The post has no caption track</td><td>Not an error — use <code>analyze_post</code> instead</td></tr>` +
        `<tr><td>Unsupported URL</td><td>Not one of the ${PLATFORMS.length} supported networks</td><td>Check the coverage list above</td></tr>` +
        `</tbody></table>` +
        `<p>A 401 carries a <code>WWW-Authenticate</code> header pointing at the protected-resource metadata, so a compliant client can discover the authorization flow without configuration.</p>` +
        `<p>Long-running tools stream their result over SSE and can take 20–70 seconds. If the connection drops, the client reconnects with <code>Last-Event-ID</code> and receives what it missed rather than restarting the call.</p>`,
    },
    {
      id: "support",
      title: "Support",
      group: "Reference",
      body:
        `<p>Email <a href="mailto:${esc(BRAND.supportEmail)}">${esc(BRAND.supportEmail)}</a> for questions, security reports, data requests or account deletion. We respond to privacy requests within 30 days.</p>` +
        `<ul>` +
        `<li>Service status: <a href="/health">/health</a></li>` +
        `<li>OAuth metadata: <a href="/.well-known/oauth-authorization-server">/.well-known/oauth-authorization-server</a></li>` +
        `<li>Source: <a href="https://github.com/orchynX/nooticr-mcp" rel="noopener">github.com/orchynX/nooticr-mcp</a></li>` +
        `<li>Package: <a href="https://www.npmjs.com/package/@nooticr/mcp" rel="noopener">@nooticr/mcp</a></li>` +
        `</ul>`,
    },
  ];

  // Table of contents, grouped.
  let lastGroup = "";
  const toc = sections
    .map((s) => {
      const head =
        s.group && s.group !== lastGroup
          ? ((lastGroup = s.group), `<div class="grp">${esc(s.group)}</div>`)
          : "";
      return head + `<a href="#${s.id}">${esc(s.title)}</a>`;
    })
    .join("");

  const body =
    `<main class="wrap"><div class="doc">` +
    `<nav class="toc" aria-label="Contents">${toc}</nav>` +
    `<div class="doc-body">` +
    sections.map((s) => `<h2 id="${s.id}">${esc(s.title)}</h2>${s.body}`).join("") +
    `</div></div></main>`;

  return page(
    {
      title: "Documentation — Nooticr MCP",
      description:
        "How the Nooticr MCP server works: what it accesses, what it cannot do, how access is granted and revoked, where data goes, the full tool reference and how billing works.",
      publicUrl,
      css: CSS,
      script: SCRIPT,
      canonicalPath: "/documentation",
    },
    body
  );
}
