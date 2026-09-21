# Standalone single-file build

## What it does

Bundles the split app (`index.html` + `css/style.css` + every `js/`/`data/` script) back
into one self-contained HTML file with no external references — the CSS and every
`<script src>` get inlined in their original load order. The result works fully offline:
open it directly (`file://`), no web server or network access needed, and no other
files (`css/`, `js/`, `data/`) need to ship alongside it.

This doesn't change how the app is developed or shipped day-to-day — see
[architecture.md](architecture.md) for why the app is split into `css/`/`js/`/`data/`,
and [github-pages-deployment.md](github-pages-deployment.md) for the normal (split-file)
deploy. The standalone bundle is an alternate distribution format for people who want a
single portable file (e.g. to email, or run from a USB stick) instead of a hosted site.

## Building it

```
npm run build:standalone
```

Writes `release/cwedo-cpe-standalone.html` (gitignored, same as the Android `.apk` build
output). The script (`scripts/build-standalone.js`) is a small, dependency-free Node
script: it reads `index.html`, replaces the `<link rel="stylesheet">` with an inlined
`<style>` block and each `<script src="...">` with an inlined `<script>` block containing
that file's contents, and leaves everything else untouched. It follows the same
`index.html` → `cWeDo CPE v1.0.html` symlink the split site uses, so there's one source
of truth for the markup.

Order matters and is preserved: the app has no bundler and no `import`/`export`, so
later scripts (e.g. `js/app.js`) rely on earlier ones (e.g. `js/blocks/core.js`) having
already run and populated globals — see architecture.md.

## CI

[`.github/workflows/build-standalone.yml`](../.github/workflows/build-standalone.yml)
runs the same build:

- On a `vX.Y.Z` tag push (same trigger as `deploy-pages.yml`), it attaches
  `cwedo-cpe-standalone.html` to that tag's GitHub Release (creating the release if it
  doesn't already exist).
- On manual `workflow_dispatch` runs, it uploads the file as a downloadable workflow
  artifact instead, for testing the build without cutting a release.

## Testing / verification

`test/build-standalone.test.js` covers the bundling logic itself (stylesheet and every
script inlined, original load order preserved, rest of the markup untouched) via
`npm test`. It doesn't load the bundle in a real browser — that was verified manually
for this change (served the built file over `http://localhost` and confirmed it renders
and runs identically to the split app, no console errors). `file://` behavior — the
actual offline case this format exists for — still needs occasional manual spot-checks,
since headless test tooling here can't drive a `file://` page directly.
