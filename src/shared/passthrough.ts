/**
 * The two halves every thin passthrough module repeats: a result a host can
 * read on either channel, and a failure that keeps what the server said.
 *
 * ## Why a failure carries the refusal's `code` and `data`
 *
 * nooticr-server answers a refusal it expects a caller to act on with a
 * JSON-RPC error whose `data` names it: `{code: "not_connected", source:
 * "trustpilot"}`, `{code: "no_brand_grounding"}`, a hire refused with the
 * values it was refused over (nooticr-server#1439). `NooticrClient.callTool`
 * already keeps that `data` on the error it throws, as `body`, and the JSON-RPC
 * code as `code`. The eleven local copies of `failed()` this replaces dropped
 * both and kept the prose, so a host could not tell "connect Trustpilot first"
 * from "Trustpilot is down" without parsing a sentence.
 *
 * The refusal goes in both channels for the same reason a result does
 * (CLAUDE.md, "Whether a chain holds"): a host that shows only text blocks
 * gets it in the text, and one that keeps `structuredContent` gets it there.
 * An `isError` result is not validated against the tool's output schema (the
 * SDK skips it), so the `error` object needs no entry in output-schemas.ts.
 */
import { NooticrError, type McpProxyResult } from "./nooticr.js";

type Text = { type: "text"; text: string };

/**
 * A result whose payload is in the text block as well as in
 * `structuredContent`, optionally after a framing note.
 *
 * The backend's own text block is often a one-line summary while the rows are
 * in `structuredContent`, which a host rendering a view hands to the widget,
 * not to the model. So the text carries the payload itself.
 */
export function bothChannels(proxy: McpProxyResult, note?: string) {
  const textBlock = proxy.contentBlocks.find((c) => c.type === "text");
  const structured = proxy.structured as Record<string, unknown> | undefined;
  const body = structured ? JSON.stringify(structured) : String(textBlock?.text ?? "");
  const text = note ? `${note}\n\n${body}` : body;
  // The note is guidance, and guidance has to survive a host that keeps only
  // structuredContent as well as one that keeps only the text (chain-map's
  // gate), so it rides in the payload too, under the key the views already
  // treat as prose for the model rather than data.
  const payload = note && structured && structured.guidance === undefined ? { ...structured, guidance: note } : structured;
  return { content: [{ type: "text" as const, text }], structuredContent: payload };
}

/** What the server named about a refusal, when it named anything. */
export function refusalOf(err: unknown): { rpcCode?: string; code?: string; data?: Record<string, unknown> } {
  if (!(err instanceof NooticrError)) return {};
  const data =
    err.body && typeof err.body === "object" && !Array.isArray(err.body)
      ? (err.body as Record<string, unknown>)
      : undefined;
  const code = typeof data?.code === "string" ? data.code : undefined;
  return { rpcCode: err.code, code, data };
}

/**
 * A failed call, with the server's words and, when it sent them, the
 * refusal's stable `code` and the rest of its `data`.
 */
export function failed(prefix: string, err: unknown): {
  content: Text[];
  structuredContent?: Record<string, unknown>;
  isError: true;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const { rpcCode, code, data } = refusalOf(err);
  if (!data) {
    return { content: [{ type: "text" as const, text: `${prefix}: ${msg}` }], isError: true as const };
  }
  const named = code ? `\nRefusal code: ${code}.` : "";
  return {
    content: [{ type: "text" as const, text: `${prefix}: ${msg}${named}\nRefusal data: ${JSON.stringify(data)}` }],
    // `message` is the whole first line, prefix included, so whatever the
    // server's sentence steers to (another tool, a setting) reads the same on
    // a host that keeps only this payload.
    structuredContent: { error: { message: `${prefix}: ${msg}`, code: code ?? null, rpcCode: rpcCode ?? null, data } },
    isError: true as const,
  };
}
