"""Judge an `mcpjam apps conformance --format json` result (#25).

Every check mcpjam runs is a gate, except the two that object to the
deliberate dual-mime design (see scripts/mcpjam-apps-conformance.sh). This
is an exclusion, not an allowlist: a check mcpjam adds in a later release is
run and gated like the rest, instead of never being run at all.

The two pinned checks are held to the same standard in both directions:
  - failing for any reason other than the skybridge mime fails the build;
  - passing, or vanishing from the run, also fails the build. Either means
    the pin no longer describes reality (the ChatGPT twins lost their mime,
    or mcpjam renamed the check), and an exclusion nobody needs any more
    should be noticed rather than carried forever.

Usage: python3 scripts/mcpjam-conformance-check.py conformance.json
"""
import json
import sys

PINNED = {"ui-listed-resources-valid", "ui-resource-contents-valid"}
FINE = ("passed", "not_applicable", "skipped")


def judge(d):
    """Return a list of error strings; empty means the result is acceptable."""
    errors = []
    checks = d.get("checks") or []
    by_id = {c.get("id"): c for c in checks}

    for c in checks:
        cid, status = c.get("id"), c.get("status")
        if status in FINE:
            continue
        if cid not in PINNED:
            errors.append(f"new conformance failure: {cid} ({status})")
            continue
        violations = (c.get("details") or {}).get("violations") or []
        if not violations:
            errors.append(f"{cid} failed with no violations to confirm the reason")
        for v in violations:
            if "text/html+skybridge" not in str(v):
                errors.append(f"{cid} failed for a new reason: {v}")

    for cid in sorted(PINNED):
        c = by_id.get(cid)
        if c is None:
            errors.append(f"pinned check {cid} was not run; mcpjam may have renamed it")
        elif c.get("status") == "passed":
            errors.append(
                f"pinned check {cid} now passes: either the ChatGPT .html twins no longer "
                "serve text/html+skybridge (which breaks ChatGPT widgets) or the pin is obsolete"
            )

    disc = d.get("discovery") or {}
    if not disc.get("toolCount") or not disc.get("uiToolCount"):
        errors.append(f"discovery found nothing to check: {disc}")
    return errors


def main(path):
    d = json.load(open(path))
    errors = judge(d)
    for e in errors:
        print(f"::error title=MCP Apps conformance::{e}")
    if errors:
        return 1
    disc = d.get("discovery") or {}
    print(
        f"OK: {d.get('summary')}; only the pinned dual-mime deviation fails. "
        f"{len(d.get('checks') or [])} checks run, {disc.get('toolCount')} tools and "
        f"{disc.get('checkedUiResourceCount')} UI resources checked."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
