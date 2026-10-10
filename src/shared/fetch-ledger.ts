/**
 * What nooticr actually returned in this session, so a `show_*` view can
 * draw nooticr's figures rather than the model's copy of them (#107).
 *
 * The views take the material back from the model: "the post object
 * analyze_post handed you, unchanged", "the same shape compare_creators
 * returned". A model that dropped a row, mis-copied a view count or invented
 * a competitor produced a card identical to a truthful one, and the card's
 * whole claim is that a person can check it.
 *
 * Re-fetching would cost the user a paid call per view, so this keeps the
 * results the session already paid for instead: posts by URL, creator rows by
 * platform and handle, trend runs by term and time. A view overlays these on
 * what it was sent — the facts are ours, the judgement stays the model's — and
 * anything it cannot match is still drawn, but marked. Per server, so per
 * session on both transports; bounded, so a long session cannot grow it
 * without limit. A Worker restart empties it, which is why an unmatched row is
 * described as "not among what nooticr returned in this session", never as
 * invented.
 */
type Row = Record<string, unknown>;

const LIMIT = 2000;

const POST_KEYS = ["posts", "window", "demand", "supply", "results"];

/** One spelling per post: no trailing slash, no tracking query, YouTube's id kept. */
export function postKey(url: unknown): string {
  if (typeof url !== "string" || !url.trim()) return "";
  const raw = url.trim();
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
    const keep = host.endsWith("youtube.com") && u.searchParams.get("v") ? `?v=${u.searchParams.get("v")}` : "";
    return `${host}${u.pathname.replace(/\/+$/, "")}${keep}`;
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  }
}

const urlsOf = (row: Row) =>
  [row.externalUrl, row.url, row.permalink, row.postUrl].map(postKey).filter(Boolean);

const handleOf = (row: Row) =>
  String(row.handle ?? row.username ?? row.creatorHandle ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

export const creatorKey = (row: Row) => {
  const h = handleOf(row);
  return h ? `${String(row.platform ?? "").toLowerCase()}:${h}` : "";
};

const runKey = (term: unknown, ranAt: unknown) =>
  `${String(term ?? "").trim().toLowerCase()}|${String(ranAt ?? "")}`;

class Bounded<V> {
  private readonly map = new Map<string, V>();
  set(k: string, v: V) {
    if (!k) return;
    this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > LIMIT) this.map.delete(this.map.keys().next().value as string);
  }
  get(k: string) {
    return k ? this.map.get(k) : undefined;
  }
}

export interface Verification {
  status: "verified" | "unverified";
  note: string;
  /** What could not be matched, by the key the reader would recognise. */
  unmatched: string[];
}

export class FetchLedger {
  private readonly posts = new Bounded<Row>();
  private readonly creators = new Bounded<Row>();
  private readonly runs = new Bounded<Row>();

  /** Keep what a tool returned. The views' own results are never kept: they echo the model. */
  record(tool: string, structured: unknown) {
    if (tool.startsWith("show_") || !structured || typeof structured !== "object") return;
    const sc = structured as Row;
    const keepPost = (p: unknown) => {
      if (!p || typeof p !== "object") return;
      for (const k of urlsOf(p as Row)) this.posts.set(k, p as Row);
    };
    for (const key of POST_KEYS) {
      if (Array.isArray(sc[key])) for (const p of sc[key] as unknown[]) keepPost(p);
    }
    keepPost(sc.post);
    // analyze_post and its siblings carry the post's fields at the top level.
    if (urlsOf(sc).length && (sc.views != null || sc.caption != null || sc.title != null)) keepPost(sc);
    if (Array.isArray(sc.creators)) {
      for (const c of sc.creators as unknown[]) {
        if (c && typeof c === "object") this.creators.set(creatorKey(c as Row), c as Row);
      }
    }
    if (Array.isArray(sc.runs)) {
      for (const r of sc.runs as unknown[]) {
        if (!r || typeof r !== "object" || (r as Row).ranAt == null) continue;
        this.runs.set(runKey(sc.term, (r as Row).ranAt), r as Row);
        this.runs.set(runKey("", (r as Row).ranAt), r as Row);
      }
    }
  }

  post(url: unknown): Row | undefined {
    return this.posts.get(postKey(url));
  }

  /**
   * Posts as the view should draw them: nooticr's fields over the model's,
   * so a copied stat can never win, and the model's extra fields survive.
   */
  checkPosts(sent: Row[]): { rows: Row[]; verification: Verification } {
    const unmatched: string[] = [];
    const rows = sent.map((p) => {
      const ours = urlsOf(p).map((k) => this.posts.get(k)).find(Boolean);
      if (!ours) {
        unmatched.push(String(p.externalUrl ?? p.url ?? "a post with no URL"));
        return p;
      }
      return { ...p, ...ours, verified: true };
    });
    return { rows, verification: verdict(rows.length, unmatched, "post") };
  }

  checkCreators(sent: Row[]): { rows: Row[]; verification: Verification } {
    const unmatched: string[] = [];
    const rows = sent.map((c) => {
      const ours = this.creators.get(creatorKey(c));
      if (!ours) {
        unmatched.push(`@${handleOf(c) || "?"}${c.platform ? ` on ${String(c.platform)}` : ""}`);
        return c;
      }
      // The order and any ranking note are the model's; every figure is ours.
      return { ...c, ...ours, verified: true };
    });
    return { rows, verification: verdict(rows.length, unmatched, "creator") };
  }

  checkRuns(sent: Row[], term?: string): { rows: Row[]; verification: Verification } {
    const unmatched: string[] = [];
    const rows = sent.map((r) => {
      const ours = this.runs.get(runKey(term, r.ranAt)) ?? this.runs.get(runKey("", r.ranAt));
      if (!ours) {
        unmatched.push(String(r.ranAt ?? "an undated point"));
        return r;
      }
      return { ...r, ...ours, verified: true };
    });
    return { rows, verification: verdict(rows.length, unmatched, "point") };
  }
}

function verdict(total: number, unmatched: string[], noun: string): Verification {
  if (!unmatched.length) {
    return {
      status: "verified",
      note: `All ${total} ${noun}${total === 1 ? "" : "s"} drawn with the figures nooticr returned in this session.`,
      unmatched,
    };
  }
  const n = unmatched.length;
  return {
    status: "unverified",
    note:
      `${n} of ${total} ${noun}${total === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} not among what nooticr ` +
      `returned in this session, so ${n === 1 ? "its" : "their"} figures are as re-sent and were not ` +
      `checked: ${unmatched.slice(0, 5).join(", ")}${n > 5 ? ", …" : ""}.`,
    unmatched,
  };
}

/**
 * One ledger per server. Keyed off the server object so the task path
 * (registerSlowTool) and the plain path record into the same one without
 * threading it through every registration.
 */
const LEDGERS = new WeakMap<object, FetchLedger>();

export function ledgerFor(server: object): FetchLedger {
  let l = LEDGERS.get(server);
  if (!l) LEDGERS.set(server, (l = new FetchLedger()));
  return l;
}
