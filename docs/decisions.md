# Design decisions

Record a decision, its reason, and its trade-off here. Include alternatives when they are known.
Do not infer historical intent from the implementation or maintain a second description of its behavior.

## Keep documentation thin

Decision: use docs for navigation, domain language, design rationale, and user workflows or safety guidance.
Keep implementation contracts beside their source when an explanation is necessary.

Why: descriptions of algorithms, field lists, startup order, and copied code can drift independently of the code.
Names and structure should make the implementation understandable.

Alternative: maintain a separate implementation reference or tutorial for each module.

Trade-off: contributors must read source for exact behavior. A small [architecture map](architecture.md)
provides entry points without duplicating it.

Update the map when a top-level area or runtime boundary changes. Define new terms once in the
[glossary](glossary.md). Update an existing decision when its trade-off changes.

## Preserve original method side effects

Decision: method hooks follow the base-first convention.

Why: the original game method may update state as well as return a value.
Replacing its result must not silently skip those side effects.

Alternative: return a cheat value before invoking the original method.

Trade-off: the original work still runs even when its result will be overridden.

Source: [hook core](../src/cheats/core/hooks.js).

## One way to hook the game

Decision: a game hook is a `defineHook` declaration in a file under `src/cheats/hooks/`, on a game method or on a
property of game data. The core does the patching, installs each hook on its own, reports a missing target, never
patches an object twice, re-applies every hook after character select and installs early hooks before setup. The build
finds the files by scanning the folder. Hooks on the same method wrap in the order they are declared, so they share a
file.

Why: the code hooked the game seven different ways, guarded against patching twice three ways, and needed an edit to
`proxies/setup.js` for every new hook. A contributor now adds one file and gets the core's guarantees.

Alternative: keep per-file setup functions listed in `proxies/setup.js`, or a generated import list kept in sync by a
check. Both make every new hook edit a shared file.

Trade-off: the folder scan happens in the build (a rollup step), so the test harness imports the same file list
itself. A hook that must change state or arguments while the game's method runs, or skip it, declares `around`, which
steps outside base-first; each says why in a comment, and they should stay rare. A hook on game data either puts an
accessor on the property (a getter, or get and set handlers) or replaces the object it holds with a Proxy, for data
read by any index; the old `createProxy` helper and its `_isPatched` guards are gone. Some around hooks still swap a
value for the length of one game call (the chest during a storagecap deposit, a player's growTo while it inits); that
swap is part of the handler, not a hook of its own.

Source: [hook core](../src/cheats/core/hooks.js), [example hook](../src/cheats/hooks/_example.js).

## One row per cheat, and a generated config.js

Decision: a cheat is a `defineCheat` row in a file under `src/cheats/cheats/`, found by the build the way hooks are.
The row carries the command, its message, its parameters, whether it is dangerous and its settings with their
defaults and descriptions. `config.js` and the WebUI's setting descriptions are generated from the rows plus the
injector's own settings (`npm run config:generate`); the check fails when either is out of date.

Why: adding a cheat meant editing up to five files, picking one of five registration styles, and keeping `config.js`
and a separate descriptions list in step by hand, which had drifted (settings without descriptions, descriptions of
settings that no longer exist).

Alternative: keep `config.js` hand-written and only check it against the rows. Contributors would still edit two
places, and the core settings would have no single source.

Trade-off: `config.js` stays in the download for players and the updater, but nobody edits it, and its
in-file comments are now the setting descriptions. The descriptions also ride along in the cheats bundle.

Source: [registration](../src/cheats/core/registration.js), [example cheat](../src/cheats/cheats/_example.js),
[generator](../scripts/config-file.mjs), [core settings](../src/modules/config/coreSettings.js).

## Preserve editable row identity

Decision: keep editable Account rows stable when their values change.
Choose simpler rebuilding only where losing transient input or feedback state is acceptable.

Why: rebuilding an active row can lose focus, draft text, or write feedback.

Alternative: rebuild the whole section whenever any row changes.

Trade-off: stable rows require explicit value updates and collection reconciliation.

Source: [Account components](../src/ui/components/views/account/components/),
[Account shared helpers](../src/ui/components/views/account/accountShared.js).

## Share the lifecycle of simple Account lists

Decision: use one page module for single-section numeric lists, while each Account page owns its game reads
and entry definitions.

Why: repeated load, reconciliation, and value-state coordination should have one owner.

Alternative: repeat that coordination in each page or generalize every Account editor into one module.

Trade-off: simple lists share a fixed layout and row lifecycle; custom layouts retain their own composition.

Source: [Simple Account lists](../src/ui/components/views/account/components/SimpleAccountListPage.js).

## Share staged editing state across layouts

Decision: let one field editing module own drafts and write outcomes for scalar and multi-field editors.

Why: focus preservation, cancellation, and verified commits need the same rules across layouts.

Alternative: maintain the editing lifecycle separately in each layout.

Trade-off: layouts retain formatting and controls, while custom writers must return every field's verified value
or cancellation. Failed writes retain committed UI values until a refresh, including when a game batch partly
succeeds. Completion callbacks run after the verified commit; their failure retains those values and reports an error.

Source: [Field editing](../src/ui/components/views/account/useFieldEditor.js),
[Numeric editing](../src/ui/components/views/account/useNumericEditor.js).

## Give frontend Monitor subscriptions one owner

Decision: let the frontend Monitor module own subscription bookkeeping, path identity, and runtime lookup.

Why: Search actions and rendering should not coordinate transport identifiers or maintain a second subscription ledger.

Alternative: repeat that coordination in Search, its render modules, and the store.

Trade-off: Search retains saved snapshots and activation timing, while WebSocket connection replay stays with the transport.

Source: [Frontend Monitors](../src/ui/state/liveMonitor.js).

## Keep Search scan sessions outside rendering

Decision: let a scan session module own scan transitions, request construction, scope, and comparison baselines.

Why: consecutive scans should be testable without rendering the Search view. Editing displayed values must
not change the baseline used by the next comparison.

Alternative: keep scan coordination in the view alongside editing, filters, and saved results.

Trade-off: the view supplies reactive output state and presents feedback. Pagination, saved results,
and input controls remain view concerns.

Source: [Search scan sessions](../src/ui/components/views/search/scanSession.js).

## Give server Monitor lifecycle one owner

Decision: let a server Monitor module own subscriptions, shared game hooks, retries, history, and cleanup.
Keep socket messages and serialization in the WebSocket module.

Why: lifecycle races should be testable without constructing sockets or emulating CDP expressions.

Alternative: keep Monitor coordination inside the WebSocket module.

Trade-off: the Monitor module accepts GameBridge, state delivery, and a clock. The existing lifecycle
tests use controlled adapters without exercising socket transport.

Source: [Server Monitors](../src/modules/server/monitor.js).

## Share Royal Guard behavior outside views

Decision: keep Royal Guard unit rules and reset operations in a shared domain module.

Why: Armory and Outposts need the same behavior without importing each other's view implementation.

Alternative: keep shared behavior exported from the Outposts view.

Trade-off: the domain module still uses the existing account helpers and game API.

Source: [Royal Guard domain](../src/ui/components/views/account/royalGuardDomain.js).

## Decode game catalogs in focused helpers

Decision: share jar-gem catalog decoding between command execution, list output, and autocomplete.

Why: these callers need the same game-data layout and stable definition indices.

Alternative: repeat the parsing in each caller or combine unrelated catalogs into one module.

Trade-off: callers still own presentation and command-specific mutations.

Source: [Jar-gem catalog](../src/cheats/helpers/jarGems.js).

## Batch bulk-write verification reads

Decision: verify bulk writes with one separate batch read, using the existing typed comparison in the UI.

Why: verification requests should not grow with the number of successful writes.

Alternative: verify within the write evaluation or issue a separate read for every value.

Trade-off: verification still observes state after the write request. Batches remain non-atomic and report individual failures.

Source: [UI game API](../src/ui/services/api.js), [state accessors](../src/cheats/api/stateAccessors.js).

## Keep game-path policies explicit

Decision: keep Account value operations, Monitor property checks, and raw Search traversal in the shared path module.

Why: path interpretation and validation should have one owner while callers keep their distinct requirements.

Alternative: merge every traversal into one behavior or leave checks spread across callers.

Trade-off: raw Search paths remain explicit, value operations can address missing properties, and monitoring requires a watchable property. CLI inspection and cheat-state traversal retain their separate conventions.

Source: [Game paths](../src/cheats/utils/pathResolver.js).

## Keep configuration persistence with configuration loading

Decision: let the configuration module save UI overrides and update its loaded state after a successful write.

Why: default filtering, serialization, and disk persistence need one owner alongside configuration loading.

Alternative: keep save logic in the HTTP route.

Trade-off: the save operation requires loaded configuration. Routes retain request validation and HTTP responses.

Source: [Configuration manager](../src/modules/config/configManager.js).

## Keep Session update rules outside HTTP handlers

Decision: let the configuration module own Session update parsing, live-object merging, and game synchronization.
Keep request validation and HTTP responses in the route.

Why: game synchronization can fail after server state changes, so one module should own that partial success.

Alternative: keep mutation and game synchronization coordinated by the HTTP route.

Trade-off: live configuration references stay shared, and server changes survive failed game synchronization.
A save writes the file first; the game failing to take it doesn't undo the write.

Source: [Configuration manager](../src/modules/config/configManager.js).

## The injector's configuration is the one the game gets

Decision: after a cheat runs, and whenever the WebUI reads the configuration, copy the settings the game changed
itself into the injector's configuration. A save merges what it is sent into that configuration and sends it to the
game, and every game load is injected from it. A broken `config.custom.js` is reported and kept as a copy when the next save replaces it.

Why: the game changes its own settings (`nomore` lists, `<cheat> <value>`), saves from different views sent
different parts, and a reload got the startup settings, so the injector, the file and the game drifted apart.

Alternative: send every change through the WebUI. Commands typed in the game or the CLI would still be lost.

Trade-off: values without a JSON form stay in the game: functions, the `multiplestacks` Map and `fix_save`'s copy.
A `nomore` pattern travels as `"/source/flags"`; only list items in that form are read back as patterns.

Source: [Configuration manager](../src/modules/config/configManager.js).

## Pages save only their part of the configuration, file first, one at a time

Decision: a page that keeps settings sends only the settings it changed, built from a read taken in its turn. It
goes in one save, which writes `config.custom.js` first and then takes it into the session and the game, and the
page shows the read after it. The
menu's configuration reads and saves, the Config view's included, run one at a time in the order asked.

Why: pages that saved the whole configuration put back what another page changed in between, and a page that
updated the session first had to take a failed file save back by hand, which erased a list another tab had saved.
The file goes first because the server takes a save into the session only once the file is written.

Alternative: keep the session first and take the change back when the file save fails.

Trade-off: a list is saved whole, so another browser tab's save between a page's read and its save is still lost.
A file save that worked while the game didn't take the change leaves the change saved, with the reason said.

Source: [API service](../src/ui/services/api.js).

## Share the game-helper transport

Decision: route server, CLI, and WebSocket helper calls through GameBridge.

Why: argument encoding, context binding, and protocol result decoding should have one owner.

Alternative: construct evaluation strings and decode CDP responses in every caller.

Trade-off: callers still choose helper operations and own user-facing errors. The bridge accepts a runtime dependency so isolated fixtures can replace the live connection.

Source: [GameBridge](../src/modules/game/gameBridge.js).

## Move command suggestions incrementally

Decision: allow command definitions to own suggestion providers, migrating command families incrementally.

Why: the command and its suggested parameters should use the same domain knowledge.

Alternative: keep every command's suggestion logic in the shared autocomplete builder or migrate all commands at once.

Trade-off: the shared builder retains ordering for migrated groups alongside legacy groups. Provider presence does not imply that the bare command should be hidden.

Source: [Command registration](../src/cheats/core/registration.js), [world commands](../src/cheats/cheats/worlds.js).

## Register HTTP routes by responsibility

Decision: let focused registration modules own game, cheat, search, configuration, and update routes. Keep one router and one game bridge per API setup.

Why: handlers should sit beside related validation and lifecycle state without sharing every dependency in one closure.

Alternative: keep one large registration function or add mounted sub-routers.

Trade-off: registration spans multiple modules. They retain the existing request contracts, shared configuration references, and update response timing; splitting routes does not reduce game round trips.

Source: [API setup](../src/modules/server/apiRoutes.js), [route modules](../src/modules/server/routes/).

## Keep update orchestration outside callers

Decision: let the updater module own cached checks and preparation coordination, using the existing
release checker and archive preparation modules.

Why: HTTP and CLI callers should not coordinate release checks with archive preparation themselves.

Alternative: keep cached checks and preparation coordination in the update route.

Trade-off: each updater owns its check cache. Startup and CLI checks use fresh instances; the HTTP
route retains its instance and controls the response-before-exit handoff.

Source: [Updater](../src/modules/updateService.js).

## Verify an update completely before replacing anything

Decision: every release publishes a `SHA256SUMS` asset in `sha256sum` format. The updater refuses an
update when that file, the archive's line in it, or a match is missing, and copies files by their exact
path in the archive. It checks everything before the install changes, and the replace script restores
every file if one copy fails.

Why: a download that is damaged, tampered with, or holds the wrong file must not leave a half-updated
install.

Alternative: trust the download and copy whatever files are found.

Trade-off: a release published without `SHA256SUMS` cannot be installed by the updater, only by hand.

Source: [Release archive preparation](../src/modules/autoUpdater.js).

## Ship an allowlist, not the repository

Decision: each release archive holds only the files on an allowlist (the binary, `cheats.js` and `config.js`),
and the release refuses to publish unless all four platforms' archives and their `SHA256SUMS` exist.

Why: the archive used to ship the whole checkout, `.git` included. A player gets only what runs, and every
platform gets the same release, so the updater never finds a release without its download.

Alternative: copy the checkout and exclude what shouldn't ship.

Trade-off: a new file that must sit beside the binary needs an allowlist entry, or it never reaches players.
If GitHub has no runner for one platform, the release waits until that job is re-run.

Source: [Release packaging](../scripts/release.mjs).

## Build the menu from page declarations

Decision: each menu page declares itself with `definePage` in its own file under `src/ui/pages/<world>/<system>/`.
The web server lists that folder and the menu imports every listed module.

Why: a new page is a new file, without editing shared tab lists, so page pull requests stay small and safe to merge.

Alternative: keep hand-maintained tab lists per world, or generate an index at build time (the UI has no build step).

Trade-off: the server reads the folder on each menu load, and every page module loads at start, as the Account tabs
already did. The worlds and their system names stay a core list, so a page can only join a known system.

Source: [menu model](../src/ui/menu/menuModel.js), [page route](../src/modules/server/routes/pages.js).

## Answer every cheat with one result shape

Decision: the cheat dispatcher answers `{ ok, message }` for every command, and `/api/toggle` passes it on.
A command that throws comes back `ok: false` with the error's message; the stack stays in the game's console.
A request may carry `on: true|false` to set a toggle cheat instead of flipping it, and a cheat that arrives before
setup has the game's data waits for setup.

Why: callers told failures from successes by parsing `"Error: …"` strings, so most showed a thrown cheat as a success,
and a flip-only API let a double click or a second tab turn a cheat back off.

Alternative: classify each command's own messages, which waits for the command model.

Trade-off: a command that returns a failure as plain text (for example "No item found") still answers `ok: true`.
Commands with their own function ignore `on`.

Source: [command registration](../src/cheats/core/registration.js), [cheat routes](../src/modules/server/routes/cheats.js).

## Keep save copies on the player's PC, restored value by value

Decision: a hook on the game's cloud save keeps a copy of the save in the page; the server takes it over CDP every
30 seconds and stores one gzipped file per copy, named by time and character. It keeps every copy from the last 24
hours and the newest of each day for 30 days. A restore compares the copy with the save now and writes the selected
values back through the same game helper as the write-many route, each read back and checked. Gems and bundles
received from the server, the time-away stamps and the cloud save counter are never restored.

Why: game-side code makes no network calls, and the server already talks to the game through `Runtime.evaluate`, so
a pull needs no new channel. Writing into the game's own maps and arrays keeps the injector's proxies and the game's
classes, and the values the game reconciles with its server on load would otherwise be granted twice.

Alternative: a CDP binding that tells the server at once (a second way to talk to the game for one feature), or the
Monitor's WebSocket (a listed exception for its own feature). A one-click restore of the whole save waits until a test
shows the game picks it up on reload.

Trade-off: a copy waits up to 30 seconds in the page, so closing the game right after a save can lose that copy.
A copy is only compared or restored while the character it was taken on is in play. Restored values of characters
not in play reach the cloud only once each is played.

Source: [save copies](../src/modules/saveCopies.js), [routes](../src/modules/server/routes/saveCopies.js),
[game side](../src/cheats/core/saveCopy.js).

## Work out Attire Rack bonuses with the game's own stat code

Decision: `wide attire` adds the chosen outfits' stats by running the game's stat method again with the attire slot
holding a made-up outfit (the worn one's stats plus the chosen ones'), and adds their bonuses to the game's bonus map.

Why: the game's calculation keeps its class rules, equipment modifiers and rounding, so the injector keeps no second
stat formula.

Trade-off: the TotalStats hook runs around the game's method and refills its stat cache, so it is the one hook on that
method that must stay innermost.

Source: [Attire Rack bonus](../src/cheats/helpers/attire/rack.js).

## Apply Wardrobe loadouts as page saves

Decision: the game side only plans a loadout (`readComputed("wardrobe", "preview")` returns its path writes); the
Wardrobe page saves them through `writeManyVerified`, then runs `wide wardrobestats`, reads the food stacks from
`readComputed("wardrobe", "food")` and saves them the same way. Perfect Equipped from the page goes the same way;
`wide perfectequipped` still does it at once.

Why: a page save is in the change log, so a loadout can be undone from History or Undo all, and a write the game
refuses is said where the player applied it.

Trade-off: #2 rolled the whole loadout back when one value didn't land; a page save keeps what landed and Undo puts it
back. #2 also put the vanilla prayers back when `w3 prayer` turned off, by redefining that cheat's state; the 3.0
rules forbid that, so applying the loadout again with the cheat off (or Undo) does it.

Source: [Wardrobe planner](../src/cheats/helpers/wardrobe/planner.js).

## Show game pictures only from the running game

Decision: a pet's picture is read from the game's own sprite in the page (`getPetPicture`) and handed to the menu by
the server: frame 0 as a PNG for the card, its idle frames as one strip for the hover. Nothing is written to disk, and
no game picture goes into the repo, CI, the page shots or a PR. Without a picture (no game, the fake game, the game's
monsters not loaded yet at character select, an unreadable canvas) a pet shows its name as before.

Why: the art belongs to the game. Taking it from the game on the player's PC means the injector ships none of it.

Alternative: a picture set kept in the repo or downloaded from a wiki, which would ship the game's art.

Trade-off: no pictures without a running game, and none at character select, since loading the monster sprite there
stalls the game for about a second. The server asks the game for one picture a frame, so a long list fills in over a
second or two instead of stalling the game (all 177 at once does, for about 0.2 s).

Source: [game side](../src/cheats/helpers/petPictures.js), [routes](../src/modules/server/routes/game.js).

## Give automation its own menu section

Decision: every automation page lives in one sidebar section, Automation (`world: "automation"`), never as a tab or
page inside a system's cheat pages. A system page links one way to its automation page. Old page ids are mapped to the
new ones (`MOVED_PAGES`), so a remembered place and History entries still find their page.

Why: players who only want automation (what they'd do by hand, with their own resources) share the menu with players
who cheat. A section of its own lets them find it without crossing a cheat page (#249).

Alternative: keep each automation as a tab or sidebar entry under its system, or merge it into the system's list
(two concepts for Bubbles, both rejected by the maintainer).

Trade-off: a system's automation sits away from its cheat page, so the cheat page carries a link to it.

Source: [menu model](../src/ui/menu/menuModel.js), [pages](../src/ui/pages/automation/).

## Put a system's cheats on its page

Decision: a cheat that belongs to one system (W4 Breeding's egg slots, the W3 Atom Collider) leaves the Cheats area
and shows in a cheats panel beside that system's page, or folded under its title where there is no room. A tabbed
system shows the open tab's cheats and those for every tab. The rest of the Cheats area falls into nine groups (Combat,
Multipliers, Items & drops, Costs & limits, Unlocks, Minigames, Display, Tools, and Dangerous last, marked). A panel
switch is on until the injector restarts; its pin puts the cheat in the startup cheats.

Why: a player on a system's page looks for its cheats there, and the old Cheats tabs (w1-w7, wide, unlock) mixed a
world's systems with each other (#23). Same two-audiences reasoning as the automation section.

Alternative: keep every cheat in the Cheats area and link from the page (one more trip per cheat), or put each cheat
on every page it touches (two places to keep in step).

Trade-off: which page owns a cheat is a hand-kept list (`src/ui/menu/pageCheats.js`); a test checks every command in
it is real and every cheat outside it is in one of the nine groups.

Source: [page cheats](../src/ui/menu/pageCheats.js), [panel](../src/ui/components/SystemCheats.js).
