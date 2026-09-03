#!/usr/bin/env node
// Sync the HTML template from the npm package to the Rust ui.rs file
const { ORCHYN_UI_TEMPLATE } = require('../dist/shared/ui-template.js');
const fs = require('fs');
const path = require('path');

// The checkout this runs against, which is not the same directory on every
// machine. An absolute path to one person's home meant the script only worked
// there, so anyone else regenerated the file by hand — which is how the copy
// drifted 27KB in the first place.
const RUST_FILE = process.env.ORCHYN_RUST_UI
  || path.resolve(__dirname, '../../orchyn-server/crates/mcp/src/ui.rs');

const content = [
  '//! MCP Apps \u2014 interactive UI resource for Orchyn tools.',
  '//!',
  '//! Contains the single HTML template that all tools share. The host fetches',
  '//! this via `resources/read`, renders it in a sandboxed iframe, and pushes',
  '//! tool results via `ui/notifications/tool-result`.',
  '',
  '/// MIME type for MCP Apps HTML resources (SEP-1865).',
  'pub const RESOURCE_MIME_TYPE: &str = "text/html;profile=mcp-app";',
  '',
  '/// The `ui://` resource URI shared by all tools.',
  'pub const UI_RESOURCE_URI: &str = "ui://orchyn/view";',
  '',
  '/// Extension identifier for MCP Apps.',
  'pub const UI_EXTENSION: &str = "io.modelcontextprotocol/ui";',
  '',
  '/// The full HTML template. Self-contained \u2014 no external dependencies.',
  '/// Auto-detects the tool result shape and renders the appropriate view.',
  '// NOTE: the raw string is delimited with three hashes (r###") because the',
  '// template body contains "# sequences (SVG href="#r", CSS colors) that',
  '// would terminate an r#" delimiter early and break the Rust build.',
  'pub const UI_TEMPLATE: &str = r###"' + ORCHYN_UI_TEMPLATE + '"###;',
  '',
].join('\n');

// The file this overwrites carries its own tests, and they are the only thing
// standing between a stale copy and a server that quietly serves last month's
// UI. Regenerating used to drop them: the template was rewritten, the
// `#[cfg(test)]` block went with it, and four drift checks disappeared without
// a single failure to show for it. Carry them across instead.
let tests = '';
if (fs.existsSync(RUST_FILE)) {
  const existing = fs.readFileSync(RUST_FILE, 'utf8');
  const at = existing.indexOf('#[cfg(test)]');
  if (at !== -1) tests = existing.slice(at);
}
if (!tests) {
  console.error(
    'refusing to write: %s has no #[cfg(test)] block to carry over, so this ' +
    'would silently drop the drift tests. Restore them first.', RUST_FILE);
  process.exit(1);
}

fs.writeFileSync(RUST_FILE, content + tests);
console.log('Written', (content + tests).length, 'bytes to', RUST_FILE,
  '(template + ' + tests.length + ' bytes of tests carried over)');
