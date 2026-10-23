# GitHub Pages deployment

## What it does

The app is published as a live, HTTPS-served site on GitHub Pages, which satisfies Web
Bluetooth's secure-context requirement. Every release and the `main` branch get their
own permanent URL under `v/`, and publishing one never removes another:

- `https://mrt2410.github.io/cWeDo-CPE/` — the latest tagged release
- `https://mrt2410.github.io/cWeDo-CPE/v/main/` — the `main` branch (latest development version)
- `https://mrt2410.github.io/cWeDo-CPE/v/vX.Y.Z/` — each tagged release, e.g. `/v/v1.1.0/`
- `https://mrt2410.github.io/cWeDo-CPE/v/` — auto-generated index of `main` and all releases

The version folder is named after the git tag as-is (`v1.1.0`, not `1.1.0`).

## What counts as "the app" for deployment

The deployable static site is `index.html` (dereferenced from its symlink to
`cWeDo CPE v1.0.html`), `css/`, `js/`, `data/`, and `recipes/` (the [recipes page](recipes-page.md);
its manifest is regenerated during the build). `test/`, `mobile/`, `docker*`,
`release/`, `docs/`, and dev tooling (`package.json`, `node_modules/`) are not part of
the served site. All internal references in `index.html`/`js/`/`css/` are relative, so
the same file set works unmodified whether served from `/` (latest release), `/v/main/`,
or `/v/vX.Y.Z/`.

## Cutting a release

```
git tag vX.Y.Z
git push origin vX.Y.Z
```

That's the entire release process — pushing a tag matching `v*` triggers
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml). The
version number is independent of the product-branding "v1.0" in the HTML filename,
which is cosmetic and managed by hand.

Pushing to `main` triggers the same workflow and refreshes `/v/main/` only.

## How the workflow publishes

GitHub Pages supports two deploy styles. This project uses **branch deploy**, not
Actions-artifact deploy: the Actions-artifact style
(`actions/upload-pages-artifact` + `actions/deploy-pages`) replaces the *entire*
published site on every run, which would delete previously published version folders.
Branch deploy serves whatever is currently committed to a branch, so a new run can
*add* or refresh one folder without touching the others.

On a push to `main` or a `vX.Y.Z` tag, the workflow:

1. Checks out the commit (with all tags, so it can find the newest release) and builds a
   staging directory with `index.html` (dereferenced), `css/`, `js/`, `data/`, and
   `recipes/` (after regenerating `recipes/manifest.json`).
2. Checks out `gh-pages` (creating it as an orphan branch on the first run).
3. Copies the staging directory into `gh-pages:/v/<dest>/`, where `<dest>` is the tag name
   for a release or `main` for a branch push. The folder is replaced on each run of that
   same ref, so `main` always shows the latest `main`.
4. Updates the `gh-pages` root only when the pushed tag is the newest `v*` tag. An older
   tag published later still gets its `/v/vX.Y.Z/` folder, but leaves the root alone.
5. Regenerates `gh-pages:/v/index.html` by listing the folders actually present under `v/`,
   so the index grows automatically as releases accumulate.
6. Commits and pushes `gh-pages`.

The first run after this layout change also moves any old top-level `gh-pages:/vX.Y.Z/`
folders into `v/` and deletes the old top-level `versions.html`. Those old top-level
URLs (`/vX.Y.Z/`) therefore no longer resolve; the same content lives at `/v/vX.Y.Z/`.

Repo setting: Pages source = branch `gh-pages`, path `/`.

## Testing / verification

`npm test` doesn't cover this pipeline — it only touches deployment tooling, not app
code. The publish step was checked locally by extracting its `run:` block and running it
against a throwaway bare repo with two tags and a `main` branch: each ref landed in the
right folder, the root followed only the newest tag (including when an older tag was
re-published), and the old top-level layout migrated into `v/`. The actual GitHub Actions
run and Pages publish can only be verified by pushing for real and checking the root,
`/v/main/`, `/v/vX.Y.Z/`, and `/v/` URLs load.
