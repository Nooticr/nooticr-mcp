# Fonts

`Geist-Variable.woff2` is Geist by Vercel (https://github.com/vercel/geist-font),
licensed under the SIL Open Font License 1.1. It is the face the Nooticr design
system sets every MCP view in, and `scripts/build-ui.mjs` inlines it into the
view as a data URI, because a sandboxed view cannot fetch a font.
