# Canvas panning, zoom, and scrollbars

The program canvas (`#stage` in [index.html](../index.html), holding the
3200×1800px `#sheet` in [css/style.css](../css/style.css)) is bigger than the
visible viewport at every zoom level, so it has always needed to scroll/pan in
both directions.

## What changed

Before this change, `#stage` was a plain `overflow:auto` element: touch
devices could pan it with a finger (native `touch-action:pan-x pan-y`
scrolling), but a mouse press on blank canvas did nothing — the *only* way to
pan sideways with a mouse was to grab the browser's own scrollbar, which also
sat visibly across the bottom/side of the canvas.

Now:

- `#stage::-webkit-scrollbar{display:none}` hides the native scrollbar
  chrome, matching the pattern already used for `#traytabs`.
- A mouse press-and-drag on any blank part of the canvas (i.e. not on a
  `.blk` block) pans it by adjusting `scrollLeft`/`scrollTop` directly (see
  the `panDrag` state in [js/app.js](../js/app.js)), with the cursor
  switching from `grab` to `grabbing` while active.
- Touch panning is unchanged — it still uses the browser's native scroll.

## Why

The block canvas is meant to feel like a whiteboard with dedicated zoom
(+/-) controls, not a scrollable web page, so a visible OS scrollbar was
inconsistent with that and mouse users had no drag-to-pan equivalent to what
touch users already had.

## Mouse wheel now zooms instead of scrolling

`#stage` also had a plain wheel-scroll (vertical, or horizontal with Shift),
which fought with the dedicated zoom (+/-) buttons and just scrolled the
oversized 3200×1800px sheet. A `wheel` listener on `#stage` now calls
`preventDefault()` and drives the same `setZoom()` step the +/- buttons use
(scroll up = zoom in, scroll down = zoom out) instead. Panning with a mouse
still works via the click-drag added above; touch is unaffected.

## Save/Open moved top-left with classic icons

The Save As / Open buttons used to live in the zoom rail on the right
(`#rail`), sharing space with the zoom controls. They're now their own
`#filerail` group at the top-left of the canvas, using recognisable
"old-school" icons — a floppy disk for Save As, a folder for Open — instead
of the previous download-arrow/box glyphs.

## Two-finger pinch to zoom (touch)

`touch-action:pan-x pan-y` on `#stage` (needed so a one-finger drag pans
instead of triggering the browser's own scroll-elastic effects) also has a
side effect: it tells the browser not to handle pinch gestures itself, and
the `user-scalable=no` viewport meta blocks page-level pinch zoom too — so
without our own handling, a second finger had nowhere to go and pinching
did nothing.

`js/app.js` now tracks touch pointers on `#stage` in a `touchPts` map. When
a second one lands, it safely drops anything mid-drag (`finishDrag`), and
tracks the distance between the two touch points as a `pinch` baseline
(`{dist, cu0}`). Every subsequent `pointermove` for either finger rescales
zoom directly — `applyZoom(pinch.cu0 * (currentDist / pinch.dist))` — so
the canvas zooms continuously with the pinch instead of stepping like the
+/- buttons or wheel. `applyZoom()` is a small helper factored out of the
old `setZoom()` so both the discrete (+/- buttons, wheel) and continuous
(pinch) zoom paths share the same clamping (`70`–`190`) and render.
