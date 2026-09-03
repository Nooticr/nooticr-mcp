/**
 * Terms of Use and Privacy Policy for mcp.orchyn.com.
 *
 * These are required for connector review, and they are read by people
 * deciding whether to give an AI assistant access to an account — so they
 * describe what this server actually does, in plain language, rather than
 * boilerplate copied from a template.
 *
 * Keep them factually aligned with the implementation. If the server starts
 * collecting or retaining something new, it belongs here first.
 */
import { page, esc, BRAND } from "./layout.js";

/** Bump when the substance changes; shown at the top of both documents. */
export const LEGAL_EFFECTIVE = "29 August 2026";

function prose(publicUrl: string, title: string, path: string, inner: string): string {
  return page(
    { title: `${title} — Orchyn MCP`, publicUrl, canonicalPath: path, description: `${title} for the Orchyn MCP server.` },
    `<main class="wrap"><section style="padding:56px 0"><div class="prose">${inner}</div></section></main>`
  );
}

export function termsPage(publicUrl: string, orchynBase: string): string {
  const host = esc(publicUrl.replace(/^https?:\/\//, ""));
  return prose(
    publicUrl,
    "Terms of Use",
    "/terms",
    `<span class="eyebrow">Legal</span>` +
      `<h1>Terms of Use</h1>` +
      `<p class="muted">Effective ${esc(LEGAL_EFFECTIVE)} · These terms govern your use of the Orchyn MCP server at ${host}.</p>` +

      `<h2>1. What this service is</h2>` +
      `<p>Orchyn MCP is a Model Context Protocol server operated by ${esc(BRAND.company)}. It lets an AI assistant you control — such as Claude, ChatGPT or Cursor — retrieve and analyse <strong>publicly available</strong> posts from supported social networks on your behalf.</p>` +
      `<p>The service returns data about public posts. It does not post, comment, like, follow, message, or take any other action on your social accounts, and it does not connect to your social accounts at all.</p>` +

      `<h2>2. Your account</h2>` +
      `<p>You need an Orchyn account to use the service. You are responsible for keeping your credentials secure and for everything done through your account. Access is granted to your AI client through OAuth 2.1; you can revoke it at any time by disconnecting the connector in that client.</p>` +
      `<p>You must be at least 13 years old, or the minimum age of digital consent where you live, whichever is higher.</p>` +

      `<h2>3. Credits and payment</h2>` +
      `<ul>` +
      `<li>Tool calls are priced in credits. Current prices are shown on the <a href="/#pricing">pricing section</a> and in your <a href="/dashboard">dashboard</a>.</li>` +
      `<li>New accounts receive a starting credit grant. It is promotional and may change for future accounts.</li>` +
      `<li>Credits are purchased through Stripe. We do not receive or store your card details.</li>` +
      `<li>A tool call that fails is refunded automatically. A call interrupted in flight is charged at most once.</li>` +
      `<li>Credits do not expire, have no cash value, and are not transferable or redeemable for money.</li>` +
      `<li>Purchases are final. If you believe you were charged in error, contact <a href="mailto:${esc(BRAND.supportEmail)}">${esc(BRAND.supportEmail)}</a> within 30 days and we will review it.</li>` +
      `</ul>` +

      `<h2>4. Acceptable use</h2>` +
      `<p>You agree not to use the service to:</p>` +
      `<ul>` +
      `<li>Collect, store or redistribute personal data in breach of applicable law, or build profiles of private individuals.</li>` +
      `<li>Harass, stalk, dox or target any person.</li>` +
      `<li>Infringe copyright or other rights in the content retrieved. Posts belong to their creators and to the platforms that host them.</li>` +
      `<li>Circumvent rate limits, resell raw access to the API, or share credentials between accounts.</li>` +
      `<li>Break the terms of the underlying social networks, or misrepresent retrieved content as your own.</li>` +
      `</ul>` +
      `<p>We may suspend or terminate accounts that breach these terms. Where the breach is not deliberate we will normally warn you first.</p>` +

      `<h2>5. Content and third-party platforms</h2>` +
      `<p>The service retrieves content published on third-party networks. ${esc(BRAND.company)} does not own that content, does not endorse it, and is not affiliated with, endorsed by, or sponsored by any of those platforms. Platform names and logos are trademarks of their respective owners and are used here only to identify coverage.</p>` +
      `<p>Availability depends on those platforms. Coverage may change or break without notice when they change their own systems.</p>` +

      `<h2>6. AI-generated analysis</h2>` +
      `<p>Analysis tools produce machine-generated interpretation. It can be wrong, incomplete or biased. Treat it as a starting point for your own judgement, not as fact or as professional advice.</p>` +

      `<h2>7. Availability and changes</h2>` +
      `<p>The service is provided on an "as is" and "as available" basis. We aim for high availability but do not guarantee uninterrupted service. We may change, add or withdraw tools; material changes to pricing will be announced before they take effect.</p>` +

      `<h2>8. Liability</h2>` +
      `<p>To the maximum extent permitted by law, ${esc(BRAND.company)} is not liable for indirect, incidental or consequential losses, or for lost profits or data. Our total liability for any claim relating to the service is limited to the amount you paid us in the three months before the claim arose.</p>` +
      `<p>Nothing in these terms excludes liability that cannot lawfully be excluded, including for death or personal injury caused by negligence, or for fraud.</p>` +

      `<h2>9. Termination</h2>` +
      `<p>You may stop using the service at any time and ask us to delete your account. We may suspend access for breach of these terms, for suspected fraud, or where required by law. Unused credits are not refunded on termination for breach.</p>` +

      `<h2>10. Changes to these terms</h2>` +
      `<p>We may update these terms. The effective date at the top will change, and continued use after that date means you accept the revision. If a change materially reduces your rights, we will make reasonable efforts to notify you directly.</p>` +

      `<h2>11. Contact</h2>` +
      `<p>Questions about these terms: <a href="mailto:${esc(BRAND.supportEmail)}">${esc(BRAND.supportEmail)}</a>.</p>` +
      `<p class="faint" style="margin-top:34px;font-size:13px">See also our <a href="/privacy">Privacy Policy</a>.</p>`
  );
}

export function privacyPage(publicUrl: string, orchynBase: string): string {
  const host = esc(publicUrl.replace(/^https?:\/\//, ""));
  return prose(
    publicUrl,
    "Privacy Policy",
    "/privacy",
    `<span class="eyebrow">Legal</span>` +
      `<h1>Privacy Policy</h1>` +
      `<p class="muted">Effective ${esc(LEGAL_EFFECTIVE)} · How ${esc(BRAND.company)} handles data for the MCP server at ${host}.</p>` +

      `<h2>The short version</h2>` +
      `<ul>` +
      `<li>We store your account identity, your credit balance, and a log of which tools you called and when.</li>` +
      `<li>We do <strong>not</strong> store the content of the posts your assistant retrieves.</li>` +
      `<li>We do <strong>not</strong> sell your data, and we do not use it to train models.</li>` +
      `<li>We never connect to your social accounts and cannot act on them.</li>` +
      `</ul>` +

      `<h2>What we collect</h2>` +
      `<table><thead><tr><th>Data</th><th>Why</th><th>Kept for</th></tr></thead><tbody>` +
      `<tr><td>Account identity (email, display name, user id)</td><td>To identify your account and its balance</td><td>Until you delete the account</td></tr>` +
      `<tr><td>OAuth tokens issued to your AI client</td><td>To authenticate calls from that client</td><td>Until expiry or revocation</td></tr>` +
      `<tr><td>Credit ledger (tool name, credits, timestamp)</td><td>Billing, refunds, and your usage dashboard</td><td>Retained as financial records</td></tr>` +
      `<tr><td>URLs and search terms you pass to tools</td><td>Processed to fulfil the request</td><td>Not retained after the call completes</td></tr>` +
      `<tr><td>Operational logs (timestamps, status codes, errors)</td><td>Reliability and abuse prevention</td><td>Up to 30 days</td></tr>` +
      `<tr><td>Payment records (amount, date, Stripe reference)</td><td>Accounting and dispute handling</td><td>As required by tax law</td></tr>` +
      `</tbody></table>` +

      `<h2>What we do not collect</h2>` +
      `<ul>` +
      `<li>Your card number, CVC or bank details — Stripe handles payment and we only receive a reference.</li>` +
      `<li>The bodies of your AI conversations. We see the tool call, not the chat around it.</li>` +
      `<li>Credentials for any social network. The service reads public data only and has no access to your social accounts.</li>` +
      `<li>The retrieved posts themselves. Media is streamed through to your assistant and cached only transiently to make it viewable.</li>` +
      `</ul>` +

      `<h2>Retrieved content</h2>` +
      `<p>When a tool fetches a post, media may pass through an Orchyn proxy so it can be displayed inside your assistant. These copies are short-lived, serve only your request, and are not indexed, mined or used for any other purpose.</p>` +
      `<p>Retrieved posts may contain personal data about the people who published them. We process it only to answer your request. You are responsible for using it lawfully — see the acceptable use section of our <a href="/terms">Terms</a>.</p>` +

      `<h2>Who we share with</h2>` +
      `<p>We share the minimum necessary with processors who run the service on our behalf:</p>` +
      `<ul>` +
      `<li><strong>Cloudflare</strong> — hosting and edge delivery of this server.</li>` +
      `<li><strong>Stripe</strong> — payment processing.</li>` +
      `<li><strong>Data providers</strong> — to retrieve public posts from the supported networks.</li>` +
      `<li><strong>AI providers</strong> — for the analysis tools, to interpret the content you asked about.</li>` +
      `</ul>` +
      `<p>We do not sell personal data, and we do not share it for advertising.</p>` +

      `<h2>Your rights</h2>` +
      `<p>Depending on where you live, you may have the right to access, correct, export or delete your personal data, to object to or restrict processing, and to complain to a supervisory authority. Email <a href="mailto:${esc(BRAND.supportEmail)}">${esc(BRAND.supportEmail)}</a> and we will respond within 30 days.</p>` +
      `<p>You can revoke your assistant's access at any time by disconnecting the connector in that client, which invalidates its tokens immediately.</p>` +

      `<h2>Security</h2>` +
      `<p>Traffic is encrypted in transit. Access tokens are scoped and expiring, and authentication uses OAuth 2.1 with PKCE so no long-lived secret is pasted into a chat window. Access to production data is limited to personnel who need it.</p>` +

      `<h2>International transfers</h2>` +
      `<p>The service runs on distributed infrastructure and data may be processed outside your country. Where required, transfers rely on appropriate safeguards such as standard contractual clauses.</p>` +

      `<h2>Children</h2>` +
      `<p>The service is not directed to children under 13, and we do not knowingly collect their data. If you believe a child has given us data, contact us and we will delete it.</p>` +

      `<h2>Changes</h2>` +
      `<p>We may update this policy. The effective date above will change, and material changes will be announced before they take effect.</p>` +

      `<h2>Contact</h2>` +
      `<p>Privacy questions or requests: <a href="mailto:${esc(BRAND.supportEmail)}">${esc(BRAND.supportEmail)}</a>.</p>` +
      `<p class="faint" style="margin-top:34px;font-size:13px">See also our <a href="/terms">Terms of Use</a>.</p>`
  );
}
