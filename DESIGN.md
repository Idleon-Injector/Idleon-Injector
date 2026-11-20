# Design direction

The look the WebUI is heading for, agreed with the maintainer. The design pass builds it; nothing in the code uses it
yet. So far it covers buttons and icons, decided on 2026-11-20 over four rounds of a concept board. The rest of the look
waits for the design pass.

## What it should feel like

Very simple, but refined, and never cheap. Cheap means glow, gradients, heavy fills and borders, mixed icon styles, and
shouting text. Lumify's buttons are the nearest reference, made quieter.

## Buttons

There are three kinds of button, all pills (`border-radius: 999px`) set in Rajdhani 600.

| Kind   | At rest                           | On hover                                 |
| ------ | --------------------------------- | ---------------------------------------- |
| Main   | the accent on a faint accent wash | the wash gets stronger, the text lighter |
| Quiet  | plain words, no shape             | a soft light fill                        |
| Danger | plain words, the same as quiet    | coral words on a faint coral wash        |

Quiet buttons are plain words at rest on purpose: the maintainer chose that over a faint outline or a faint fill.

Values:

- **Size:** 36 px high with 18 px side padding and 16 px text; the small size is 28 px high, 13 px padding and 14.5 px
  text.
- **Main:** text `#63afed` on `rgba(99, 175, 237, 0.14)`. On hover, `#9acbf3` on `rgba(99, 175, 237, 0.22)`.
- **Quiet and danger:** text `#d8dbe5`, no background. Quiet on hover: `#eceff8` on `rgba(255, 255, 255, 0.06)`.
  Danger on hover: `#ec8d7a` on `rgba(236, 141, 122, 0.12)`.
- **Disabled:** text `rgba(236, 239, 248, 0.34)`. A disabled main button keeps a `rgba(255, 255, 255, 0.04)` pill.
- **Focus:** a 2 px accent outline, 2 px out.
- **Press:** `scale(0.94)`.
- **Motion:** colours and scale ease over 160 ms with `cubic-bezier(0.2, 0.7, 0.2, 1)`.

Write colours as hex or `rgba()`. The Steam client runs Chromium 87, which has no `oklch()` or `color-mix()`.

## Icons

The icons are original drawings in one language: lines and dots. They follow five rules:

- round ends and joins, no fills except dots and the undo tip;
- no frames or enclosing shapes, so no circle around the warning mark and no triangle;
- no chevron arrowheads: a direction ends in a soft, rounded tip;
- one idea per icon, as few strokes as it takes;
- three weights: marks you act on are 2.4 (check, undo, close, minus, plus, the search handle); outlines are 2.0 (the
  lens, the slider lines and knobs); the warning mark is 2.8.

Each icon is drawn on a 24 × 24 grid and shown at 16 or 20 px. Every icon goes inside this wrapper:

```html
<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
>
    <!-- the icon's drawing -->
</svg>
```

The drawings:

| Icon     | What it is                         | Drawing                                                                                                                                 |
| -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| check    | a soft tick                        | `<path d="M5.5 12.6 8.7 15.8Q9.7 16.8 10.6 15.7L18.5 7.4" stroke-width="2.4"/>`                                                         |
| undo     | one U-bend ending in a rounded tip | `<path d="M10 16.5H14a4.5 4.5 0 0 0 0-9H7.6" stroke-width="2.4"/><path d="M3.9 7.5 7.6 5V10Z" fill="currentColor" stroke-width="1.4"/>` |
| settings | two sliders with round knobs       | `<path d="M4.5 8h2.3M12 8h7.5M4.5 16h7.9M17.6 16h1.9"/><circle cx="9.4" cy="8" r="2.6"/><circle cx="15" cy="16" r="2.6"/>`              |
| warning  | a bare bar and dot                 | `<path d="M12 5.5v8.6" stroke-width="2.8"/><circle cx="12" cy="18.4" r="1.75" fill="currentColor" stroke="none"/>`                      |
| search   | a lens with a short handle         | `<circle cx="10.6" cy="10.6" r="5.2"/><path d="M14.6 14.6 17.8 17.8" stroke-width="2.4"/>`                                              |
| close    | a small X                          | `<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-width="2.4"/>`                                                                             |
| minus    | a short stroke                     | `<path d="M7.5 12h9" stroke-width="2.4"/>`                                                                                              |
| plus     | short strokes                      | `<path d="M12 7.5v9M7.5 12h9" stroke-width="2.4"/>`                                                                                     |

Rejected, so the design pass doesn't drift back:

- **Stock line icons** (the Lucide style the WebUI has now) were "very loud in what is happening instead of easy to
  digest". For example, a warning triangle with a bar inside, or a toothed gear.
- **An undo with a chevron, or one close to a circle,** reads as refresh or feels sharp. The maintainer turned down all
  four that were drawn that way.
- **The thinner 1.5 weight** was passed over for heavier lines.

## Not decided yet

- **Mint saved tick:** the concept board drew the saved ✓ in `#80daac` instead of the current green.
- **Rounded value rows:** it gave value rows 10 px corners and their fields 9 px.
- **Quieter − / +:** it made the − / + beside a value field quiet instead of accent.

These went with the board but weren't chosen, so the design pass decides them.
