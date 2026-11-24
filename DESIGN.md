# Design direction

The look the WebUI is heading for, agreed with the maintainer. So far it covers buttons and icons, decided on 2026-11-20
over four rounds of a concept board and built across the whole menu, and the page layout (#26), chosen the same day from
a live concept, and colour ("Dusk", picked from three concepts, then "Ink" from concept finish-2 on 2026-11-21). Tabs
got their pass on Stamps on 2026-11-21 (Lists with tabs, at the end), and the menu became one sidebar list that drills
down; tags wait for a later pass.

## What it should feel like

Very simple, but refined, and never cheap. Cheap means glow, gradients, heavy fills and borders, mixed icon styles, and
shouting text. Lumify's buttons are the nearest reference, made quieter.

## Page standards

Every page follows these, the same way. `test`: `npm test` renders every page on the shared look on the fake game and
checks it (`scripts/page-standards/`). `shots`: `npm run page-shots` measures it at 1440 and 400 px, at rest and with
every row's controls showing, and fails the run on a break (`scripts/page-shots/layout.mjs`). `review`: a person checks.
A world joins the checks when its pages move to the shared pieces (`ON_STANDARDS` in `checks.mjs`); a break that needs
more than a small fix goes on `KNOWN_BREAKS` there with its issue, and that list only shrinks.

- **Max:** every line whose value has a cap ("2 / 15") has a Max button, and only those; a line without a cap in the
  same list keeps Max's room empty (`field-columns`), so the fields line up. The shared rows do both. A table's line
  (several values under column names: Statues, Pay 2 Win's cauldrons, Tesseract's map kills) has no Max of its own,
  even where a value is capped: the tray's Max all and Set all cover tables. _test, shots_
- **Bulk tools:** Max all and tools that only raise run on one press, and Max all also lowers a value above the max. A
  tool that lowers or takes away asks first, in the tray or in place, never in a popup. _test (takers ask, Max all
  doesn't); each page's tests (lowering)_
- **Set all:** every list with a line without a max has Set all in its tray (`SetAllTool`, the one tool all pages
  use); a list where every line has a max keeps only Max all. The typed number goes to every line. When some line's
  max is lower, the tray asks first, "Stop at max" or "Go past"; when the number would lower a line, it asks first
  too, and one question covers both. Otherwise it runs on one press and every line shows the number after; an empty
  field is refused, never written as 0, and a number one line can't hold stops it before anything is written. A
  table's column counts as lines too: a column without a max needs Set all, a capped one counts as capped lines. A page of unrelated single numbers (Emperor) isn't a list, so it has
  no Set all. A table's Set all sets its Level column (a pet's DNA), never the quiet progress columns (EXP, Charge,
  Amount). A table whose columns are equal (Cooking's Speed, Fire, Luck; a boat's Loot Value, Speed; a trap's Qty, EXP,
  Rare) has a small pick of them before the field, the same height, and the number goes into the picked column only
  (Lumi, #245). _test_
- **All to:** every list whose lines each have their own pick (a step picker: a pet's Off | Normal | Pets+, a
  bubble's Materials | Particles) has one All to tool in its tray with the same steps (`AllToTool`), acting on the
  lines the top bar's search shows. Picks with an order ask first when a press would lower a line; picks without one
  run on one press. A pick out of a long list (an item, a skin, a player) isn't one. _test_
- **Automation:** every automation page is its own page in the Automation section (`world: "automation"`), never a tab
  and never on a system's own page; the system's page links to it beside its title (`automation` on the header). _test_
- **Tabs:** only for a system's own game screens and groups; a tab never holds tabs, its parts are headed groups.
  _test (tabs in a tab), review (which screens)_
- **Row switches:** a setting that switches per line (Omni Jade, Organic) is a button or switch on that line, never a
  tab or page of its own. _test (a tab that lists another tab's lines again, a switch each)_
- **Names:** the game's names in normal case ("Thicc Skin", never THICC*SKIN), and so are titles, tabs, headings and
  buttons; the bonus first where the game has one (`RowTitles`). \_test (capitals), review (bonus first)*
- **Title:** a page's title is its sidebar name, with its system's icon. _test_
- **Search:** old page names stay as search words; the tabs a page declares (`tabs` in `definePage`) are its real tabs;
  a limited gem shop buy sits in a quiet "Gem shop" group on its system's page, found by "gem shop", "limited" and
  "fomo". _test (tabs, gem shop words), review (old names)_
- **Fields:** a value is typed into the shared field (`NumberInput`, through the shared rows), never one drawn by
  hand, so its cap, Max, − / + and saving come with it; also in what a row or a cog opens. _test (each opener pressed)_
- **Picks:** a pick out of a list opens in place (`PickInPlace`), never a dropdown; also in what a row or a cog
  opens. _test (each opener pressed)_
- **Layout:** down a list the fields, switches, a table's columns and opening rows' arrows each line up; − / + sit
  inside their field and a field inside its column; nothing lies over a control or a name; nothing moves when a row's
  controls show; nothing scrolls sideways at 400 px. _shots; a PR fails its summary check on a break on a page it
  touches, and the summary comment names each one_
- **Saving:** on Enter or on leaving the field, said by the row's `SaveState`; no Set or Save buttons. _test_
- **Feedback:** no toasts and no `confirm()` popup; no "Coming soon"; no hover popup explains a row's button; no
  outline or ring left after a click (`:focus-visible` only). _test, no-toasts test_
- **Words:** plain and short, the way Lumify says it ("Couldn't save. Try again."). _review_

## Buttons

There are three kinds of button, all pills (`border-radius: 999px`) set in Fira Sans 600 (`--font-display`).

| Kind   | At rest                           | On hover                                 |
| ------ | --------------------------------- | ---------------------------------------- |
| Main   | the accent on a faint accent wash | the wash gets stronger, the text lighter |
| Quiet  | plain words, no shape             | a soft light fill                        |
| Danger | plain words, the same as quiet    | coral words on a faint coral wash        |

Quiet buttons are plain words at rest on purpose: the maintainer chose that over a faint outline or a faint fill.

Which kind a button is:

- **Main is lavender, and rare.** An area has at most one main button, its main action: Save settings, Enable Auto Play,
  First scan (Next scan once a scan has run), the Accept of a dialog. Most pages have none.
- **Quiet is every other action,** row buttons and bulk ones alike: Max, Max all, Register, Refresh, Undo, Undo all.
- **Danger is anything that removes or lowers:** Reset, Zero, Clear, Remove, Disable, Lock, Unequip. A button that
  switches between two actions (Enable / Disable) takes the kind of the action it shows.
- **The − / + beside a value field** are quiet round buttons holding the minus and plus icons.
- **Labels are in normal case,** like "Max all omega" or "Save settings": no `text-transform: uppercase` on a button and no
  capitals typed into a label. Proper names keep theirs (Auto Play, Pets+).
- **A quiet toggle that is on** (Watching, Saved, the Config drawer) keeps its hover fill.
- **"Click again"** (a risky press asking to be sure) lies over the button as the same pill, in the colours its kind has
  on hover, and its wash drains away. A list with tabs asks in its tray instead (Lists with tabs, below).
- Tabs, navigation, on/off switches and tiles aren't action buttons. An on/off state is a switch (see Page layout).

Values:

- **Size:** 36 px high with 18 px side padding and 16 px text; the small size is 28 px high, 13 px padding and 14.5 px
  text.
- **Main:** the accent (`--c-accent`) on `--c-accent-dim`. On hover, `--c-accent-hover` on `--c-accent-20`.
- **Quiet and danger:** muted text, no background. Quiet on hover: main text on `--c-white-05`. Danger on hover:
  `--c-danger-soft-text` on `--c-danger-10`.
- **Disabled:** `--c-text-disabled`. A disabled main button keeps a `--c-white-04` pill.
- **Focus:** a 2 px accent outline, 2 px out.
- **Press:** `scale(0.94)`.
- **Motion:** colours and scale ease over 160 ms with `cubic-bezier(0.2, 0.7, 0.2, 1)`.

In the code the kinds are `.btn-main`, `.btn-quiet` and `.btn-danger`, with `.btn-sm` and `.btn-icon`, in
`src/ui/styles/_buttons.css`; an `ActionButton`'s `variant` is `main`, `quiet` or `danger` (or `switch` for an on/off
switch). Icons are in `src/ui/assets/icons.js`.

## Colour: Ink

A violet night, chosen on concept finish-2 (2026-11-21). The page is the darkest step and everything a player reads
rests on a surface one step up, edged by a hairline. Colour stays only where it means something: trouble (failed,
warning), on/off and where you are (the lavender accent), the world codes, and names that identify a thing (tiers,
cauldrons, liquids, brews, signs).

- **Surfaces:** page `#0d0c18`, sidebar `#121120`, a group of rows (and the search, a panel) `#161526`, row hover
  `#1c1a2f`, a value's well `#211f3a`, edge `#252340`, strong edge `#36325a`, the hairline between rows `#1f1d35`.
- **Text:** main `#f3f1ff`, row names `#e3e0f6`, muted `#aaa6c8`, faint `#8e8ab0` (indices, a field's cap), the
  sidebar's words `#b4b0d0`. Each meets WCAG AA on every surface it sits on.
- **Accent:** lavender `#b0a7ff`, for where you are, what is on and the focus ring; a switch that is on is `#7d72ee`.
- **Trouble:** failed `#ff8a80` (soft text `#ff9d94`), warning `#ffc24d`. Saved is a quiet tick in the muted colour.
- **Type:** Fira Sans for everything a player reads; Rajdhani only where it is a mark (the logo and the codes, W1, HOM).
- **No decorative tints:** no tinted cards or boxes behind tiers, cauldrons or values; the tier keeps only its word's
  colour.

Write colours as tokens from `src/ui/styles/_variables.css`, in hex or `rgba()`, one set that the WebUI and the game
share. The Steam client runs Chromium 87, which has no `oklch()` or `color-mix()`.

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

## The menu

Decided on World 2 (2026-11-22), from two clickable concepts: IdleonToolbox's grouping or the game's. Lumi picked the
game's.

- **Names and grouping follow the game's own menus:** Alchemy with its tabs (Bubbles, Cauldrons, Vials, Sigils), Poppy,
  Orion.
- **Clickers live in one Account entry** with tabs Orion, Poppy and Bubba; their automation is one page in the
  Automation section, with a small inner tab per clicker.
- **Automation is its own section** (#249, Lumi's answers on the issue): a sidebar entry of its own between the game's
  places and the injector's, a separator on each side and no colour of its own, so a player who only wants automation
  never crosses a cheat page. Its code column shows a drawn loop, not "AUT" (Lumi, #255). Picking it opens its list,
  like a world (Lumi, #255); its Overview comes first, whose line is "Does what you'd do by hand, with your own
  resources." (never "safe"). Then the systems by world (Alchemy, Construction, Cooking, Sneaking, Summoning,
  Sushi Station), then Clickers, Masterclasses and Shops. A system's page whose automation moved there keeps one quiet way
  to it beside its title, "Automation" with an arrow, muted words that get the quiet fill only when pointed at; an automation page never
  links back.
- **A first tab never repeats its entry's name.**
- **Search keeps the old names** (Owl, Kangaroo, Liquid, Pay 2 Win), as extra words on the page that holds them now.
- **Cauldrons has a tab per cauldron** (Lumi, 2026-11-23), like Bubbles: Power, Quicc, High-IQ and Kazam hold each
  cauldron's Pay 2 Win upgrades; Liquids holds the four liquids and their Pay 2 Win upgrades with the Draconic count;
  Vials and player holds the Pay 2 Win upgrades that belong to no cauldron. Each tab's tray has Max all; Liquids
  also has Set all for the liquids' amounts.

## Page layout

Every page has the same parts in the same places (#26). The maintainer chose them from a live concept with four A/B
switches, picking the first option each time.

- **The top:** the title and its description on the left, the page's buttons on the right of the same row. When the
  buttons don't fit beside 26rem of description (12rem on a phone), they move to the line under it, still on the right, so the description
  never becomes a thin column. Search and filters go on the line under the title (`toolbar` on the page wrapper);
  inner tabs stay above the title. One thin rule runs under the whole top.
- **Values show once.** A number lives in its field, and so does its cap: the field reads `2 / 15`, with `/ 15` muted
  and a step smaller after the value. The cap is never part of the typed text; Enter or leaving the field saves only
  the number, and a typed value over the cap is refused beside the field (`max 15`). A row with a cap but no field shows
  the same `2 / 15` as text, without the box. Nothing repeats the field. A value above its cap (a level the game holds
  past its max, Library's `200 / 150`) shows in the warning colour, "over max" on hover, in a field or as text; it is
  a mark only and changes nothing (`NumberInput`, so every capped value has it).
- **A slash means a real cap.** `/ N` only ever stands for a real limit, the value Max or Max all fills up to (a
  prayer's max level, Library's book cap). A number that isn't a limit never gets a slash: a stamp's own max level
  rises as it is levelled, so Stamps shows the level alone, with no note.
- **A state is a plain word before the field:** Equipped, Locked, Complete, Owned, in normal case, muted, with no box
  and no colour of its own. It steps aside while the row is saving and while Undo shows there.
- **Sections** are a plain heading in small muted capitals over a thin rule, with the rows straight under it. No box
  inside the page box. The heading's row can carry the section's own controls (Set all) on the right.
- **On/off is one switch** (`StateSwitch`) with the game's own word for the state beside it: Owned / Not owned,
  Unlocked / Locked, On / Off. It saves on flip; the row shows saving and the ✓ like any save, with no Undo (flipping
  again undoes it), and the switch goes back if the game refuses. The words keep one width, so the switches in a list
  line up. A switch is reachable and flips from the keyboard; it has no glow.
- **In the narrow overlay** a value row keeps its name and state word on the first line and puts the field and its
  buttons on the line under it.
- **A search with no results** shows the shared empty state (`EmptyState`), and a save's error shows next to its field.

Not switches, on purpose: picks with a limit or an order (the 2× doublers, Organic labels, palette stars, the cape
vine, prayer slots, bundle purchases) keep their buttons.

## Lists with tabs

Decided one point at a time on the Stamps page of concept finish-2 (2026-11-21), in its Ink colours. A system's parts
(Stamps: Combat, Skills, Misc) are tabs on one list, built with `TabbedList` in
`src/ui/components/views/account/tabShared.js`. This is the baseline: a page uses `TabbedList` and gives it its tabs,
its rows and its tools, instead of writing its own tabs, tools or CSS.

- **Parts are tabs on the page,** not entries in the sidebar and not one long page of stacked sections. The sidebar
  lists only the page.
- **The open tab** is a block with 10 px top corners in the colour of what it opens, running straight down into it with
  curved feet: no pill, no bubble, no coloured line. Its word is lavender (where you are); the other tabs are plain
  muted words, 16 px. The first tab stands flush on the tray's left edge. On a phone the tabs share the row in a step
  smaller type (14 px), so five short names fit without scrolling sideways.
- **Switching** glides the block to the new tab and lets the new list fade in with a small rise; both are off when the
  player asks for less motion. A page comes back on the tab it was left on; a newly opened tab starts at its top. Left,
  Right, Home and End move between the tabs, and Tab goes from the open tab into its list.
- **Only the list scrolls,** inside its panel, with a slim bar inside the panel's edge. The title, the tabs and the
  tools stay where they are. A window too short for the panel scrolls the page instead, so nothing is cut off.
- **Tools for the open tab** (Set all, Exalt all) sit in a tray under the tabs: a darker strip set into the panel (the
  page's own ground), joined to the open tab. Its first line says what the tools act on: "All 30 combat stamps". While
  the top bar searches the page, the tools act only on the rows it shows, and the line says so: "3 matching combat
  stamps" (a page keeps each entry's row and asks `shownBySearch(row)`; `isSearching()` picks the words). Each
  tool is one joined shape with 10 px corners and hairline dividers (a level field with its Set all; Exalt all |
  Unexalt all), never pills, so tools never look like tabs. A field's label is its placeholder ("Level"), and the field
  shows no ring or fill while it's typed in.
- **Asking before a risky change** (lowering, taking away) happens in the tray, never with "Click again" or a popup. The
  tray's first line becomes the question ("Lower 30 combat stamps to level 47?") and the tools give way to the answer:
  the change in the soft red ("Lower them", "Unexalt it") and Cancel. Nothing times out. Cancel, Escape or another tab
  drop the question. A change that only raises runs on one click. Focus moves to the answer only when the tool was
  pressed from the keyboard. Tools ask with the `ask` that `TabbedList` hands them.
- **A tool that stops on an error says why** on the tray's first line, where a question goes, in the soft red ("Character
  changed. Refresh."), and screen readers hear it with the tool's name. It stays until that tool's next try (Lumi,
  #241).
- **Undo shows where the old value is gone:** a row offers Undo only after a typed number, Max, a bulk action (Set
  all, Max all, Reset all, All to, the tray's tools) or a one-click wipe (Reset, Clear, Relock, × remove). Not after a
  switch, the − / + beside a field, a step pick or a dropdown pick: using it again undoes it. A row with a switch and
  fields (Research's observations) follows the control that saved it. History > Changes keeps every change with its
  own Undo (Lumi, #81).
- **Undo all** comes up at the free right end of the tray's line, never over a control (`data-undo-at-end`). When the
  tools wrap (a phone) and that line is full, it goes to the end of the tray's first line, then of another line of
  tools; only with no room anywhere does it take its old place.
- **Row buttons** (Relock, Max, Reset) are soft filled shapes in the field's colour with no outline; one that lowers or
  removes turns red only under the pointer. No hover popup explains a button.
- **A switch shows its word only when on** where the off word would repeat down the list: "Exalted", never "Not
  exalted". The switch keeps its name for screen readers.
- **Value fields** hold seven digits (9,999,999) at full size; a longer value scrolls inside its field. One width for
  every row keeps the values in one column. On a phone a field shares its line with the switch and grows into what's
  left.
- **Without tools,** the tab row is the darker ground and the open tab runs down into the rows instead.

For pages that move to this look, it replaces "Click again" (Buttons), sections as headings over a rule, and switch
words that keep one width (Page layout).

### Tables (decided on Statues, 2026-11-21)

- **A thing with several values is one line,** like a table: its name, then each value in its own column (Statues:
  Level, Deposited, Tier, Flair). The column names are said once, in a head that stays at the top of the list while
  it scrolls; the fields keep their names for screen readers. Where the name and the columns don't fit side by side (a
  phone, and up to 1023px with the sidebar; up to 1279px for four or more columns, `value-table--wide`) a line folds
  into a small grid and each field shows its name again.
- **A page without parts** uses `ListPanel`: the same panel, tray, question and scrolling list as `TabbedList`, with no
  tab row.
- **A pick out of a few** (a tier: Stone, Gold, Onyx, Zenith) is a `StepPicker`: one joined shape, one press, no
  dropdown. The picked step lights; a tier lights in its own colour, because it names a thing.
- **A switch about one column** sits in that column's head (Statues' Flair unlock).
- **A table page takes the wider measure** (60rem); a list page stays compact (48rem).
- **Rows are quiet until touched** (every list and table): at rest a value is a plain number with no box and no − / +,
  and a step picker shows only its pick (a tier as its coloured word). The row under the pointer, or with focus in it,
  shows the controls in place; nothing moves. Touch screens always show them. A step picker too wide for a narrow row
  (Sigils' six tiers) folds into lines of three, like the tray's tier tool, and always shows, with a mouse too.
- **Every value starts where its column's name starts** (12px into the column), quiet or touched, so a column reads
  straight down. A capped value keeps its cap right after it ("1 / 4").
- **One main number a row:** a value that only supports another (Deposited, progress toward the next level) is a step
  smaller and muted.
- **− and +** are a close pair at the field's end, with room before its edge.
- **Names the game writes in capitals** (THICC_SKIN) show in normal case: "Thicc Skin". EXP stays in capitals.
- **A thing with a bonus shows the bonus first** (`RowTitles`): players know stamps and statues by what they do, so the
  bonus is the row's main line ("Base HP", "Move Speed %") and the name sits under it, small and muted ("Heart
  Stamp"). Only the game's words show, never a number the page works out: the game's own numbers come from many
  multipliers. A percent bonus ends in "%".
- **A warning banner holds only a warning.** A useful fact that isn't one becomes a short line under the title.

### Picks with states (decided on Pets, 2026-11-21)

- **A thing with a few states is one step picker,** not a card click plus small letter buttons: a pet's tier is Off |
  Normal | Pets+. Off picked is quiet; the strongest pick (Pets+) is "what is on", in lavender. A separate saved
  state (a pet token) is its own switch in its own column.
- **Say once how long a state lasts, in the column head:** "Tier · while the injector runs", "Token 1/2 · saved in your
  game". That replaces instructions, legends and banners that said the same.
- **A plain state word sits in its own column before the picker,** muted: "Owned", "Owned · Pets+".
- **Bulk tiers are one "All to" tool** (Off | Normal | Pets+) for the open tab; lowering asks in the tray, and bulk
  never touches a saved state (tokens).
- **Every list of picks has All to** (Lumi, 2026-11-23): a list where each line has its own pick gets the same "All
  to" in its tray, so switching every line is one press, never one row at a time: Alchemy Automation's "All to
  Materials | Particles", the palette's "All to None | ★ | ★★". Statues' and Sigils' "Tier for all" are this tool.
- **Every page's search is the top bar,** with no code on the page (`src/ui/menu/pageSearch.js`). On any page with
  shared rows (`.account-row`) the bar says "This page | Everywhere" at its right end: "This page" hides the rows whose
  name or bonus doesn't match as the player types, "Everywhere" drops the menu's list down as before. The typed text
  stays when it flips; another page starts fresh on "This page". A section left with no match hides with its heading;
  each tab shows how many of its rows match, as a small muted number after its name; a list with none says "Nothing
  here matches". A page adds no search box of its own. A column head row carries `account-row--head` so it stays.
- **A page's filters** sit on the line under the title. A filter that hides odd rows starts off, and says what it shows:
  "Show unavailable".
- **A tab with nothing to show says why** where its rows would be.
- **A warning shows only while its trouble is real,** as one short amber line under the name (`RowTitles`' `warning`):
  the problem, then what to do. "Pets+ turns this bonus off. Keep it Normal." shows on Spirit Reindeer at Pets+ and is
  gone at Normal or Off. A warning the game has since fixed is dropped, not softened.

### Every page the same (decided on World 1, 2026-11-21)

Lumi: "i dont see why any of them should be any different than the others." Every World 1 page now uses the same
pieces, and new pages start from them.

- **The game's groups are tabs** (Pets' sets, Star Signs' worlds, Bribes' sets, Stamps' pages). **A game screen that
  only splits one list in pages is not a group** (Forge's Page 1 and Page 2): one list in the game's order. **Nothing
  is set apart by how much to care**: Owl is one list in the game's order, with no "permanent" group, no highlighted
  rows and no banner telling players which values to keep.
- **A page with a few rows in two kinds** (Anvil: Points, Spent on) keeps one `ListPanel` with an `AccountSection` per
  kind: its name is a quiet line set on the panel, a hairline parts two groups, never a box or big heading.
- **Tools act on the open tab** (Unlock all on World 1's star signs only), and a tool that takes away asks in the tray.
  A whole-account side effect that only fits "everything" goes: Star Signs' Reset clears the tab and recounts the
  star points, and no longer re-locks the unlocked star signs (Lumi's pick).
- **A row that holds a list** (a star sign's players) opens in place under the row: the row's name is its opener (a
  button with `aria-expanded`), one row is open at a time, and the row keeps a switch for the quick path (Unlocked:
  fills it with the players it needs, off clears it). What opens spans the whole row; on a phone the row folds.
- **Taking one thing out of a row's list saves at once** (× on a player), with Undo in the row's save state. No
  "Click again" and no popup.
- **A switch's word names the state that matters:** "Owned" when on, "Locked" while it can't be had yet, nothing
  when simply off. A row that can't change says so in its place, quietly ("Can't be bought").
- **A page's title is its sidebar name** (Orion, its tab under Clickers), so it gets its system's icon; the description
  names the thing ("Orion the owl's feathers and upgrades."). Titles, loading and failure lines are normal case ("Reading the
  forge", "Couldn't read the forge").
- **Numbers in a list end in one column**, capped or not (`field-columns`: a field without a cap keeps the cap's
  room). An amount left beside the title turns red with a real minus when overspent ("−18 points left").

### World 3 on the same pieces (draft, 2026-11-22)

World 3 uses the World 1 and World 2 pieces; a few of them grew, and are now shared:

- **A row that holds a list opens in place** with the shared `row-opener` (its name, a small chevron, `aria-expanded`)
  and `row-detail` (the rows it holds, a step in, on the page's ground). Death Note's mobs open their characters' kills.
  The top bar's search counts only the outer rows; the rows inside go with the row that holds them.
- **A table line can carry a state word** before its values (`ValueTableRow`'s `badge`): Refinery's "Polymer".
- **Something a page either has or hasn't** (a hat on the rack, a set in the Smithy) is one list of all of them, each
  with a switch, instead of an add pick and Remove buttons. Adding all runs on one press.
- **A pick out of a list opens in place** (`PickInPlace`): no dropdown and no popup. Its opener is a soft filled shape
  (or a row's own title), the list opens under it on the page's ground, the picked one in lavender, with a search when
  the list is long. Up, Down, Enter and Escape work in it. A 3D Printer slot's item is picked this way, under its row,
  and saves at once.
- **One character picker** (`createCharacterSelector`, built on it) sits on the line under the title wherever a page
  shows one character's things: Prayers, 3D Printer, Traps. Never tabs per character. Its list opens over the page
  (nothing below moves), across the page's width in columns (4 on desktop, 2 on a phone), each name with its class
  under it (Lumi's pick of two concepts, 2026-11-22).
- **A cog opens its editor in place, under the board** (Lumi's pick, #251), the way a row's pick opens under its
  row: one group of the page's value rows, its line saying the slot and cog, the slot's state in plain words
  ("Unlocking 2K / 33K · Flag placed") and only the change it can take (Lock or Unlock). The same cog again or Escape
  closes it, and Escape gives focus back to the cog. A mouse press scrolls nothing, so the next cog stays under the
  pointer; a press from the keyboard takes focus into the editor.
- **Bonus first everywhere the game has one**: hats (their Hat Rack stat), armor sets (their set bonus), talents
  (their first line), buildings (a town building's current bonus, a tower's or shrine's first line).

### Automation pages (decided 2026-11-22, #205)

Every automation page is `AutomationPage` in `automation.js`: a table at the wider measure, built once for all of them.

- **One "Save for it" switch per upgrade** replaces High / Low / Balanced. Saved-for upgrades are saved for, cheapest
  first; the rest buy cheapest first with what's left. The saving % is "While saving: Keeps the rest of the goal;
  others buy with what's above it" (#218: it keeps (100 − N)% of the goal's cost).
- **What the automation holds sits beside the title** (`AutomationStats`: "4.2B feathers · 3.1M per second"), and the
  description is one short line ("Buys switched-on upgrades with feathers.").
- **One list:** a quiet "Settings" group first (the automation's switch and its saving %), then the column head, named
  once (Level, Next level, Stop at level, Save for it, On), then the items, grouped by the game's groups. A setting's
  field sits in the stop-at column and an automation's switch in the On column, so they line up with the items'.
- **A page with parts** (Clickers' Orion, Poppy, Bubba; Cooking's Kitchens, Meals; Shops' worlds) puts them as tabs on
  that one list (`TabbedList`), never as loose words above the title; the title's stats follow the open tab.
- **An upgrade shows what it does first** (`RowTitles`): the game's own line with its current value ("Boosts feather
  generation by +45%"), the name small under it.
- **Enable all | Disable all are the tray's tool**, acting on what the tray's line names ("All 9 Orion upgrades",
  "All 7 shop items in W2": the open tab only, Lumi's pick for Shops too); Disable all asks in the tray, Enable all
  runs on one press.
- **Where the table folds** (a phone, and up to 1023px with the sidebar) an item's own switch stays at the end of its
  name's line; its other cells fold two to a line.
- **The automation's switch row says why it is on** when an item's switch turned it on ("On, since an upgrade was
  switched on"), and an open page follows a running automation every few seconds, without Refresh (#214).

### World 5 on the same pieces (draft, 2026-11-22)

World 5 uses the same pieces; two shared pages moved onto them:

- **A list of numbers** (a Hole cavern, a villager's screen) is `NumberList`: its rows under quiet section headings,
  each with its bonus first where the game has one, and a table where a row has several values.
- **The Slab and the Greenstack** (`ItemRegistrationTab`) are one list with a switch each, searched from the top bar.
  "Missing only" (off at the start) is their filter on the line under the title; Register all runs on one press,
  Unregister all asks in the tray.
- **The menu follows the game's screens:** Sailing and Gaming are one page each, the game's screens as tabs (Sailing:
  Boats, Captains, Islands, Artifacts, Loot Pile; Gaming: Garden, Imports, Rat King, Superbits, Palette), not entries in
  the sidebar (Lumi: "gaming needs subtabs instead of the submenus"). A tab keeps what its page had, its tools show on
  it only, and search finds each tab by its old name and words (`tabs` in `definePage`) and opens the page on it. A
  tab's own parts (Superbits' boards) are groups in its list. The Hole is two pages, like the game's village on top and caverns below:
  Villagers (tabs Villagers, Opals, Engineer, Conjuror, Measurer, Librarian) and Caverns (one "Cavern" pick, its 18
  caverns in the game's order; Lumi, #28). A cavern with parts of its own (Fountain) shows them as groups in its list, never tabs in a tab.
- **The Slab holds the Greenstacks** as its second tab (the game shows them on the Slab); each tab keeps its list, its
  "Missing only" filter and its tools. A captain's opened row can remove it, asking in place first; it does what the
  game's discard does and, like the game, refuses a captain on a boat or the last one.
- **A row that opens has its arrow in one place:** the end of its name's column, centred on the name's lines, the
  same in every opening row (Star Signs, Death Note, the 3D Printer, Captains, the Rat King's plants), so it never
  moves with the name's length (Lumi: the arrow after the text looked misplaced). World 5's five systems have their
  drawings (Lumi: "Put all five in").
- **A pick in a table gets its own column** (`ValueTableRow`'s `steps` field): Palette is a table, a colour's Level and
  Black Stars under their heads, so nothing in a line moves with its neighbour's width (Lumi: "it looks off, not
  aligned"). A number beside a control (the Rat King's "3 / 10") keeps one width for the same reason.
- **Many tabs wrap** (`TabbedList`'s `wrap`, Death Note's eight on a phone): the rows of tabs fill the panel's width. The
  open tab runs down into the list from the last row; on a row above, it is a block rounded all round.
- **Far more parts than tabs hold** (Caverns' 18) are one pick instead (`TabbedList`'s `pick`): "Cavern [The Well]",
  the caverns opening over the page like a character's names. While the top bar searches the page, each cavern in the
  list and the pick itself say how many of its rows match ("Fountain · 12 matching").
- **A limited gem shop buy sits on its system's page** in a quiet "Gem shop" group: Davey Jones Training on Boats,
  Rupie Slugs on The Jars, both found by "gem shop", "limited" and "fomo".

### World 6 on the same pieces (draft, 2026-11-23)

World 6 uses the World 5 pieces and the Page standards; a few grew, and are now shared:

- **The menu follows the game's screens:** Farming (Plots, Crop Depot, Market, Exotic Market, Land Rank, Stickers),
  Sneaking (Ninja Knowledge, Jade Emporium, Charms) and Summoning (Upgrades, Essence, Battles) are one page each with
  tabs, and Sneaking and Summoning keep Automation as their own sidebar entry (Lumi: "i obviously wanted automation to
  be its own menu point like w4 and before"). Beanstalk and Emperor are one list each. The Day and Night Market are
  groups in one Market tab, the board's colours and the opponents' colours groups in their tabs.
- **A setting that switches per line is a button on that line** (`row-toggle`): Organic on Exotic Market, Omni Jade on
  Ninja Knowledge (Lumi: "it's the same as ninja knowledge and can just be implemented with a button to enable it").
  It is lavender while on. In a table it takes the last column (`ValueTableRow`'s `action`), and a line that can't have
  it keeps that column empty, as a line without a value keeps its own (`blank`).
- **A save that the game caches** clears the cache after it (and Undo does too): Endless wins and the opponents won
  clear `DNSM.h.SummWinBonus`, so the win bonuses follow at once.
- **The game's placeholders stay out** (NAME_MAGNI, UNDER_CONSTRUCTION, Nonexistent_Sticker, "something World 7ish").
- **A row's own question** (Emperor's Reset) puts its answer beside the row's name and keeps the button's room, so
  nothing moves while it asks.
- **Names keep the game's short words:** a tier's Roman numeral (Sproutluck III), GMO and OG.
- **World 6's five systems have their drawings** (Lumi: "put all five in"): a sprout for Farming, a ninja's hooded
  head for Sneaking, a slime familiar for Summoning, the beanstalk, and the Emperor's crown.

### Classes on the same pieces (draft, 2026-11-23)

The masterclasses use the World 6 pieces and the Page standards; one page builder is new, for their four pages
(`masterclassParts.js`):

- **Each masterclass is one sidebar entry, its screens as tabs:** Grimoire (Upgrades, Bones), Compass (a tab per path:
  Elemental, Fighter, Survival, Nomadic, Abominations; then Dust), Tesseract (Upgrades, Tachyons, Map Bonuses) and
  Royal Armory (Upgrades, Resources, Nodes, Royal Statues, Outposts, Lil' Orblet Shop). Their automation is one entry
  in the Automation section, Masterclasses, with a tab per masterclass (Lumi, 2026-11-24); each masterclass page links
  to its own tab beside its title.
- **An upgrade list is the game's list in its order,** the bonus first, without the game's placeholders. An upgrade
  without a real max (999,999 in the game) shows its level alone and has no Max; Max all fills only the ones with a max.
- **An outpost opens as a band under its line,** edge to edge, so its rank EXP, type, slots and units sit in the
  list's columns; a pick starts in the first column. A slot the barracks hasn't opened says so in its place ("Opens at
  Barracks 3").
- **A tool's own numbers sit in the tray with it:** Populate's units per outpost are its fields there, one per kind,
  so the list holds only what saves to the game.
- **A table tab doesn't take `field-columns`:** it would pull the values off their column names.
- **The four masterclasses have their drawings** (Lumi: put all four in): a clasped book with a small skull for the
  Grimoire, a ring and its needle for the Compass, a cube in a cube for the Tesseract, and a knight's helm for the
  Royal Armory.
