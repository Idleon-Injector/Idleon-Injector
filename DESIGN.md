# Design direction

The look the WebUI is heading for, agreed with the maintainer. So far it covers buttons and icons, decided on 2026-11-20
over four rounds of a concept board and built across the whole menu, and the page layout (#26), chosen the same day from
a live concept. The rest of the look (tabs, navigation, tags and colour) waits for the later passes.

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

Which kind a button is:

- **Main is blue, and rare.** An area has at most one main button, its main action: Save settings, Enable Auto Play,
  First scan (Next scan once a scan has run), the Accept of a dialog. Most pages have none.
- **Quiet is every other action,** row buttons and bulk ones alike: Max, Max all, Register, Refresh, Undo, Undo all.
- **Danger is anything that removes or lowers:** Reset, Zero, Clear, Remove, Disable, Lock, Unequip. A button that
  switches between two actions (Enable / Disable) takes the kind of the action it shows.
- **The − / + beside a value field** are quiet round buttons holding the minus and plus icons.
- **Labels are in normal case,** like "Max all omega" or "Save settings": no `text-transform: uppercase` on a button and no
  capitals typed into a label. Proper names keep theirs (Auto Play, Pets+).
- **A quiet toggle that is on** (Watching, Saved, the Config drawer) keeps its hover fill.
- **"Click again"** (a risky press asking to be sure) lies over the button as the same pill, in the colours its kind has
  on hover, and its wash drains away.
- Tabs, navigation, on/off switches and tiles aren't action buttons. An on/off state is a switch (see Page layout).

Values:

- **Size:** 36 px high with 18 px side padding and 16 px text; the small size is 28 px high, 13 px padding and 14.5 px
  text.
- **Main:** text `#63afed` on `rgba(99, 175, 237, 0.14)`. On hover, `#9acbf3` on `rgba(99, 175, 237, 0.22)`.
- **Quiet and danger:** text `#d8dbe5`, no background. Quiet on hover: `#eceff8` on `rgba(255, 255, 255, 0.06)`.
  Danger on hover: `#ec8d7a` on `rgba(236, 141, 122, 0.12)`. Until the colour pass, the existing danger tokens stand in
  for the coral: `--c-danger-soft-text` (`#ffb2a5`) on `--c-danger-10` (`rgba(243, 71, 71, 0.1)`).
- **Disabled:** text `rgba(236, 239, 248, 0.34)`. A disabled main button keeps a `rgba(255, 255, 255, 0.04)` pill.
- **Focus:** a 2 px accent outline, 2 px out.
- **Press:** `scale(0.94)`.
- **Motion:** colours and scale ease over 160 ms with `cubic-bezier(0.2, 0.7, 0.2, 1)`.

Write colours as hex or `rgba()`, in one set that the WebUI and the game share. The Steam client runs Chromium 87, which has no `oklch()` or `color-mix()`.

In the code the kinds are `.btn-main`, `.btn-quiet` and `.btn-danger`, with `.btn-sm` and `.btn-icon`, in
`src/ui/styles/_buttons.css`; an `ActionButton`'s `variant` is `main`, `quiet` or `danger` (or `switch` for an on/off
switch). Icons are in `src/ui/assets/icons.js`.

## Icons

The icons are original drawings in one language: lines and dots. They follow five rules:

- round ends and joins, no fills except dots, the undo tip and a favourite's star;
- no frames or enclosing shapes, so no circle around the warning mark and no triangle;
- no sharp arrowheads: a direction ends in a soft, rounded tip, and the one chevron bends softly;
- one idea per icon, as few strokes as it takes;
- three weights: marks you act on are 2.4 (check, undo, close, minus, plus, the search handle); outlines are 2.0 (the
  lens, the slider lines and knobs); the warning mark is 2.8.

The WebUI has eleven icons: the eight below from the concept board, and three drawn after it in the same rules
(chevron, star, copy). Everywhere else it uses words, or nothing:

- a button that only had an icon has a word now (Edit, Watch, Keys, Refresh, Remove);
- an empty or failed list is text only (`EmptyState`), and a failure leads its title with the warning mark;
- the brand marks (the logo, GitHub) and the game's own marks on two game pages (Crown on Rat King, CardTier on Card
  Search) keep their drawings.

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

| Icon     | What it is                                                                                                 | Drawing                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| check    | a soft tick                                                                                                | `<path d="M5.5 12.6 8.7 15.8Q9.7 16.8 10.6 15.7L18.5 7.4" stroke-width="2.4"/>`                                                                                                                                                                                                                                                                                      |
| undo     | one U-bend ending in a rounded tip                                                                         | `<path d="M10 16.5H14a4.5 4.5 0 0 0 0-9H7.6" stroke-width="2.4"/><path d="M3.9 7.5 7.6 5V10Z" fill="currentColor" stroke-width="1.4"/>`                                                                                                                                                                                                                              |
| settings | two sliders with round knobs                                                                               | `<path d="M4.5 8h2.3M12 8h7.5M4.5 16h7.9M17.6 16h1.9"/><circle cx="9.4" cy="8" r="2.6"/><circle cx="15" cy="16" r="2.6"/>`                                                                                                                                                                                                                                           |
| warning  | a bare bar and dot                                                                                         | `<path d="M12 5.5v8.6" stroke-width="2.8"/><circle cx="12" cy="18.4" r="1.75" fill="currentColor" stroke="none"/>`                                                                                                                                                                                                                                                   |
| search   | a lens with a short handle                                                                                 | `<circle cx="10.6" cy="10.6" r="5.2"/><path d="M14.6 14.6 17.8 17.8" stroke-width="2.4"/>`                                                                                                                                                                                                                                                                           |
| close    | a small X                                                                                                  | `<path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke-width="2.4"/>`                                                                                                                                                                                                                                                                                                          |
| minus    | a short stroke                                                                                             | `<path d="M7.5 12h9" stroke-width="2.4"/>`                                                                                                                                                                                                                                                                                                                           |
| plus     | short strokes                                                                                              | `<path d="M12 7.5v9M7.5 12h9" stroke-width="2.4"/>`                                                                                                                                                                                                                                                                                                                  |
| chevron  | one soft bend, for a group that opens and closes; drawn pointing down and rotated for the other directions | `<path d="M7.5 10 10.6 13.1Q12 14.5 13.4 13.1L16.5 10" stroke-width="2.4"/>`                                                                                                                                                                                                                                                                                         |
| star     | the favourite: five soft, rounded points; an outline, filled (`fill: currentColor`) when it is a favourite | `<path d="M12.79 6.31L13.88 8.72Q14.29 9.63 15.29 9.74L17.91 10.04Q19.8 10.25 18.4 11.53L16.45 13.31Q15.71 13.99 15.91 14.97L16.44 17.56Q16.82 19.42 15.17 18.48L12.87 17.18Q12 16.68 11.13 17.18L8.83 18.48Q7.18 19.42 7.56 17.56L8.09 14.97Q8.29 13.99 7.55 13.31L5.6 11.53Q4.2 10.25 6.09 10.04L8.71 9.74Q9.71 9.63 10.12 8.72L11.21 6.31Q12 4.58 12.79 6.31Z"/>` |
| copy     | a sheet over the corner of another                                                                         | `<rect x="9.5" y="9.5" width="9" height="9" rx="2.2"/><path d="M6 14.5V8a2 2 0 0 1 2-2h6.5"/>`                                                                                                                                                                                                                                                                       |

Rejected, so the design pass doesn't drift back:

- **Stock line icons** (the Lucide style the WebUI has now) were "very loud in what is happening instead of easy to
  digest". For example, a warning triangle with a bar inside, or a toothed gear.
- **An undo with a chevron, or one close to a circle,** reads as refresh or feels sharp. The maintainer turned down all
  four that were drawn that way.
- **The thinner 1.5 weight** was passed over for heavier lines.

- **A sharp star** (thin points meeting in corners) was too rough on the eye; the star is soft and rounded instead.

## Decided after the board

- **Quiet − / +:** chosen (above).
- **Rounded value rows:** chosen after comparing the menu with and without them. Value rows have 10 px corners and their
  fields 9 px, so the pill buttons don't sit in sharp boxes.
- **Mint saved tick:** not taken. Colours come later, in their own pass.

## Page layout

Every page has the same parts in the same places (#26). The maintainer chose them from a live concept with four A/B
switches, picking the first option each time.

- **The top:** the title and its description on the left, the page's buttons on the right of the same row. When the
  buttons don't fit beside 26rem of description, they move to the line under it, still on the right, so the description
  never becomes a thin column. Search and filters go on the line under the title (`toolbar` on the page wrapper);
  inner tabs stay above the title. One thin rule runs under the whole top.
- **Values show once.** A number lives in its field. A badge only adds what the field doesn't say: a cap
  (`LV 3 / 10`), or a state (Locked, Complete). A badge that repeats the field is left out.
- **Sections** are a plain heading in small muted capitals over a thin rule, with the rows straight under it. No box
  inside the page box. The heading's row can carry the section's own controls (Set all) on the right.
- **On/off is one switch** (`StateSwitch`) with the game's own word for the state beside it: Owned / Not owned,
  Unlocked / Locked, On / Off. It saves on flip; the row shows saving, the ✓ and Undo like any save, and the switch
  goes back if the game refuses. The words keep one width, so the switches in a list line up. A switch is reachable
  and flips from the keyboard; it has no glow.
- **In the narrow overlay** a value row keeps its name and badge on the first line and puts the field and its buttons
  on the line under it.
- **A search with no results** shows the shared empty state (`EmptyState`), and a save's error shows next to its field.

Not switches, on purpose: picks with a limit or an order (the 2× doublers, Organic labels, palette stars, the cape
vine, prayer slots, bundle purchases) keep their buttons.
