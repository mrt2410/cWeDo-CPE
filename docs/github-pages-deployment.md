# GitHub Pages deployment

## What it does

Every tagged release is published as a live, HTTPS-served site on GitHub Pages, which
satisfies Web Bluetooth's secure-context requirement. Each version stays live at its
own permanent URL — publishing a new version never removes an older one:

- `https://mrt2410.github.io/cWeDo-CPE/` — latest tagged release
- `https://mrt2410.github.io/cWeDo-CPE/v1.0.0/`, `/v1.1.0/`, ... — every tagged
  release, live permanently, side by side
- `https://mrt2410.github.io/cWeDo-CPE/versions.html` — auto-generated index of all
  published releases

## What counts as "the app" for deployment

The deployable static site is just `index.html` (dereferenced from its symlink to
`cWeDo CPE v1.0.html`), `css/`, `js/`, and `data/`. `test/`, `mobile/`, `docker*`,
`release/`, `docs/`, and dev tooling (`package.json`, `node_modules/`) are not part of
the served site. All internal references in `index.html`/`js/`/`css/` are relative, so
the same file set works unmodified whether served from `/` (root/latest) or `/vX.Y.Z/`
(a version subfolder).

## Cutting a release

```
git tag vX.Y.Z
git push origin vX.Y.Z
```

That's the entire release process — pushing a tag matching `v*` triggers
[`.github/workflows/deploy-pages.yml`](../.github/workflows/deploy-pages.yml). The
version number is independent of the product-branding "v1.0" in the HTML filename,
which is cosmetic and managed by hand.

## How the workflow publishes

GitHub Pages supports two deploy styles. This project uses **branch deploy**, not
Actions-artifact deploy: the Actions-artifact style
(`actions/upload-pages-artifact` + `actions/deploy-pages`) replaces the *entire*
published site on every run, which would delete previously published version folders.
Branch deploy serves whatever is currently committed to a branch, so a new run can
*add* a version folder without touching what's already there.

On a `vX.Y.Z` tag push, the workflow:

1. Checks out the tag's commit and builds a staging directory with `index.html`
   (dereferenced), `css/`, `js/`, `data/`.
2. Checks out `gh-pages` (creating it as an orphan branch on the first run).
3. Copies the staging directory into `gh-pages:/vX.Y.Z/` — a new, permanent path,
   never overwritten by later runs — and also over the `gh-pages` root, so `/` always
   mirrors the most-recently-tagged version.
4. Regenerates `/versions.html` at the `gh-pages` root by listing the `vX.Y.Z/`
   directories actually present in the branch, so the index grows automatically as
   releases accumulate.
5. Commits and pushes `gh-pages`.

Repo setting: Pages source = branch `gh-pages`, path `/`.

## Testing / verification

`npm test` doesn't cover this pipeline — it only touches deployment tooling, not app
code. To verify a change to the workflow, simulate its copy step locally (dereference
the symlink, copy `index.html`/`css`/`js`/`data` into a staging directory) and confirm
it opens correctly via `python3 -m http.server`, same as the project's normal
Bluetooth-testing serve workflow. The actual GitHub Actions run and Pages publish can
only be verified by pushing a real tag and checking both the root URL and the
`/vX.Y.Z/` URL load, and that `versions.html` lists the new tag.
