# Publishing to the official MCP registry (`com.nooticr/mcp`)

## Why the entry drifts

CI's `version` job bumps `server.json` (`version` and `packages[0].version`) on
every release and the `publish` job runs `npm publish`. Nothing runs
`mcp-publisher`, so the registry entry keeps whatever version was last published
by hand (1.26.19 on 2026-09-05, while npm and `server.json` reached 1.26.56).
Nothing fails when they disagree.

That matters because the registry is upstream of other directories: Glama's
connector page mirrors it and PulseMCP redirects submissions there, so a stale
version propagates. After each release the registry entry must equal
`server.json.version`.

## The two proofs (both already in place)

- **DNS**: `nooticr.com` carries a TXT record `v=MCPv1; k=ed25519; p=<public key>`.
  The namespace is `com.nooticr/*`, so authentication is `mcp-publisher login dns`
  with the matching private key, not GitHub OIDC (that only covers `io.github.*`).
- **npm**: the published package carries `"mcpName": "com.nooticr/mcp"`. npm must
  already have the exact `server.json.version` before the registry will accept it.

## Check for drift (no key needed)

```
npm run registry:check
```

Prints one JSON line (`name`, `repo`, `npm`, `registry`, `registry_published_at`,
`drift`, `behind_by_patch`) and a sentence. Exit `0` in sync, `1` drift, `2` the
registry or npm could not be reached after 3 tries.

## Publish

```
MCP_REGISTRY_PRIVATE_KEY=<64-hex ed25519 seed> npm run registry:publish -- --dry-run   # everything but login/publish
MCP_REGISTRY_PRIVATE_KEY=<64-hex ed25519 seed> npm run registry:publish
```

The script is idempotent (already in sync: prints "already published", exit 0),
checks npm has the version, downloads a pinned, sha256-verified `mcp-publisher`
(or uses `MCP_PUBLISHER_BIN`), validates `server.json`, logs in, publishes,
always logs out on exit, then re-checks the registry. The key is passed only to
`login dns`, is never printed and never written to disk. Bump the pinned
version and checksums at the top of the script when upgrading `mcp-publisher`.

## Where the key lives

In the founder's password manager. If the workflow step below is adopted, also as
the GitHub Actions secret `MCP_REGISTRY_PRIVATE_KEY`. Never commit it.

## Rotating the key

1. Generate a new ed25519 key pair (a 32-byte seed as 64 hex characters, plus its public key).
2. Replace the `p=` value of the `nooticr.com` TXT record (`v=MCPv1; k=ed25519; p=<base64 public key>`).
3. Update the password-manager entry and the `MCP_REGISTRY_PRIVATE_KEY` secret.
4. Run `npm run registry:publish -- --dry-run`, then publish on the next release.

## Proposed workflow step (proposed: a human adds this to `ci.yml`)

Agents do not edit `.github/workflows`. Append to the `publish` job, after "Tag the release":

```yaml
      - name: Publish to the MCP registry
        if: ${{ env.MCP_REGISTRY_PRIVATE_KEY != '' }}
        env:
          MCP_REGISTRY_PRIVATE_KEY: ${{ secrets.MCP_REGISTRY_PRIVATE_KEY }}
        run: scripts/publish-registry.sh
```

**Caution:** `env` set at step level is not visible to that step's own `if`, so
as written the step would never run. Hoist the secret to the job's `env:`
(`env: { MCP_REGISTRY_PRIVATE_KEY: ${{ secrets.MCP_REGISTRY_PRIVATE_KEY }} }`
at job level, and drop the step-level `env`), or add a preceding step that sets
an output such as `has_key=true` and use `if: steps.<id>.outputs.has_key == 'true'`.
