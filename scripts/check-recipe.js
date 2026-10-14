#!/usr/bin/env node
/* Usage: node scripts/check-recipe.js recipes/foo.wedo.json [more files...]
   Loads each file into the real app (applyProgram) and checks it against the
   block rules in test/recipe-rules.js. Prints problems; exits 1 if any. */
const fs = require("fs");
const path = require("path");
const { loadApp } = require("../test/helpers.js");
const { validateProgram } = require("../test/recipe-rules.js");

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.error("usage: check-recipe.js <file.wedo.json>..."); process.exit(2); }
  const dom = await loadApp({ probe: "window.__t={S,ORDER,canAccept,SOCKETED,STARTS,INPUTS,applyProgram};" });
  const T = dom.window.__t;
  let bad = 0;
  for (const file of files) {
    const errors = [];
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.format !== "wedo-cpe-program" || data.version !== 1) errors.push("bad format/version");
      try { T.applyProgram(JSON.parse(JSON.stringify(data))); } catch (e) { errors.push("app rejected it: " + e.message); }
      const m = data.meta;
      if (!m || !m.title || !m.description || !m.author || !Array.isArray(m.needs) || !Array.isArray(m.tags))
        errors.push("meta needs {title, description, author, needs[], tags[]}");
      errors.push(...validateProgram(data, T));
    } catch (e) { errors.push(e.message); }
    console.log(errors.length ? `FAIL ${path.basename(file)}\n  - ${errors.join("\n  - ")}` : `ok   ${path.basename(file)}`);
    if (errors.length) bad++;
  }
  dom.window.close();
  process.exit(bad ? 1 : 0);
})();
