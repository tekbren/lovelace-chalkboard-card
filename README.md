# Lovelace Chalkboard Card

> **Status: Beta, under active development.** Deployed and being tested on
> one household kiosk so far — not yet broadly tested across devices/HA
> versions. Interfaces and behavior may still change before a stable 1.0.

A freeform notes card for Home Assistant dashboards, styled as an actual
chalkboard rather than a plain drawing canvas — textured slate background,
grainy chalk-style strokes, and an eraser that smudges instead of resetting
to pristine, the same way a real chalkboard eraser never fully cleans in
one pass.

![Chalkboard card on a Home Assistant kiosk dashboard, showing coloured chalk notes, the chalk-colour swatches and the dust-board eraser](screenshot.png)

This is built for casual notes, not permanent artwork. There is
deliberately no save/export/undo/history — it's meant to be written over,
not preserved. It quietly persists to this browser's own `localStorage` so
it survives reloads and reboots on this specific device, and nothing more.

## Why a custom card instead of an existing one?

There isn't one. The [Home Assistant community has been asking for a
canvas/whiteboard card since 2019](https://community.home-assistant.io/t/lovelace-whiteboard-html-canvas-drawing-card/351622) —
one person started building something, said outright "never really
finished it," and the thread stalled with no working solution.

## Install

**Via HACS:**
1. HACS → Frontend → ⋮ → Custom repositories
2. Add this repo's URL, category: Dashboard
3. Install, then add the card to a view:
   ```yaml
   type: custom:chalkboard-card
   ```

**Manually:**
1. Copy `chalkboard-card.js` into your `config/www/` folder
2. Settings → Dashboards → Resources → add `/local/chalkboard-card.js`,
   type: JavaScript Module
3. Add `type: custom:chalkboard-card` to a view

## Configuration

| Option | Default | Description |
|---|---|---|
| `id` | `default` | Storage key suffix, only needed if you add more than one chalkboard card to the same dashboard and want them to persist separately |
| `height` | `360px` | Card height (CSS value) |

## Using it

- **Draw**: one finger/stylus/mouse.
- **Pinch-zoom / pan**: two fingers. Useful for writing smaller or reading
  detail without needing the card to take up the whole screen. Tap "Reset
  view" to snap back.
- **Erase**: smudges the board rather than fully clearing it — click it
  again for a cleaner pass. This is deliberate, not a bug.
- Notes save automatically a moment after you stop drawing. There's nothing
  to click to save, and nothing to undo.

## Notes

- Canvas resolution is set from the device's actual pixel density
  (`devicePixelRatio`), so strokes stay crisp rather than blurry regardless
  of the card's on-screen size.
- Persistence is per-browser (`localStorage`), not synced through Home
  Assistant — if you view the same dashboard from a different device, you
  won't see the same board. Fine for a single fixed kiosk; would need a
  different design for multiple synced displays.
- No configuration options beyond size/storage key, no build step, no
  dependencies by design.

## License

MIT
