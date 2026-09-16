# Agent instructions for this project

WeDo CPE is a browser-based Lego WeDo app, split into `css/`, `js/`, and `data/`
modules under the root HTML file (see [CHANGELOG.md](CHANGELOG.md) for how and why).

## Documentation rule

As features are added or changed, record it in two places:

1. **A Markdown doc** describing the feature/change (what it does, how to use it,
   any tradeoffs). Add it under a sensible existing doc, or create a new one if the
   topic doesn't fit anywhere yet.
2. **[CHANGELOG.md](CHANGELOG.md)** — a dated entry summarizing what changed.

This applies to every session going forward, not just large features — small fixes
and structural changes count too.

## Testing

`npm install` then `npm test` runs the test suite (Node's built-in test runner +
jsdom, loading the real `WeDo CPE v1.0.html`/`css`/`js`/`data` files — no browser
needed). This is dev-only tooling; the app itself still ships as plain static files
with zero runtime dependencies. Follow TDD: write a failing test before changing
`js/app.js`, watch it fail, then implement.

Browser-only APIs unavailable in jsdom (Web Bluetooth, MediaRecorder, Web Audio
decoding) can't be exercised end-to-end in tests — test the surrounding logic
directly instead, and say plainly when something still needs manual verification in
a real browser.
