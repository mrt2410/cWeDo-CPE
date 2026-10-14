#!/usr/bin/env node
/* Renders the whiteboard picture (recipes/<name>.png) of recipes by loading each
   .wedo.json into the real app in headless Chrome and screenshotting the canvas,
   so the block art is exact. No dependencies: it drives Chrome over the DevTools
   protocol using Node's built-in WebSocket (Node 22+).

   Usage: node scripts/render-recipe-pictures.js [--all] [recipe-id ...]
     (default: only recipes that have no picture yet; --all re-renders every one)
   Chrome is found via $CHROME or google-chrome / chromium on the PATH. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RECIPES = path.join(ROOT, "recipes");
const VIEW = { width: 2600, height: 1500 };
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp" };

function findChrome() {
  const candidates = [process.env.CHROME, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
  for (const c of candidates) if (spawnSync(c, ["--version"], { stdio: "ignore" }).status === 0) return c;
  throw new Error("Chrome not found. Install it or set $CHROME to its path.");
}

function serveRoot() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]);
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launchChrome(profile) {
  const proc = spawn(findChrome(), [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", `--window-size=${VIEW.width},${VIEW.height}`, "about:blank",
  ], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  if (!fs.existsSync(portFile)) { proc.kill(); throw new Error("Chrome did not start"); }
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find((t) => t.type === "page");
    if (!target) await sleep(100);
  }
  return { proc, wsUrl: target.webSocketDebuggerUrl };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ready, send, close: () => ws.close() };
}

/* Runs in the page: load a recipe, hide the app chrome, move it to a 24px margin, report its size. */
const PREPARE = (recipeUrl) => `(async () => {
  ['splash','versionTag','hub','hubports','filerail','rail','stop','scrim','panel','display'].forEach(i => {
    const e = document.getElementById(i); if (e) e.style.display = 'none'; });
  document.querySelectorAll('[id^=zoom]').forEach(e => e.style.display = 'none');
  applyProgram(await (await fetch(${JSON.stringify(recipeUrl)})).json());
  render();
  const box = () => { const rs = [...document.querySelectorAll('#stage .blk')].map(e => e.getBoundingClientRect());
    return { l: Math.min(...rs.map(r => r.left)), t: Math.min(...rs.map(r => r.top)),
             r: Math.max(...rs.map(r => r.right)), b: Math.max(...rs.map(r => r.bottom)) }; };
  const w = document.getElementById('work').getBoundingClientRect();
  let b = box(); const s = scale();
  const dx = (24 - (b.l - w.left)) / s, dy = (24 - (b.t - w.top)) / s;
  stacks.forEach(st => { st.x += dx; st.y += dy; });
  render(); b = box();
  return { W: Math.ceil(b.r - w.left + 24), H: Math.ceil(b.b - w.top + 24), canvasW: w.width, canvasH: w.height };
})()`;

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const ids = args.filter((a) => !a.startsWith("--"));
  const files = fs.readdirSync(RECIPES).filter((f) => f.endsWith(".wedo.json")).map((f) => f.replace(".wedo.json", ""));
  const todo = (ids.length ? ids : files).filter((id) => all || ids.length || !fs.existsSync(path.join(RECIPES, id + ".png")));
  if (!todo.length) return console.log("nothing to render (all recipes have pictures; use --all to redo them)");

  const server = await serveRoot();
  const profile = fs.mkdtempSync(path.join(ROOT, "tmp", "chrome-"));
  const { proc, wsUrl } = await launchChrome(profile);
  const page = cdp(wsUrl);
  try {
    await page.ready;
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 1, mobile: false });
    await page.send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/index.html` });
    for (let i = 0; i < 100; i++) {
      const r = await page.send("Runtime.evaluate", { expression: "typeof applyProgram === 'function' && typeof render === 'function'", returnByValue: true });
      if (r.result.value) break;
      await sleep(100);
    }
    for (const id of todo) {
      const r = await page.send("Runtime.evaluate", { expression: PREPARE(`/recipes/${id}.wedo.json`), awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${id}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      const { W, H, canvasW, canvasH } = r.result.value;
      if (W > canvasW || H > canvasH) throw new Error(`${id}: program is ${W}x${H}, bigger than the ${canvasW}x${canvasH} canvas — spread its stacks closer together`);
      const shot = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      fs.writeFileSync(path.join(RECIPES, id + ".png"), Buffer.from(shot.data, "base64"));
      console.log(`rendered recipes/${id}.png (${W}x${H})`);
    }
  } finally {
    page.close(); proc.kill(); server.close();
    await sleep(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
