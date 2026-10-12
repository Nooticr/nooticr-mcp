#!/usr/bin/env bash
# Publish server.json to the official MCP registry as com.nooticr/mcp.
#
#   MCP_REGISTRY_PRIVATE_KEY=<64-hex ed25519 seed> scripts/publish-registry.sh [--dry-run]
#
# Idempotent: exits 0 without touching the registry when it already serves
# server.json's version. --dry-run does everything except login and publish.
# Optional: MCP_PUBLISHER_BIN=/path/to/mcp-publisher skips the download.
# See docs/registry-publishing.md.
set -euo pipefail

PUBLISHER_VERSION="v1.8.1"
SHA256_linux_amd64="a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc"
SHA256_linux_arm64="8dd75a6cf6845688b5d4e46df58d3ca26d5c8d233bb0626606e1db82c5e883e4"
SHA256_darwin_amd64="88126981225e7714fcc6b7a10cdba4a80ae5901e9740a8c06d0d5195c8bc294c"
SHA256_darwin_arm64="e45e520892460732a4bdf37255576415d4a53ec171f8b913faf15bb1aef7cb77"
DOMAIN="nooticr.com"

DRY_RUN=0
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=1 ;;
  *) echo "usage: MCP_REGISTRY_PRIVATE_KEY=<hex> $0 [--dry-run]" >&2; exit 64 ;;
esac

cd "$(dirname "$0")/.."

if ! [[ "${MCP_REGISTRY_PRIVATE_KEY:-}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  echo "MCP_REGISTRY_PRIVATE_KEY must be set to 64 hex characters (an ed25519 seed)." >&2
  exit 64
fi

# 1. Already published?
drift=0
node scripts/registry-drift.mjs || drift=$?
if [ "$drift" -eq 0 ]; then echo "already published"; exit 0; fi
if [ "$drift" -ne 1 ]; then echo "could not check the registry; aborting" >&2; exit 2; fi

# 2. npm must already carry exactly server.json's version (the registry validates the package).
want="$(node -p 'require("./server.json").version')"
pkg="$(node -p 'require("./server.json").packages[0].identifier')"
have="$(node -e '
  fetch("https://registry.npmjs.org/" + process.argv[1].replace("/", "%2f") + "/" + process.argv[2])
    .then((r) => (r.ok ? r.json() : { version: "" }))
    .then((j) => console.log(j.version || ""), () => console.log(""));
' "$pkg" "$want")"
if [ "$have" != "$want" ]; then
  echo "npm does not have $pkg@$want published yet; publish to npm first." >&2
  exit 3
fi

# 4 (before 3: validation needs the binary). Locate or download mcp-publisher.
TMP="$(mktemp -d)"
LOGGED_IN=0
BIN="${MCP_PUBLISHER_BIN:-}"
cleanup() {
  if [ "$LOGGED_IN" -eq 1 ] && [ -n "$BIN" ]; then "$BIN" logout >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT

if [ -z "$BIN" ]; then
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; *) echo "unsupported arch" >&2; exit 4 ;; esac
  case "${os}_${arch}" in linux_amd64|linux_arm64|darwin_amd64|darwin_arm64) ;; *) echo "unsupported platform ${os}_${arch}" >&2; exit 4 ;; esac
  expected_var="SHA256_${os}_${arch}"
  asset="mcp-publisher_${os}_${arch}.tar.gz"
  curl -fsSL --retry 3 -o "$TMP/$asset" \
    "https://github.com/modelcontextprotocol/registry/releases/download/${PUBLISHER_VERSION}/${asset}"
  if command -v sha256sum >/dev/null 2>&1; then actual="$(sha256sum "$TMP/$asset" | cut -d' ' -f1)"
  else actual="$(shasum -a 256 "$TMP/$asset" | cut -d' ' -f1)"; fi
  if [ "$actual" != "${!expected_var}" ]; then echo "sha256 mismatch for $asset" >&2; exit 5; fi
  tar -xzf "$TMP/$asset" -C "$TMP" mcp-publisher
  BIN="$TMP/mcp-publisher"
fi

# 3. Validate server.json against its $schema.
"$BIN" validate

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry run: would log in as $DOMAIN and publish $pkg@$want; stopping before login."
  exit 0
fi

# 5. Log in (logout runs from the EXIT trap on every path), then publish.
LOGGED_IN=1
"$BIN" login dns --domain "$DOMAIN" --private-key "$MCP_REGISTRY_PRIVATE_KEY" >/dev/null
"$BIN" publish

# 6. The registry must now agree.
for attempt in 1 2 3; do
  rc=0
  node scripts/registry-drift.mjs || rc=$?
  if [ "$rc" -eq 0 ]; then echo "published $want"; exit 0; fi
  sleep $((attempt * 5))
done
echo "registry still disagrees with server.json after publishing" >&2
exit 6
