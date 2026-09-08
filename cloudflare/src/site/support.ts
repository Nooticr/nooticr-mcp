/**
 * Support page for mcp.nooticr.com — the URL the ChatGPT and Claude connector
 * submissions ask for, and the one a paying user reaches for when a tool
 * returns nothing.
 *
 * The form composes a `mailto:` rather than posting anywhere, which is a
 * design decision and not a shortcut. This Worker stores no data of its own
 * (see `layout.ts`) and the Privacy Policy says so; a contact endpoint would
 * make that false, and honouring it properly would mean an email provider, an
 * API key in Worker env, spam handling and a retention answer — infrastructure
 * that does not exist, to replace a mail client that does. Composing the
 * message in the visitor's own client keeps the claim true, shows them exactly
 * what is being sent before it is sent, and works cold for a reviewer with no
 * account. If a real ticketing endpoint ever lands, this is the page to
 * repoint; the fields are already the ones a first reply needs.
 *
 * Which is the other half of the job. Nearly every support request for this
 * product is one of four things — a tool that returned nothing because the
 * platform cannot do what was asked, a charge for a call that looked like it
 * failed, a widget that renders as text in a host that draws no widgets, or an
 * account deletion. Each of those has a real answer already, so the page
 * answers them above the form rather than collecting a message that a link
 * would have satisfied.
 */
import { page, esc, BRAND } from "./layout.js";

/** Prefills the subject line, so a reply thread starts with a category. */
const TOPICS = [
  ["tool", "A tool returned nothing, or the wrong thing"],
  ["billing", "Credits, a charge, or a refund"],
  ["connect", "Connecting or authorising a client"],
  ["account", "Account, data export, or deletion"],
  ["security", "Security or vulnerability report"],
  ["other", "Something else"],
] as const;

/** The four questions whose answer is a link rather than a reply. */
const TRIAGE: Array<[string, string]> = [
  [
    "A tool came back empty",
    `Most often the network cannot do what was asked, and the tool says so rather than guessing. ` +
      `Creator search covers TikTok, Instagram and Xiaohongshu — not YouTube. Spoken-mention search ` +
      `cannot reach Reddit or Bilibili, because the audio cannot be fetched from what those posts ` +
      `carry. Comment threads are unavailable on Xiaohongshu. Every limit a tool has is in its own ` +
      `description and in the <a href="/documentation#tools">tool reference</a>. If the network does ` +
      `support it and the call still came back empty, that is a bug — send the tool name and the URL.`,
  ],
  [
    "I think I was charged for a failed call",
    `A call that produces no answer is not billed, and a call interrupted mid-flight is billed once at ` +
      `most. Your <a href="/dashboard">dashboard</a> lists every charge with the tool name and ` +
      `timestamp, so it is the fastest way to check what actually happened. If a row there looks wrong, ` +
      `quote it — the timestamp is enough for us to find the call.`,
  ],
  [
    "The result shows as text, with no widget",
    `Expected in some clients. Several hosts render no widgets at all and fall back to the text result, ` +
      `which is the behaviour the MCP Apps spec asks for. Claude, ChatGPT and other MCP Apps hosts draw ` +
      `the view; Claude Code, Cline, Goose, n8n, Notion and Perplexity do not. Nothing is missing from ` +
      `the answer itself.`,
  ],
  [
    "I want my account and data deleted",
    `Disconnect the connector in your AI client and its tokens are invalid immediately. To remove the ` +
      `account and everything attached to it, email us and say so — we answer deletion and other ` +
      `privacy requests within 30 days, as the <a href="/privacy">Privacy Policy</a> commits.`,
  ],
];

/**
 * Composes the mailto from the fields and keeps it on the button.
 *
 * The fields are deliberately not wrapped in a form element. A form with no
 * `action` submits GET to the current URL, so with JavaScript disabled,
 * pressing Enter in any field would put everything typed into a request line
 * for `/support` — making the promise two paragraphs above it false, in
 * exactly the case where the visitor has least reason to expect it. An inline
 * return-false submit handler does not close that, because it is also
 * JavaScript. Having nothing to submit does. The labels still bind by
 * `for`/`id`, which is what a screen reader reads.
 */
const SCRIPT = `(function(){
  var v=function(id){var e=document.getElementById(id);return e?e.value.trim():'';};
  var go=document.getElementById('send'), box=document.getElementById('sf');
  if(!go||!box) return;
  var topic=document.getElementById('topic'), to=${JSON.stringify(BRAND.supportEmail)};
  var label=document.getElementById('preview');
  function build(){
    var chosen=topic.options[topic.selectedIndex];
    var subject='['+topic.value+'] '+(v('summary')||chosen.text);
    var lines=[];
    if(v('detail')) lines.push(v('detail'),'');
    if(v('tool')) lines.push('Tool: '+v('tool'));
    if(v('link')) lines.push('Post or profile URL: '+v('link'));
    if(v('account')) lines.push('Account email: '+v('account'));
    if(v('client')) lines.push('AI client: '+v('client'));
    go.setAttribute('href','mailto:'+to+'?subject='+encodeURIComponent(subject)+
      '&body='+encodeURIComponent(lines.join('\\n')));
    if(label) label.textContent=subject;
  }
  box.addEventListener('input',build); box.addEventListener('change',build); build();
})();`;

const CSS = `
.sup-form{display:grid;gap:14px}
.sup-row{display:grid;gap:14px}
@media(min-width:640px){.sup-row{grid-template-columns:1fr 1fr}}
.sup-form label{display:block;font-size:12px;font-weight:600;letter-spacing:.05em;
  text-transform:uppercase;color:var(--fg);margin-bottom:6px}
.sup-form input,.sup-form select,.sup-form textarea{
  width:100%;font:inherit;font-size:14.5px;color:var(--fg);background:var(--bg-soft);
  border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px}
.sup-form textarea{min-height:132px;resize:vertical;line-height:1.55}
.sup-form input:focus,.sup-form select:focus,.sup-form textarea:focus{
  outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft)}
.sup-form .hint{font-size:12.5px;color:var(--faint);margin:5px 0 0}
.sup-send{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:4px}
.triage{border:1px solid var(--border);border-radius:var(--r);background:var(--panel);
  padding:0 18px;margin:16px 0}
.triage summary{cursor:pointer;padding:15px 0;font-size:15px;font-weight:600;color:var(--fg)}
.triage summary::marker{color:var(--brand)}
.triage[open] summary{border-bottom:1px solid var(--border-soft)}
.triage p{margin:14px 0 16px}
`;

export function supportPage(publicUrl: string): string {
  const mail = esc(BRAND.supportEmail);
  const field = (
    name: string,
    label: string,
    placeholder: string,
    type = "text",
  ) =>
    `<div><label for="${name}">${esc(label)}</label>` +
    `<input id="${name}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" autocomplete="off"></div>`;

  return page(
    {
      title: "Support — Nooticr MCP",
      publicUrl,
      canonicalPath: "/support",
      description:
        "Get help with the Nooticr MCP server: answers to the four most common questions, and a contact form that opens a prefilled email.",
      css: CSS,
      script: SCRIPT,
    },
    `<main class="wrap"><section style="padding:56px 0"><div class="prose">` +
      `<span class="eyebrow">Support</span>` +
      `<h1>Get help</h1>` +
      `<p class="lede">One address for everything — questions, bugs, billing, security reports and ` +
      `data requests: <a href="mailto:${mail}">${mail}</a>.</p>` +

      `<h2>Before you write</h2>` +
      `<p>Four questions account for most of what reaches us, and each has an answer here rather than ` +
      `in a reply.</p>` +
      TRIAGE.map(
        ([q, a]) => `<details class="triage"><summary>${esc(q)}</summary><p>${a}</p></details>`,
      ).join("") +
      `<p class="faint" style="font-size:13.5px">Live status for the server itself is at ` +
      `<a href="/health">/health</a>.</p>` +

      `<h2 id="form">Send us a message</h2>` +
      `<p>Filling this in opens your own email client with everything already written. Nothing is ` +
      `submitted to us from this page and nothing is stored by it — you see the message before it is ` +
      `sent, and you send it.</p>` +
      `<div class="sup-form" id="sf" role="group" aria-labelledby="form">` +
      `<div><label for="topic">What is this about</label>` +
      `<select id="topic" name="topic">` +
      TOPICS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("") +
      `</select></div>` +
      field("summary", "One-line summary", "search_creators returns nothing for a YouTube handle") +
      `<div><label for="detail">What happened</label>` +
      `<textarea id="detail" name="detail" placeholder="What you asked your assistant to do, what came back, and what you expected instead."></textarea>` +
      `<p class="hint">Approximate times are fine — the dashboard ledger lets us find the exact call.</p></div>` +
      `<div class="sup-row">` +
      field("tool", "Tool name (if you know it)", "search_mentions") +
      field("client", "AI client", "Claude Desktop, ChatGPT, Cursor…") +
      `</div>` +
      `<div class="sup-row">` +
      field("link", "Post or profile URL", "https://www.tiktok.com/@handle/video/…", "url") +
      field("account", "Account email", "you@example.com", "email") +
      `</div>` +
      `<p class="hint">The account email is only so we can find your workspace. Leave it out if you ` +
      `would rather not, and we will ask if we need it.</p>` +
      `<div class="sup-send">` +
      `<a class="btn btn-primary" id="send" href="mailto:${mail}">Open in my email app</a>` +
      `<span class="faint" style="font-size:13px">Subject: <span class="mono" id="preview"></span></span>` +
      `</div>` +
      `</div>` +
      `<noscript><p class="hint">The composer needs JavaScript. Email ` +
      `<a href="mailto:${mail}">${mail}</a> directly and include the tool name, the URL you were ` +
      `asking about, your AI client and roughly when it happened.</p></noscript>` +

      `<h2>Security reports</h2>` +
      `<p>Send vulnerability reports to <a href="mailto:${mail}">${mail}</a> with "security" in the ` +
      `subject, and please do not open a public issue first. Include what you found, how to reproduce ` +
      `it and what access it gives; we will confirm receipt and keep you updated while we fix it.</p>` +

      `<h2>Billing and data requests</h2>` +
      `<p>A charge you believe is wrong: contact us within 30 days and we will review it, as the ` +
      `<a href="/terms">Terms of Use</a> set out. Access, correction, export and deletion requests are ` +
      `answered within 30 days, per the <a href="/privacy">Privacy Policy</a>.</p>` +

      `<p class="faint" style="margin-top:34px;font-size:13px">See also the ` +
      `<a href="/documentation">documentation</a>, our <a href="/terms">Terms of Use</a> and our ` +
      `<a href="/privacy">Privacy Policy</a>.</p>` +
      `</div></section></main>`,
  );
}
