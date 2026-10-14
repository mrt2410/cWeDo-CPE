# Full template

[`full-template.wedo.json`](full-template.wedo.json) is a valid cWeDo CPE program that
uses **every block in the tray**, every tone note, custom RGB light, all three kinds of
Repeat (forever, counted, until-condition, nested), and every sensor condition as both a
Wait For and a Repeat input. Open it in the app (Open → pick the file) to see it.

**For agents:** treat it as a catalogue. Copy the stack that shows the block you need,
change values, give each stack a unique `id`, and position it with `x`/`y`. Rules,
value ranges and the block list are in
[SKILL.md](../AGENTS.md).

The stacks are grouped by topic, top to bottom:

1. Motor family (direction, power, on-for, brake, off)
2. Messaging and Wait For
3. Key press, Light (palette, random, custom RGB), Play Sound
4. Hub Button with all 12 notes; tone octave extremes
5. Display family
6. Live numeric inputs (distance, display, random)
7. Repeat forever; counted/random; until each condition; nested
8. Wait For each sensor condition

It is a catalogue, not a sensible program: running it plays everything in turn and
several stacks wait on sensors. `npm test` (`test/recipes.test.js`) fails if a block is
added to the tray and not to this file.
