# GitHub Pages deployment — design

## Goal

Publish cWeDo CPE as a live, HTTPS-served site on GitHub Pages so it satisfies Web
Bluetooth's secure-context requirement, with every tagged version/release kept live
at its own permanent URL (not just the latest).

## Repo reconciliation (one-time)

The GitHub repo `git@github.com:mrt2410/cWeDo-CPE.git` already exists with a single
`main` branch containing one auto-generated commit (`LICENSE` only, trivial wording
diff from the local `LICENSE`). The local repo has the real project history on
`master` and has diverged.

Steps:
1. Rename local `master` → `main`.
2. Merge in the remote's one-commit `main` history (`git merge --allow-unrelated-histories`),
   keeping the local `LICENSE` content (same license, minor copyright-name wording
   difference — local wins).
3. Push `main` to `origin`. No force-push needed — this is a clean merge, not a
   history rewrite.
4. Set `origin` = `git@github.com:mrt2410/cWeDo-CPE.git`.

## What counts as "the app" for deployment

Per AGENTS.md's description of the project layout, the deployable static site is:
- `index.html` (currently a symlink to `cWeDo CPE v1.0.html` — dereferenced to a
  real file on copy, since Pages/branch-based serving shouldn't rely on a symlink
  resolving correctly)
- `css/`
- `js/`
- `data/`

`test/`, `mobile/`, `docker*`, `release/` (gitignored APK build output), `docs/`,
and dev tooling (`package.json`, `node_modules/`) are not part of the served site.

All internal references in `index.html`/`js/`/`css/` are relative (verified via
grep — no root-absolute `/css`, `/js`, `/data` paths), so the same file set works
unmodified whether served from `/` (root/latest) or `/vX.Y.Z/` (a version subfolder).

## Versioning scheme

- A release is cut by pushing a tag matching `v*` (e.g. `v1.0.0`), following semver.
  This is independent of the product-branding "v1.0" in the HTML filename, which is
  cosmetic and managed by hand.
- `git tag vX.Y.Z && git push origin vX.Y.Z` is the entire release process going
  forward.

## Hosting mechanism: branch deploy, not Actions-artifact deploy

GitHub Pages supports two deploy styles:
- **Actions artifact deploy** (`actions/upload-pages-artifact` +
  `actions/deploy-pages`) replaces the *entire* published site on every run —
  wrong here, since it would delete previously published version folders.
- **Branch deploy** serves whatever is currently committed to a chosen branch/path.
  Because it's just committed files, new runs can *add* a version folder without
  touching what's already there. This is the mechanism we use: a `gh-pages` branch,
  Pages configured to build from that branch's root.

## Workflow: `.github/workflows/deploy-pages.yml`

Trigger: `push` of tags matching `v*`.

Steps:
1. Check out the tag's commit; build a `site/` staging directory containing
   `index.html` (dereferenced), `css/`, `js/`, `data/`.
2. Check out `gh-pages` (create as an orphan branch if it doesn't exist yet).
3. Copy `site/` into `gh-pages:/vX.Y.Z/` (a new, permanent path — never overwritten
   by later runs).
4. Also copy `site/` over the `gh-pages` root, so `/` always mirrors the
   most-recently-tagged version.
5. Regenerate `/versions.html` at the `gh-pages` root: a plain auto-generated list
   of links to every `vX.Y.Z/` folder present in the branch (discovered by listing
   directories — not a hardcoded list), so it grows automatically as releases
   accumulate. Cheap, and only useful once there's more than one release, but
   trivial to keep.
6. Add a `.nojekyll` file at the `gh-pages` root (skip Jekyll processing — not
   needed for a plain static site, and avoids Jekyll ignoring any `_`-prefixed
   paths).
7. Commit and push `gh-pages`.

Repo setting: Pages source = branch `gh-pages`, path `/` — set once via
`gh api repos/mrt2410/cWeDo-CPE/pages` (or the repo Settings UI if the API call
needs a manual first-enable).

## Result

- `https://mrt2410.github.io/cWeDo-CPE/` — latest tagged release, served over
  HTTPS.
- `https://mrt2410.github.io/cWeDo-CPE/v1.0.0/`, `/v1.1.0/`, ... — every tagged
  release, live permanently, side by side.
- `https://mrt2410.github.io/cWeDo-CPE/versions.html` — index of all releases.

## README banner

Add a short banner near the top of `README.md` (below the title, above/alongside
the existing screenshot) pointing visitors at the live site:
`[**Try it live →**](https://mrt2410.github.io/cWeDo-CPE/)`, plus a one-line note
that it needs a Chromium-based browser (Web Bluetooth) — consistent with what the
README already says elsewhere about browser support.

## Docs/changelog

Per AGENTS.md's documentation rule:
- New doc: `docs/github-pages-deployment.md` — what the pipeline does, how to cut
  a release, how the version/latest/versions.html structure works.
- A new CHANGELOG.md entry for this pipeline, added as a new top entry (today,
  next sequence number after the existing top entry). Staged independently from
  the user's existing uncommitted CHANGELOG edits (`git add -p`) so this session's
  commit doesn't sweep in unrelated in-progress work.

## Testing / verification

- `npm test` must still pass unmodified (deployment tooling doesn't touch app
  code).
- Locally simulate the workflow's copy step (dereference symlink, copy the four
  paths) and confirm the resulting `site/` directory opens correctly via
  `python3 -m http.server` (per the project's existing serve-over-http workflow
  for Bluetooth testing).
- After first real tag push, verify both the root URL and the `/vX.Y.Z/` URL load
  in a browser, and that `versions.html` lists the tag correctly.
- Not testable in this environment: actual GitHub Actions run and Pages
  publish — that only happens once pushed to GitHub. State this plainly rather
  than claiming it works before it's been observed live.
