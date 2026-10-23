# Authoring programs as JSON

cWeDo CPE's **Save As** writes the board as a `.wedo.json` file and **Open** reads it
back. An agent can therefore *create* a program by writing that file directly. This doc
is the complete reference. Ready-made files live in this directory:

- [`template/`](template/README.md) — one file that uses **every** block and option.
  Copy from it.
- The `*.wedo.json` files here are the **recipes**: runnable programs, each with a
  picture of its whiteboard (`<name>.png`). See [README.md](README.md) and
  [index.html](index.html). Look at the closest one before writing from scratch.

`test/recipes.test.js` loads every file in those directories through the app's own
`applyProgram` and checks them against the block rules below, and checks that this doc
names every block in the tray — so they cannot silently drift from the code.

## 1. File envelope

```json
{ "format": "wedo-cpe-program", "version": 1, "stacks": [ /* stack, stack, ... */ ] }
```

Anything else (wrong `format`, no `stacks` array) is rejected and the board is left
untouched. A recipe file also carries a `meta` block, which the app ignores and the recipes page
reads (section 7). A **stack** is one column of blocks:

```json
{ "id": 1, "x": 60, "y": 100, "items": [ /* item, item, ... */ ] }
```

- `id` — unique integer per stack.
- `x`, `y` — position on the canvas (unscaled units). Keep `x` ≥ 10 and `y` ≥ 71.
  Space stacks about **260** apart vertically, or **480** if the stack contains a
  Repeat (the arch is tall). Overlap is harmless to execution, only to readability.
- `items` — the blocks in order. **The first item must be a Start block** (section 3),
  or nothing can trigger the stack.

## 2. Item kinds

| `t`   | Meaning | Shape |
|-------|---------|-------|
| `"b"` | A code block | `{"t":"b","key":"MotorOffBlock","input":null}` |
| `"r"` | Repeat (a loop that wraps `children`) | `{"t":"r","input":null,"children":[...]}` |
| `"i"` | A loose input lying on the canvas, not in a socket | `{"t":"i","key":"NumberInput","value":"1"}` — not useful for programs; avoid |

**Sockets.** Blocks marked *socket* below take one input, stored on the block itself:

```json
{ "t":"b", "key":"MotorOnForBlock", "input":"NumberInput", "inputValue":"3" }
```

- `input` is the key of an input block (section 5), or `null` for an empty socket.
- `inputValue` holds the typed value for `NumberInput` / `TextInput`, **always as a
  string** (`"3"`, not `3`). The other inputs (`RandomInput`, `DisplayInput`,
  sensors) have no value; omit `inputValue`.
- An empty socket on a block that needs one is skipped at run time (logged, nothing
  happens). Fill every socket.

## 3. Blocks

Keys are exact and case-sensitive. "Default" is what the tray places.

### Flow

| Key | Label | Socket | Notes |
|-----|-------|--------|-------|
| `StartBlock` | Start | — | Runs when the Play button for the stack is pressed. |
| `StartOnMessageBlock` | Start On Message | text/number | Runs when a Send Message with the **same text** fires (case-sensitive, edges trimmed). Default `TextInput "abc"`. |
| `SendMessageBlock` | Send Message | text/number | Broadcasts the message; doesn't wait for receivers. |
| `WaitForBlock` | Wait For | number or condition | Number = seconds (default 3). Condition = waits until it's true (state) or until the next occurrence (change). |
| `RepeatBlock` | Repeat | number or condition | Not a `b` item: use `t:"r"`, see section 4. |
| `StartOnKeyPressBlock` | Start On Key Press | — | Extra field `"letter"`: one of `0-9`, `a-z`, `A-Z` (default `"A"`). Case-sensitive. |
| `StartOnButtonPressBlock` | Hub Button | — | Runs when the Smarthub's button is pressed. |

### Motor

| Key | Label | Socket | Notes |
|-----|-------|--------|-------|
| `MotorThisWayBlock` | Motor This Way | — | Sets direction. |
| `MotorThatWayBlock` | Motor That Way | — | Sets direction (opposite). |
| `MotorPowerBlock` | Motor Power | number | Level **1–10** (capped at 10). Default `"5"`. |
| `MotorOnForBlock` | Motor On For | number | Seconds (default 3). **Skipped unless a power block and a direction block ran earlier.** Stops the motor afterwards. |
| `MotorOffBlock` | Motor Off | — | Coast to a stop. |
| `MotorBrakeBlock` | Brake | — | Instant stop. |

### Output

| Key | Label | Socket | Notes |
|-----|-------|--------|-------|
| `LightBlock` | Light | number | Hub LED colour **0–10**: 0 off, 1 pink, 2 purple, 3 blue, 4 sky blue, 5 teal, 6 green, 7 yellow, 8 orange, 9 red, 10 white. Optional `"customRGB":{"r":0,"g":255,"b":128}` (each 0–255) **overrides** the input (`input` may then be `null`). |
| `PlaySoundBlock` | Play Sound | number | Sound **1–28** (robot 1, fly, frog, dolphin, race car, boing, bubbles, game alarm, splash, door click, thunder, cheer, helicopter, machinery, lion, noise, breaking, rain, bird, zapping, short beep, long beep, base drum, high hat, intense, security alarm, celebration, robot 2). **0** = the user's own recording. Waits for the sound to end. |
| `PlayToneBlock` | ♪ Tone | number | Seconds (default `"1"`). Extra fields `"note"`: `C C# D D# E F F# G G# A A# B` (default `"A"`); `"octave"`: integer **1–6** (default `4`). Plays on the tablet speaker and is sent to the hub (the retail hub has no speaker). |
| `DisplayBackgroundBlock` | Display Background | number | Picture **0–28** (0 = plain white). Opens the on-screen display. |
| `DisplayBlock` | Display | text/number | Shows the value. |
| `AddtoDisplayBlock` | Add to Display | number | Display number `+` value. |
| `SubtractfromDisplayBlock` | Subtract from Display | number | `−` value. |
| `MultiplybyDisplayBlock` | Multiply Display | number | `×` value. |
| `DividebyDisplayBlock` | Divide Display | number | `÷` value (÷0 ignored). |
| `DisplayClosedBlock` | Display Closed | — | Hides the display. |
| `DisplayMediumsizeBlock` | Display Medium Size | — | |
| `DisplayFullsizeBlock` | Display Full Size | — | |

## 4. Repeat

```json
{ "t":"r", "input":"NumberInput", "inputValue":"4", "children":[ /* items */ ] }
```

| `input` | Behaviour |
|---------|-----------|
| `null` | Repeats **forever**. It must be the **last item of its sequence** (nothing may follow it). |
| `NumberInput` / `RandomInput` / `DisplayInput` / `DistanceSensorInput` | Repeats that many times (default 3; ≤0 means never). Blocks may follow. |
| a condition (section 5) | Repeats **until** the condition happens. Blocks may follow. |

Repeats can be nested. Start blocks can't go inside `children`.

## 5. Input blocks (values for sockets)

| Key | Label | Value | Accepted by |
|-----|-------|-------|-------------|
| `NumberInput` | Number Input | `inputValue` string, e.g. `"2.5"` | every socket |
| `TextInput` | Text Input | `inputValue` string | `StartOnMessageBlock`, `SendMessageBlock`, `DisplayBlock` only |
| `RandomInput` | Random Input | none; range comes from the parent (mostly 1–10, Light 0–10, Display 0–10) | numeric sockets |
| `DisplayInput` | Display Input | none; the display's current number | numeric sockets |
| `DistanceSensorInput` | Distance Sensor Input | none; live distance 0–10 | numeric sockets |

**Conditions** — accepted **only** by `WaitForBlock` and `RepeatBlock`:

| Key | Label | Kind |
|-----|-------|------|
| `AnyDistanceChange` | Any Distance Change | change (moment) |
| `DistanceChangeCloser` | Distance Change Closer | change |
| `DistanceChangeFurther` | Distance Change Further | change |
| `AnyTilt` | Shake | change |
| `TiltUp` | Tilt Up | state (true while held) |
| `TiltDown` | Tilt Down | state |
| `TiltThisWay` | Tilt This Way | state |
| `TiltThatWay` | Tilt That Way | state |
| `TiltSensorInput` | Tilt Sensor No Tilt | state |
| `SoundSensorInput` | Sound Sensor Change | change (tablet microphone) |

Distance/tilt conditions need the matching sensor on a hub port (the program just waits
if it's absent). Sound Sensor Change needs the tablet microphone (the app asks for it when the block is
on the board or the program runs).

## 6. Checklist before saving the file

1. Envelope is `{"format":"wedo-cpe-program","version":1,"stacks":[...]}` (plus the optional `meta` above).
2. Every stack has a unique integer `id`, numeric `x`/`y`, and a first item that is a Start block.
3. Every `key` is spelled as in section 3/5; code blocks use `t:"b"`, loops use `t:"r"`.
4. Every `input` is legal for its parent (section 5 tables); values are strings.
5. A forever Repeat is last in its sequence. Motor On For is preceded by power + direction.
6. Validate by opening the file in the app (a bad file shows an error banner and changes nothing), or `npm test`.

## 7. Adding a recipe (what the recipes page needs)

Everything in this directory is published as a browsable page (`index.html`) that finds
recipes automatically. To add one:

1. Write `recipes/<name>.wedo.json` (kebab-case name). Put a `meta` block between
   `version` and `stacks`:

   ```json
   "meta": {
     "title": "Short human title",
     "description": "One or two sentences: what it does and how to trigger it.",
     "author": "Who created the program (a person, team, or organisation)",
     "source": "https://… (optional: where the original came from)",
     "needs": ["Motor", "Tilt sensor"],
     "tags": ["motor", "tilt"]
   }
   ```

   `author` is required and is shown on the page. If the program is based on someone
   else's work (for example LEGO Education material), name them as the author and put the
   original's URL in `source`. For a demo program written for a LEGO Education model use exactly
   `LEGO Education (model) · cWeDo CPE contributors (program)`, the PDF as `source`, tag `lego`, and
   say in the description that LEGO's instructions contain no program; never present borrowed work as your own. `needs` lists hardware (empty array if none); `tags` are lowercase words used for the
   page's filter chips (reuse existing tags where one fits).
2. Check it: `node scripts/check-recipe.js recipes/<name>.wedo.json` (loads it into the
   real app and checks every rule above).
3. Render its whiteboard picture, `recipes/<name>.png`, with `npm run render:recipes`
   (headless Chrome loads the file in the real app and screenshots the canvas, so the block
   art is exact; it renders only recipes that have no picture yet, or `-- --all`).
4. Run `npm run build:recipes` to refresh `recipes/manifest.json`, then `npm test`.
   The tests check the file loads, follows the rules above, has `meta` and a picture, and
   that the manifest is current.

## Tradeoffs

- The format is the app's internal model; there is no schema version bump when blocks
  are added. This doc and `template/` and the recipes are kept in step by the tests above.
- Rules the app doesn't enforce on load (a stack not starting with Start, a bad key) will
  load but misbehave. Treat the checklist as required.
