/**
 * mcp.orchyn.com dashboard.
 *
 * The MCP site is its own product surface but owns no data: everything here
 * is read from the orchyn API with the signed-in user's bearer token, through
 * this Worker so the browser never needs a cross-origin credentialed call.
 *
 * Signed out, this is a sign-in page. Signed in, it shows balance, usage,
 * per-tool breakdown, recent activity, credit packs and connection details.
 */
import { page, esc } from "./layout.js";
import { PLATFORMS, platformIcon } from "./platforms.js";

const CSS = `
.dash{padding:34px 0 12px}
.dash-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:26px}
.dash-head h1{font-size:clamp(24px,3.4vw,32px)}
.who{color:var(--muted);font-size:14px;margin-top:5px}

.stats{display:grid;gap:14px;grid-template-columns:repeat(2,1fr);margin-bottom:22px}
@media(min-width:900px){.stats{grid-template-columns:repeat(4,1fr)}}
.stat{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:18px}
.stat .k{font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600}
.stat .v{font-size:30px;font-weight:800;letter-spacing:-.03em;margin-top:7px;font-variant-numeric:tabular-nums}
.stat .s{font-size:12.5px;color:var(--faint);margin-top:3px}
.stat.accent{border-color:var(--brand)}
.stat.accent .v{color:var(--brand)}

.cols{display:grid;gap:18px;min-width:0}
.cols>div{min-width:0}
@media(min-width:1000px){.cols{grid-template-columns:1.35fr 1fr}}
.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;
  padding:15px 19px;border-bottom:1px solid var(--border-soft)}
.card-h h2{font-size:14.5px}
.card-b{padding:17px 19px}
.card-b.flush{padding:0;overflow-x:auto}
/* Long tool names must scroll inside their own card, never widen the page. */
table.t td.name{word-break:break-all}
@media(max-width:520px){
  table.t th,table.t td{padding:10px 13px}
  .dash-head{align-items:flex-start}
}

table.t{width:100%;border-collapse:collapse;font-size:13.5px}
table.t th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;
  color:var(--muted);font-weight:600;padding:11px 19px;border-bottom:1px solid var(--border-soft)}
table.t td{padding:11px 19px;border-bottom:1px solid var(--border-soft);color:var(--muted)}
table.t tr:last-child td{border-bottom:none}
table.t td.name{color:var(--fg);font-family:var(--mono);font-size:12.5px}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.delta-pos{color:var(--good);font-weight:600}
.delta-neg{color:var(--muted)}

.bar{height:6px;border-radius:999px;background:var(--panel-2);overflow:hidden;margin-top:6px}
.bar>i{display:block;height:100%;background:var(--brand);border-radius:999px}

.pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;
  padding:3px 9px;border-radius:999px;border:1px solid var(--border)}
.pill.free{color:var(--good);border-color:color-mix(in srgb,var(--good) 40%,transparent);
  background:color-mix(in srgb,var(--good) 12%,transparent)}
.pill.live{color:var(--good);border-color:color-mix(in srgb,var(--good) 40%,transparent)}
.pill.off{color:var(--muted)}

.packs{display:grid;gap:11px}
.pack{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;
  border:1px solid var(--border);border-radius:var(--r-sm);transition:.16s;background:var(--bg-soft)}
.pack:hover{border-color:var(--brand)}
.pack b{font-size:14px;display:block}
.pack span{font-size:12.5px;color:var(--muted)}
.pack .price{font-size:17px;font-weight:800;letter-spacing:-.02em}

.empty{text-align:center;padding:34px 18px;color:var(--muted);font-size:13.5px}

/* signed-out */
.gate{max-width:26rem;margin:64px auto;text-align:center}
.gate h1{font-size:27px;margin-bottom:10px}
.gate p{color:var(--muted);font-size:14.5px;margin:0 0 22px}
.gate .panel{text-align:left;margin-top:22px}
.gate ol{margin:0;padding-left:20px;color:var(--muted);font-size:13.5px}
.gate li{margin:7px 0}
.err{border:1px solid color-mix(in srgb,var(--bad) 45%,transparent);
  background:color-mix(in srgb,var(--bad) 10%,transparent);color:var(--bad);
  border-radius:var(--r-sm);padding:11px 14px;font-size:13.5px;margin-bottom:16px}
.conn-row{display:flex;align-items:center;gap:9px;margin-top:9px}
.conn-row code{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

const SCRIPT = `
document.querySelectorAll('[data-copy]').forEach(function(b){
  b.addEventListener('click',function(){
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){
      var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1400);
    }).catch(function(){});
  });
});
document.querySelectorAll('[data-buy]').forEach(function(b){
  b.addEventListener('click',async function(){
    b.disabled=true;var o=b.textContent;b.textContent='Opening…';
    try{
      var r=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({pack:b.getAttribute('data-buy')})});
      var j=await r.json();
      if(j.url){location.href=j.url;return;}
      alert(j.error||'Could not start checkout. Please try again.');
    }catch(e){alert('Could not start checkout. Please try again.');}
    b.disabled=false;b.textContent=o;
  });
});
`;

export interface UsageData {
  balance: number;
  totalCalls: number;
  creditsSpent: number;
  freeToolsRemaining: string[];
  byTool: { tool: string; calls: number; credits: number; cost: number }[];
  recent: { id: number; delta: number; reason: string; tool?: string | null; kind: string; createdAt: string }[];
  pricing: { tool: string; cost: number; freeFirstUse: boolean }[];
}

export interface DashboardUser {
  email?: string;
  displayName?: string;
}

const PACKS = [
  { id: "starter", name: "Starter", credits: 600, price: "$15", per: "$0.025 / credit" },
  { id: "pro", name: "Pro", credits: 2000, price: "$40", per: "$0.020 / credit" },
  { id: "scale", name: "Scale", credits: 5000, price: "$85", per: "$0.017 / credit" },
];

/** Signed-out state: explain how to get a token rather than dead-ending. */
export function dashboardSignedOut(publicUrl: string, error?: string): string {
  const body =
    `<main class="wrap"><section class="gate">` +
    (error ? `<div class="err">${esc(error)}</div>` : "") +
    `<h1>Your MCP dashboard</h1>` +
    `<p>Sign in to see your balance, usage and billing.</p>` +
    `<a class="btn btn-primary" href="/dashboard/login">Sign in with Orchyn</a>` +
    `<div class="panel"><h2 style="font-size:14px;margin-bottom:10px">Prefer the command line?</h2>` +
    `<ol><li>Run <code>npx -y @orchyn/mcp login</code></li>` +
    `<li>Complete sign-in in the browser window that opens</li>` +
    `<li>Your assistant is connected — usage shows up here</li></ol></div>` +
    `<p class="faint" style="margin-top:20px;font-size:13px">New here? <a href="/" style="color:var(--brand)">See what Orchyn MCP does</a></p>` +
    `</section></main>`;
  return page(
    { title: "Dashboard — Orchyn MCP", publicUrl, css: CSS, bareNav: true, canonicalPath: "/dashboard" },
    body
  );
}

export function dashboardPage(
  publicUrl: string,
  user: DashboardUser,
  usage: UsageData,
  token: string
): string {
  const maxCalls = Math.max(1, ...usage.byTool.map((t) => t.calls));

  const toolRows = usage.byTool.length
    ? usage.byTool
        .map(
          (t) =>
            `<tr><td class="name">${esc(t.tool)}` +
            `<div class="bar"><i style="width:${Math.round((t.calls / maxCalls) * 100)}%"></i></div></td>` +
            `<td class="num">${t.calls}</td><td class="num">${t.credits}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3"><div class="empty">No tool calls yet. Ask your assistant about a post to get started.</div></td></tr>`;

  const recentRows = usage.recent.length
    ? usage.recent
        .slice(0, 25)
        .map((r) => {
          const when = new Date(r.createdAt);
          const label = r.reason.startsWith("mcp_refund_")
            ? `refund · ${esc(r.reason.replace("mcp_refund_", ""))}`
            : r.reason.startsWith("mcp_")
              ? esc(r.reason.replace("mcp_", ""))
              : esc(r.reason.replace(/_/g, " "));
          const cls = r.delta > 0 ? "delta-pos" : "delta-neg";
          const sign = r.delta > 0 ? "+" : "";
          return (
            `<tr><td class="name">${label}</td>` +
            `<td class="num ${cls}">${sign}${r.delta}</td>` +
            `<td class="num faint">${esc(
              isNaN(when.getTime()) ? "" : when.toISOString().slice(0, 16).replace("T", " ")
            )}</td></tr>`
          );
        })
        .join("")
    : `<tr><td colspan="3"><div class="empty">Nothing yet.</div></td></tr>`;

  const freePills = usage.freeToolsRemaining.length
    ? usage.freeToolsRemaining.map((t) => `<span class="pill free">${esc(t)}</span>`).join(" ")
    : `<span class="faint" style="font-size:13px">All free trials used — calls are billed from your balance.</span>`;

  const packs = PACKS.map(
    (p) =>
      `<div class="pack"><div><b>${esc(p.name)}</b><span>${p.credits.toLocaleString(
        "en-US"
      )} credits · ${esc(p.per)}</span></div>` +
      `<div style="display:flex;align-items:center;gap:12px"><span class="price">${esc(p.price)}</span>` +
      `<button class="btn btn-ghost btn-sm" data-buy="${esc(p.id)}">Buy</button></div></div>`
  ).join("");

  const low = usage.balance <= 5;

  const body =
    `<main class="wrap"><section class="dash">` +
    `<div class="dash-head"><div><h1>Dashboard</h1>` +
    `<div class="who">${esc(user.displayName || user.email || "Signed in")}` +
    (user.email && user.displayName ? ` · ${esc(user.email)}` : "") +
    `</div></div>` +
    `<div style="display:flex;gap:9px"><a class="btn btn-ghost btn-sm" href="/#install">Connection guide</a>` +
    `<a class="btn btn-primary btn-sm" href="#billing">Add credits</a></div></div>` +

    `<div class="stats">` +
    stat("Credit balance", String(usage.balance), low ? "Running low — top up below" : "Credits never expire", low)
    + stat("Tool calls", String(usage.totalCalls), "Billed calls, all time") +
    stat("Credits spent", String(usage.creditsSpent), "Refunds excluded") +
    stat("Free trials left", String(usage.freeToolsRemaining.length), "AI tools, one free use each") +
    `</div>` +

    `<div class="cols">` +
    // left column
    `<div style="display:flex;flex-direction:column;gap:18px">` +
    `<div class="card"><div class="card-h"><h2>Usage by tool</h2>` +
    `<span class="faint" style="font-size:12px">${usage.byTool.length} tool${usage.byTool.length === 1 ? "" : "s"} used</span></div>` +
    `<div class="card-b flush"><table class="t"><thead><tr><th>Tool</th>` +
    `<th style="text-align:right">Calls</th><th style="text-align:right">Credits</th></tr></thead>` +
    `<tbody>${toolRows}</tbody></table></div></div>` +

    `<div class="card"><div class="card-h"><h2>Recent activity</h2></div>` +
    `<div class="card-b flush"><table class="t"><thead><tr><th>Event</th>` +
    `<th style="text-align:right">Credits</th><th style="text-align:right">When (UTC)</th></tr></thead>` +
    `<tbody>${recentRows}</tbody></table></div></div>` +
    `</div>` +

    // right column
    `<div style="display:flex;flex-direction:column;gap:18px">` +
    `<div class="card" id="billing"><div class="card-h"><h2>Add credits</h2>` +
    `<span class="pill">Stripe</span></div><div class="card-b">` +
    `<div class="packs">${packs}</div>` +
    `<p class="faint" style="font-size:12.5px;margin:14px 0 0">Secure checkout via Stripe. Cards are never seen or stored by Orchyn.</p>` +
    `</div></div>` +

    `<div class="card"><div class="card-h"><h2>Free trials</h2></div>` +
    `<div class="card-b">${freePills}</div></div>` +

    `<div class="card"><div class="card-h"><h2>Your connection</h2>` +
    `<span class="pill live">● Connected</span></div><div class="card-b">` +
    `<p class="muted" style="font-size:13px;margin:0 0 4px">Connector URL</p>` +
    `<div class="conn-row"><code>${esc(publicUrl)}/mcp</code>` +
    `<button class="btn btn-ghost btn-sm" data-copy="${esc(publicUrl)}/mcp">Copy</button></div>` +
    `<p class="muted" style="font-size:13px;margin:16px 0 4px">Command line</p>` +
    `<div class="conn-row"><code>npx -y @orchyn/mcp login</code>` +
    `<button class="btn btn-ghost btn-sm" data-copy="npx -y @orchyn/mcp login">Copy</button></div>` +
    `<p class="faint" style="font-size:12.5px;margin:16px 0 0">Revoke access by removing the connector in your AI client.</p>` +
    `</div></div>` +

    `<div class="card"><div class="card-h"><h2>Coverage</h2></div><div class="card-b">` +
    `<div style="display:flex;flex-wrap:wrap;gap:9px">` +
    PLATFORMS.map(
      (p) =>
        `<span class="pill" title="${esc(p.supports)}">${platformIcon(p, 14)} ${esc(p.name)}</span>`
    ).join("") +
    `</div></div></div>` +
    `</div></div>` +
    `</section></main>`;

  return page(
    { title: "Dashboard — Orchyn MCP", publicUrl, css: CSS, script: SCRIPT, bareNav: true, canonicalPath: "/dashboard" },
    body
  );
}

function stat(k: string, v: string, s: string, accent = false): string {
  return (
    `<div class="stat${accent ? " accent" : ""}"><div class="k">${esc(k)}</div>` +
    `<div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`
  );
}
