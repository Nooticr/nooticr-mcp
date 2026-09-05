#!/usr/bin/env python3
"""Every tool must carry the view its hosts require, on the mime each one reads.

This is the check most likely to catch a half-finished tool registration, and
until now it lived only as a block of Python inlined in `.github/workflows/ci.yml`
— which meant the only way to run it before pushing was to read the YAML and
hand-transcribe it. That happened three times in one afternoon, each transcription
slightly different from the last and from CI, which is precisely the situation a
check like this exists to prevent. It is a file now, and CI calls this file.

Reads four artifacts produced by the MCP Inspector (see host-contract.sh) from
the directory given as argv[1]:

    app-info.ndjson   tools/list --app-info, one JSON object per line
    tools.json        tools/list, full descriptors
    resources.json    resources/list
    claude-res.json   resources/read of a ui:// resource
    gpt-res.json      resources/read of its .html twin

Exits non-zero and names every failure, rather than the first — a run that
tells you about one missing view when three are missing costs three runs.
"""
import json
import os
import sys

# Tools that legitimately have nothing to draw. Anything else losing its app is
# a regression, not a choice.
#
# watch_creator and unwatch_creator change stored state and return a list; the
# catch-up that reads that state does have a view, because it returns posts.
#
# Tier 1 (own-account intelligence, brand monitoring, connection state): same
# reasoning. create_brand_watch/stop_brand_watch return a quote or a
# confirmation, not a list of anything; list_brand_watches and list_own_apps are
# metadata lists, the shape watch_creator's own `entries` list already sets
# precedent for; connect_social_account returns a link + message, the same shape
# as nooticr_login; list_social_connections is a metadata list of connections.
# None of the five return the rich, card-shaped content get_content_plan and
# generate_content_plan share (posts with hooks/scripts), which is why those two
# do have a view.
NO_APP = {
    "nooticr_login",
    "watch_creator",
    "unwatch_creator",
    "create_brand_watch",
    "stop_brand_watch",
    "list_brand_watches",
    "list_own_apps",
    "list_social_connections",
    "connect_social_account",
}

MCP_APPS_MIME = "text/html;profile=mcp-app"
APPS_SDK_MIME = "text/html+skybridge"

# Connectors created before per-tool URIs still ask for these.
LEGACY_URIS = ("ui://nooticr/view", "ui://nooticr/view.html")


def main(work: str) -> int:
    def load(name):
        with open(os.path.join(work, name), encoding="utf-8") as fh:
            return json.load(fh)

    fail = []

    with open(os.path.join(work, "app-info.ndjson"), encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    if not rows:
        fail.append("app-info returned nothing at all")

    for r in rows:
        name = r.get("toolName")
        if name in NO_APP:
            if r.get("hasApp"):
                fail.append(f"{name} gained a view unexpectedly")
            continue
        if not r.get("hasApp"):
            fail.append(f"{name} has no app UI")
            continue
        if not r.get("resourceUri"):
            fail.append(f"{name} declares an app with no resourceUri")
        if r.get("resourceMimeType") != MCP_APPS_MIME:
            fail.append(f"{name} serves {r.get('resourceMimeType')}, not {MCP_APPS_MIME}")

    # The ChatGPT half: every view must also point at its skybridge twin.
    tools = load("tools.json").get("tools", [])
    for t in tools:
        meta = t.get("_meta") or {}
        claude = meta.get("ui/resourceUri")
        if t["name"] in NO_APP or not claude:
            continue
        want = f"{claude}.html"
        if meta.get("openai/outputTemplate") != want:
            fail.append(
                f"{t['name']} outputTemplate is {meta.get('openai/outputTemplate')!r}, want {want!r}"
            )

    res = load("resources.json").get("resources", [])
    uris = {r["uri"] for r in res}
    mimes = {r.get("mimeType") for r in res}
    for want in (MCP_APPS_MIME, APPS_SDK_MIME):
        if want not in mimes:
            fail.append(f"resources/list advertises no {want}")
    for legacy in LEGACY_URIS:
        if legacy not in uris:
            fail.append(f"{legacy} is not listed; stale connectors will 404")

    # A declared twin that does not resolve is the same outage as no twin at
    # all, and resources/list alone would not catch it.
    for name, want in (("claude-res.json", MCP_APPS_MIME), ("gpt-res.json", APPS_SDK_MIME)):
        got = load(name)["contents"][0]
        if got.get("mimeType") != want:
            fail.append(f"{name} came back {got.get('mimeType')}, want {want}")
        if "<!DOCTYPE html>" not in str(got.get("text", "")):
            fail.append(f"{name} carries no template")

    if fail:
        # The ::error:: line is what GitHub surfaces in the job summary; the
        # list below it is what a person reads locally.
        print("::error title=Host contract broken::" + "; ".join(fail))
        for f in fail:
            print(f"  - {f}")
        return 1

    print(f"OK: {len(rows)} tools, {len(res)} resources, both host contracts intact")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
