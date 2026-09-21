# App version display

The app shows its version number in two places, both driven by a single
`APP_VERSION` constant in [js/app.js](../js/app.js):

- **Splash screen** — a small muted line under the "cWeDo CPE" title
  (`#splashVersion`), visible while the app is loading.
- **Persistent corner tag** — a small, low-contrast, non-interactive label
  pinned to the bottom-left of the work area (`#versionTag`), overlaid on the
  canvas the same way the hub button and file-rail icons are. Unlike the
  splash, this one stays visible for the whole session, so the version is
  still checkable after the app has finished loading (useful for bug reports).

## Bumping the version

Update the single constant in `app.js`:

```js
const APP_VERSION='1.1.0';
```

Both display spots read from it, so there's only one place to change per
release.

## Tradeoffs

- The version isn't sourced from `package.json` (which has no `version`
  field) — `package.json` here is dev-tooling config for the test suite, not
  a release manifest for the static app, so keeping the constant in `app.js`
  avoids implying a build step reads it.
- The corner tag uses `position:absolute` inside `#work` (screen-fixed
  relative to the work area, not the document), matching how `#hub`,
  `#filerail`, and `#stop` already overlay the canvas — a `position:fixed`
  tag pinned to the viewport bottom would sit underneath the block tray
  instead, since the tray (not `#work`) reaches the real bottom edge of the
  page.
