#!/usr/bin/env node
// Sync the HTML template from the npm package to the Rust ui.rs file
const { NOOTICR_UI_TEMPLATE } = require('../dist/shared/ui-template.js');
const fs = require('fs');

const RUST_FILE = '/home/ondonda/rust/nooticr-server/crates/mcp/src/ui.rs';

const content = [
  '//! MCP Apps \u2014 interactive UI resource for Nooticr tools.',
  '//!',
  '//! Contains the single HTML template that all tools share. The host fetches',
  '//! this via `resources/read`, renders it in a sandboxed iframe, and pushes',
  '//! tool results via `ui/notifications/tool-result`.',
  '',
  '/// MIME type for MCP Apps HTML resources (SEP-1865).',
  'pub const RESOURCE_MIME_TYPE: &str = "text/html;profile=mcp-app";',
  '',
  '/// The `ui://` resource URI shared by all tools.',
  'pub const UI_RESOURCE_URI: &str = "ui://nooticr/view";',
  '',
  '/// Extension identifier for MCP Apps.',
  'pub const UI_EXTENSION: &str = "io.modelcontextprotocol/ui";',
  '',
  '/// The full HTML template. Self-contained \u2014 no external dependencies.',
  '/// Auto-detects the tool result shape and renders the appropriate view.',
  '// NOTE: the raw string is delimited with three hashes (r###") because the',
  '// template body contains "# sequences (SVG href="#r", CSS colors) that',
  '// would terminate an r#" delimiter early and break the Rust build.',
  'pub const UI_TEMPLATE: &str = r###"' + NOOTICR_UI_TEMPLATE + '"###;',
  '',
].join('\n');

fs.writeFileSync(RUST_FILE, content);
console.log('Written', content.length, 'bytes to', RUST_FILE);
