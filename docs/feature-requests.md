# Feature requests

Ideas that have been asked for but not built. Each entry says what's wanted, why it
doesn't work today, and what it would take.

## Connect to multiple Smarthubs at once

**Status:** requested 2026-10-13, not started.

**Request:** the app connects to only one Smarthub at a time. Allow several hubs to be
connected simultaneously (e.g. one program driving two hubs).

**Current behavior:** a deliberate design choice, not a Bluetooth limit. It is enforced in
[js/app.js](../js/app.js):

- `connectedHub()` returns the first hub with `connected` set; everything treats that as
  "the hub".
- `connect()` and `search()` bail out with "Disconnect the current Smarthub first." when
  a hub is already connected.
- `renderHubs()` disables the search button, marks other hubs `blocked`, and shows
  "Only one Smarthub at a time…".

**Why it isn't a one-line fix:**

- Command-sending code calls `connectedHub()`: [motor.js](../js/blocks/motor.js),
  [rgb-light.js](../js/blocks/rgb-light.js), [core.js](../js/blocks/core.js). Blocks have
  no notion of a target hub.
- Sensor and port state is global (`onSensorValue`, `onPortEvent`, `clearSensors()`); a
  second hub's readings would overwrite the first's, and `connect()` clears sensors on
  every connection.
- Auto-reconnect and the top-bar hub widget remember a single hub (`wedo:lastHub`).

**Browser side:** Web Bluetooth can hold several GATT connections at once (roughly 5–7,
depending on the adapter). `requestDevice()` returns one device per call, so each hub
needs its own pick. `hubs` is already a `Map`, so storage isn't the obstacle.

**Sketch of the work:**

1. Remove the single-hub guards in `connect`, `search` and `renderHubs`.
2. Give blocks a target hub (`connectedHub()` becomes "the hub assigned to this block").
3. Key sensor/port state by hub.
4. Make auto-reconnect remember a list of hubs.

**Open question:** how a block chooses its hub — a per-block selector, or simple
"hub A / hub B" labelling.
