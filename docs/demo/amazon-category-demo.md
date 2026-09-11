# Demoing the Amazon category scan

The exact sequence to drive on screen, and the numbers to quote while it runs.
Written for the recording of the Gloryfeel/ashwagandha demo, but it is the same
sequence for any category.

## What the demo is answering

A customer is considering a category. They either name competitors they already
watch or name nothing at all, and they want four things out of it: purchase
drivers, purchase barriers, what the incumbents do well, and where the gap is.
Everything below exists to answer that in one pass, with every claim traceable
to the review it came from.

## The three processes

```text
amazon_scrap_rs --serve        collects listings + reviews (browser, WAF, queue)
        ▲ HTTP
nooticr-server  POST /mcp      scan_amazon_category / amazon_scan_status /
        ▲ MCP                  get_amazon_product, billed per listing
nooticr-mcp (this repo)        the tools Claude/ChatGPT actually see, the
                               guidance, and the view
```

Only the first one touches Amazon. It is a separate process because a review
scrape drives a real Chrome to clear AWS WAF (~1.1 GB at the peak) and its WAF
token is bound to the egress IP that minted it — so it wants a couple of
IP-stable workers, not one per API pod.

## Running it for real

```bash
# 1. the collector, against live Amazon
cd amazon_scrap_rs && cargo build --release
./target/release/amazon_scrap_rs --serve --port 8788 --workers 2 \
  --session /var/lib/scraper/session.json
# a warm session is worth having before a demo: measured 6/6 products with
# reviews from a warm browser against 5/6 cold.

# 2. the backend, pointed at it
AMAZON_SCRAPER_URL=http://127.0.0.1:8788 cargo run -p nooticr-server

# 3. the tool surface, as a host sees it
cd nooticr-mcp && npm run build && node dist/index.js
```

### Rehearsing without spending a fetch

`--fixtures` serves recorded listings through the same code path, so the whole
chain — tools, guidance, view, the click-through from a claim to its review —
can be rehearsed with no network and no WAF token:

```bash
./target/release/amazon_scrap_rs --serve --port 8788 --fixtures fixtures/ashwagandha
```

Eight ashwagandha listings with 40 reviews and full aspect breakdowns. Use it
to practise the run; record against live Amazon.

## The sequence on screen

1. **Ask in plain language.** "We're looking at entering the ashwagandha
   category on Amazon. Here are three competitors we watch —
   B07VJ5KFXZ, B0C4KNW2T1, B0BN4VQ7HG — plus whatever else ranks. What do
   buyers want and what stops them buying?"

   The model calls `scan_amazon_category` with `asins` and `query` together.
   Named competitors keep their place at the front of the set.

2. **The spend confirmation appears.** It says the number before it is spent —
   3 credits a listing, so ten listings is 30. Worth pausing on: the price is
   set by the argument, so it is confirmed rather than quoted in a description
   nobody re-reads.

3. **Collection runs.** The wait is real and the view says what it is doing —
   "collecting 4/10". Talk over it (see the timing numbers below). If the call
   returns before the scan finishes, it hands back a `scanId` and everything
   collected so far; `amazon_scan_status` picks it up and is free.

4. **The listings screen.** Price spread, rating spread, the share of each
   listing's ratings sitting at 1-2 stars, and the Amazon mark on the header.
   Click a listing: its star histogram, Amazon's own review digest, the aspect
   counts, and the review bodies.

5. **The model writes the read** from the reviews it was handed — drivers,
   barriers, strengths per brand, gaps, positioning angles — and calls
   `show_amazon_category_insights`.

6. **The click that matters.** Every finding carries the ids of the reviews it
   rests on. Click one and the view jumps to that review, pinned at the top of
   the reviews tab. This is the part to demo slowly: it is the difference
   between an AI summary and a claim somebody can check.

## The timing question, answered honestly

From the collector's own measurements against live `www.amazon.com`
(`amazon_scrap_rs/README.md` — its machine, one process):

| Path | Per listing |
|---|---|
| Product data only, HTTP tier | 2.4 s |
| Product + reviews, warm session | ~8 s |
| Cold session, browser tier required | 2.2 – 37 s (avg 18 s) |

The binding constraint is not the machine. AWS WAF Bot Control challenges an IP
on five or more tokenless requests in five minutes, so the collector's default
pace is one listing every 12 seconds per egress IP, deliberately.

That gives, per collector:

* **10 competitors with reviews: about 4-6 minutes.**
* **A whole category, 50 listings: about 20-25 minutes** — under 10 with three
  collectors on separate egress IPs, since the pace is per IP rather than per
  machine.
* **A re-run inside 6 hours: seconds**, from cache, and the scan says how many
  listings it answered that way.

The analysis itself adds no collection time: the reviews are already in the
model's context by the time the last listing lands.

Say plainly what is not guaranteed: Amazon serves review bodies to logged-out
clients inconsistently, by session. When it withholds them the scan still
returns the rating, the full star histogram, Amazon's own review digest and the
per-aspect mention counts — which is enough for drivers, barriers and category
gaps, just with less quotable text. The view says which listings that happened
to rather than quietly showing fewer reviews.
