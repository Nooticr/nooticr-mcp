/**
 * mcp.nooticr.com dashboard.
 *
 * The MCP site is its own product surface but owns no data: everything here
 * is read from the nooticr API with the signed-in user's bearer token, through
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

/* api keys */
.keyform{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
.keyform input{flex:1;min-width:11rem;background:var(--bg-soft);border:1px solid var(--border);
  border-radius:var(--r-sm);color:var(--fg);padding:9px 11px;font:inherit;font-size:13.5px}
.keyform input:focus{outline:none;border-color:var(--brand)}
.keyform input.days{flex:0 0 7.5rem;min-width:0}
/* The one-time reveal. Loud on purpose: this is the only time the secret
   exists outside the caller's own machine. */
.reveal{margin-top:14px;padding:14px;border-radius:var(--r-sm);
  border:1px solid color-mix(in srgb,var(--brand) 45%,transparent);
  background:color-mix(in srgb,var(--brand) 9%,transparent)}
.reveal b{display:block;font-size:13px;margin-bottom:8px}
.reveal .conn-row code{background:var(--bg-soft);border:1px solid var(--border);
  border-radius:var(--r-sm);padding:8px 10px;font-size:12.5px}
.reveal p{margin:10px 0 0;font-size:12.5px;color:var(--muted)}
.keyrow td.st{font-size:12px}
.keyrow.gone td{opacity:.5}
/* td.name above breaks anywhere so a long tool name cannot widen the page.
   That rule splits a date down the middle here, where the content is prose
   and a key head, neither of which needs it. (No backticks in this file's
   CSS: it lives in a template literal and one would end the string.) */
.keyrow td.name .s{word-break:normal}
`;

/**
 * The dashboard's inline script.
 *
 * Everything in here is served to the browser verbatim, comments included —
 * which is why the expiry is built up into `payload` rather than passed
 * inline with a ternary. A rendered dashboard has shipped the words "NaN" and
 * "undefined" before, so a test greps the whole page for both, and it cannot
 * tell a stray value from a mention of one. Explanations that need those
 * words belong out here, where they do not ship.
 */
const SCRIPT = `
document.querySelectorAll('[data-copy]').forEach(function(b){
  b.addEventListener('click',function(){
    navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){
      var o=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=o;},1400);
    }).catch(function(){});
  });
});
var keyForm=document.getElementById('keyform');
if(keyForm){
  keyForm.addEventListener('submit',async function(e){
    e.preventDefault();
    var btn=keyForm.querySelector('button[type=submit]');
    var nameEl=document.getElementById('keyname');
    var daysEl=document.getElementById('keydays');
    var out=document.getElementById('keyout');
    var days=parseInt(daysEl.value,10);
    var payload={name:nameEl.value};
    if(Number.isInteger(days))payload.expiresInDays=days;
    btn.disabled=true;var o=btn.textContent;btn.textContent='Creating…';
    out.innerHTML='';
    try{
      var r=await fetch('/api/keys',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(payload)});
      var j=await r.json();
      if(!r.ok||!j.key){out.innerHTML='<div class="err"></div>';out.firstChild.textContent=j.error||'The key could not be created.';}
      else{
        var box=document.createElement('div');box.className='reveal';
        var b1=document.createElement('b');b1.textContent='Copy it now — this is the only time it is shown.';
        var row=document.createElement('div');row.className='conn-row';
        var code=document.createElement('code');code.textContent=j.key;
        var copy=document.createElement('button');copy.className='btn btn-ghost btn-sm';copy.textContent='Copy';
        copy.addEventListener('click',function(){navigator.clipboard.writeText(j.key).then(function(){
          copy.textContent='Copied';setTimeout(function(){copy.textContent='Copy';},1400);}).catch(function(){});});
        row.appendChild(code);row.appendChild(copy);
        var note=document.createElement('p');
        note.textContent='Nooticr stores only a hash of it and cannot show it again. Give it to your server as NOOTICR_API_KEY, or send it as Authorization: Bearer.';
        box.appendChild(b1);box.appendChild(row);box.appendChild(note);
        out.appendChild(box);
        var tb=document.getElementById('keyrows');
        if(tb){
          var empty=tb.querySelector('td[colspan]');if(empty)tb.innerHTML='';
          var tr=document.createElement('tr');tr.className='keyrow';
          var c1=document.createElement('td');c1.className='name';
          c1.textContent=(j.prefix||'')+'… '+(j.name||'');
          var sub=document.createElement('div');sub.className='s faint';sub.style.fontSize='11.5px';
          sub.textContent='created '+new Date().toISOString().slice(0,10)+' · last used never';
          c1.appendChild(sub);
          var c2=document.createElement('td');c2.className='st';c2.textContent='active';
          var c3=document.createElement('td');c3.style.textAlign='right';
          var rv=document.createElement('button');rv.className='btn btn-ghost btn-sm';rv.textContent='Revoke';
          rv.setAttribute('data-revoke',j.id);c3.appendChild(rv);
          tr.appendChild(c1);tr.appendChild(c2);tr.appendChild(c3);
          tb.insertBefore(tr,tb.firstChild);
          wireRevoke(rv);
        }
        nameEl.value='';daysEl.value='';
      }
    }catch(e){out.innerHTML='<div class="err"></div>';out.firstChild.textContent='The key could not be created.';}
    btn.disabled=false;btn.textContent=o;
  });
}
function wireRevoke(b){
  b.addEventListener('click',async function(){
    if(!confirm('Revoke this key? Anything still using it stops working immediately.'))return;
    b.disabled=true;var o=b.textContent;b.textContent='Revoking…';
    try{
      var r=await fetch('/api/keys/revoke',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({id:b.getAttribute('data-revoke')})});
      var j=await r.json();
      if(r.ok){location.reload();return;}
      alert(j.error||'The key could not be revoked.');
    }catch(e){alert('The key could not be revoked.');}
    b.disabled=false;b.textContent=o;
  });
}
document.querySelectorAll('[data-revoke]').forEach(wireRevoke);
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

/** An API key as the listing endpoint returns it — never the secret. */
export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
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
    `<a class="btn btn-primary" href="/dashboard/login">Sign in with Nooticr</a>` +
    `<div class="panel"><h2 style="font-size:14px;margin-bottom:10px">Prefer the command line?</h2>` +
    `<ol><li>Run <code>npx -y @nooticr/mcp login</code></li>` +
    `<li>Complete sign-in in the browser window that opens</li>` +
    `<li>Your assistant is connected — usage shows up here</li></ol></div>` +
    `<p class="faint" style="margin-top:20px;font-size:13px">New here? <a href="/" style="color:var(--brand)">See what Nooticr MCP does</a></p>` +
    `</section></main>`;
  return page(
    { title: "Dashboard — Nooticr MCP", publicUrl, css: CSS, bareNav: true, canonicalPath: "/dashboard" },
    body
  );
}

/**
 * The card that mints the credential a server-side integration runs on.
 *
 * It exists here because this is already the one signed-in, browser-
 * authenticated nooticr surface on this domain — and because the alternative
 * we shipped first, `npx @nooticr/mcp api-key create`, asks someone to
 * install Node and open a terminal to get a string they are going to paste
 * into a deployment config anyway.
 *
 * `keys` is null when the listing could not be read at all (a worker running
 * against a backend older than `/auth/api-keys`); that says so rather than
 * drawing an empty table, which would read as "you have none".
 */
function apiKeysCard(keys: ApiKeySummary[] | null): string {
  if (keys === null) {
    return (
      `<div class="card" id="keys"><div class="card-h"><h2>API keys</h2></div>` +
      `<div class="card-b"><div class="empty">Keys are unavailable right now. ` +
      `You can still mint one with <code>npx -y @nooticr/mcp api-key create</code>.</div></div></div>`
    );
  }

  const state = (k: ApiKeySummary): string => {
    if (k.revokedAt) return "revoked";
    if (k.expiresAt && new Date(k.expiresAt).getTime() <= Date.now()) return "expired";
    return "active";
  };
  const day = (v?: string): string => {
    if (!v) return "never";
    const at = new Date(v);
    return isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
  };

  const rows = keys.length
    ? keys
        .map((k) => {
          const live = state(k) === "active";
          return (
            `<tr class="keyrow${live ? "" : " gone"}">` +
            `<td class="name">${esc(k.prefix)}\u2026 ${esc(k.name)}` +
            `<div class="s faint" style="font-size:11.5px">created ${esc(day(k.createdAt))}` +
            ` · last used ${esc(day(k.lastUsedAt))}` +
            (k.expiresAt ? ` · expires ${esc(day(k.expiresAt))}` : "") +
            `</div></td>` +
            `<td class="st">${esc(state(k))}</td>` +
            `<td style="text-align:right">` +
            (live
              ? `<button class="btn btn-ghost btn-sm" data-revoke="${esc(k.id)}">Revoke</button>`
              : "") +
            `</td></tr>`
          );
        })
        .join("")
    : `<tr><td colspan="3"><div class="empty">No keys yet. Create one to connect a server that cannot open a browser.</div></td></tr>`;

  return (
    `<div class="card" id="keys"><div class="card-h"><h2>API keys</h2>` +
    `<span class="faint" style="font-size:12px">for servers, no browser</span></div>` +
    `<div class="card-b">` +
    `<p class="muted" style="font-size:13px;margin:0 0 12px">A key does not expire and needs no sign-in. ` +
    `Set it as <code>NOOTICR_API_KEY</code>, or send it to <code>/mcp</code> as <code>Authorization: Bearer</code>. ` +
    `<a href="/documentation#connect-server" style="color:var(--brand)">How to use one</a></p>` +
    `<form class="keyform" id="keyform">` +
    `<input id="keyname" type="text" maxlength="120" placeholder="What is it for? e.g. aybee-prod" aria-label="Key name">` +
    `<input id="keydays" class="days" type="number" min="1" max="3650" placeholder="Expires (days)" aria-label="Expires in days">` +
    `<button class="btn btn-primary btn-sm" type="submit">Create key</button>` +
    `</form>` +
    `<div id="keyout"></div>` +
    `</div>` +
    `<div class="card-b flush"><table class="t"><thead><tr><th>Key</th><th>State</th>` +
    `<th style="text-align:right">Action</th></tr></thead><tbody id="keyrows">${rows}</tbody></table></div>` +
    `</div>`
  );
}

export function dashboardPage(
  publicUrl: string,
  user: DashboardUser,
  usage: UsageData,
  token: string,
  keys: ApiKeySummary[] | null = null
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

    apiKeysCard(keys) +
    `</div>` +

    // right column
    `<div style="display:flex;flex-direction:column;gap:18px">` +
    `<div class="card" id="billing"><div class="card-h"><h2>Add credits</h2>` +
    `<span class="pill">Stripe</span></div><div class="card-b">` +
    `<div class="packs">${packs}</div>` +
    `<p class="faint" style="font-size:12.5px;margin:14px 0 0">Secure checkout via Stripe. Cards are never seen or stored by Nooticr.</p>` +
    `</div></div>` +

    `<div class="card"><div class="card-h"><h2>Free trials</h2></div>` +
    `<div class="card-b">${freePills}</div></div>` +

    `<div class="card"><div class="card-h"><h2>Your connection</h2>` +
    `<span class="pill live">● Connected</span></div><div class="card-b">` +
    `<p class="muted" style="font-size:13px;margin:0 0 4px">Connector URL</p>` +
    `<div class="conn-row"><code>${esc(publicUrl)}/mcp</code>` +
    `<button class="btn btn-ghost btn-sm" data-copy="${esc(publicUrl)}/mcp">Copy</button></div>` +
    `<p class="muted" style="font-size:13px;margin:16px 0 4px">Command line</p>` +
    `<div class="conn-row"><code>npx -y @nooticr/mcp login</code>` +
    `<button class="btn btn-ghost btn-sm" data-copy="npx -y @nooticr/mcp login">Copy</button></div>` +
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
    { title: "Dashboard — Nooticr MCP", publicUrl, css: CSS, script: SCRIPT, bareNav: true, canonicalPath: "/dashboard" },
    body
  );
}

function stat(k: string, v: string, s: string, accent = false): string {
  return (
    `<div class="stat${accent ? " accent" : ""}"><div class="k">${esc(k)}</div>` +
    `<div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`
  );
}
