// Bundles the split app (index.html + css/js/data files) back into a single
// offline-ready HTML file: the stylesheet and every <script src> are inlined
// in their original order, since the app is plain global-scope scripts with
// no bundler and no import/export (see AGENTS.md / README.md).
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HTML_PATH = path.join(ROOT, "index.html");
const OUT_PATH = path.join(ROOT, "release", "cwedo-cpe-standalone.html");

function buildStandalone() {
  let html = fs.readFileSync(HTML_PATH, "utf8");

  html = html.replace(
    /<link rel="stylesheet" href="([^"]+)">/,
    (_match, href) => {
      const css = fs.readFileSync(path.join(ROOT, href), "utf8");
      return `<style>${css}</style>`;
    }
  );

  html = html.replace(
    /<script src="([^"]+)"><\/script>/g,
    (_match, src) => {
      const js = fs.readFileSync(path.join(ROOT, src), "utf8");
      return `<script>${js}</script>`;
    }
  );

  return html;
}

if (require.main === module) {
  const html = buildStandalone();
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, html);
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${html.length} bytes)`);
}

module.exports = { buildStandalone };
