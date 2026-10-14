/* Shared by test/recipes.test.js and scripts/check-recipe.js: the block rules a
   program file must follow, checked against the app's own tables. */
const KEY_CHARS = new Set("1234567890qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKLZXCVBNM");
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];


function validateProgram(data, t) {
  const errors = [];
  const ids = new Set();
  const checkSeq = (items, where, inLoop) => {
    items.forEach((it, i) => {
      const at = `${where}[${i}]`;
      if (it.t === "r") {
        if (it.input != null && !t.canAccept("RepeatBlock", it.input)) errors.push(`${at}: Repeat cannot take ${it.input}`);
        if (!Array.isArray(it.children)) { errors.push(`${at}: Repeat needs children[]`); return; }
        if (it.input == null && i !== items.length - 1) errors.push(`${at}: infinite Repeat must be last in its sequence`);
        checkSeq(it.children, `${at}.children`, true);
        return;
      }
      if (it.t !== "b") { errors.push(`${at}: unknown item kind ${it.t}`); return; }
      if (!t.S[it.key] || t.INPUTS.has(it.key) || it.key === "RepeatBlock") { errors.push(`${at}: ${it.key} is not a code block`); return; }
      if (t.STARTS.has(it.key) && (i !== 0 || inLoop)) errors.push(`${at}: ${it.key} may only head a stack`);
      if (it.input != null) {
        if (!t.SOCKETED.has(it.key)) errors.push(`${at}: ${it.key} has no socket`);
        else if (!t.INPUTS.has(it.input) || !t.canAccept(it.key, it.input)) errors.push(`${at}: ${it.key} cannot take ${it.input}`);
      }
      if (it.letter != null && (it.key !== "StartOnKeyPressBlock" || !KEY_CHARS.has(it.letter))) errors.push(`${at}: bad letter`);
      if (it.note != null && (it.key !== "PlayToneBlock" || !NOTES.includes(it.note))) errors.push(`${at}: bad note`);
      if (it.octave != null && (it.key !== "PlayToneBlock" || !Number.isInteger(it.octave) || it.octave < 1 || it.octave > 6)) errors.push(`${at}: bad octave`);
      if (it.customRGB != null) {
        const c = it.customRGB;
        if (it.key !== "LightBlock" || ![c.r, c.g, c.b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) errors.push(`${at}: bad customRGB`);
      }
    });
  };
  data.stacks.forEach((st, n) => {
    const at = `stacks[${n}]`;
    if (!Number.isInteger(st.id) || ids.has(st.id)) errors.push(`${at}: id missing or duplicated`);
    ids.add(st.id);
    if (typeof st.x !== "number" || typeof st.y !== "number") errors.push(`${at}: x/y must be numbers`);
    if (!Array.isArray(st.items) || st.items.length === 0) { errors.push(`${at}: items empty`); return; }
    if (st.items[0].t !== "b" || !t.STARTS.has(st.items[0].key)) errors.push(`${at}: must begin with a Start block`);
    checkSeq(st.items, `${at}.items`, false);
  });
  return errors;
}

module.exports = { validateProgram, KEY_CHARS, NOTES };
