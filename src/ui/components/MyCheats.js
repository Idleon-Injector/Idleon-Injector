/**
 * My cheats: the player's own cheats, as Home's right column. Lumi: "the user is used to finding their cheats on the
 * right side of the menu in each tab", and it is the one place cheats are kept close (#299: the Cheats area has no
 * favourites). It is the sibling of a system page's cheats panel (SystemCheats.js) and uses its row (`CheatRow`): the
 * cheat's name with its command under it in the code font, and its real switch (or Run). Under each row two tags the
 * player clicks, Pin and Autostart; on, a tag is filled and lavender, off it is a faint outline.
 *
 * One list, A to Z by name. A cheat is in it while it is on, pinned (menu/pins.js, saved in the config file) or set to
 * start with the injector (the startup cheats, the same list Settings › Startup edits). Off with neither tag, it leaves, but not while the
 * pointer or focus is in the list: nothing moves under the player's hand. A cheat that arrives fades in from the accent.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { fetchConfig, saveConfigPart, startupWith } from "../services/api.js";
import { pageRowOf, withNewNames } from "../menu/pageCheats.js";
import { cheatName } from "../menu/cheatNames.js";
import { VALUE_COMMANDS } from "../menu/valueCommands.js";
import { pins, isPinned, setPinned, takePins } from "../menu/pins.js";
import { Icons } from "../assets/icons.js";
import { CheatRow } from "./SystemCheats.js";
import { Said, useSaid } from "./inPlace.js";

const { aside, button, div, p, span } = van.tags;

// The startup cheats as the config file holds them; null until read. The same read gives the rows their settings.
const startup = van.state(null);
const config = van.state(null);
const loadStartup = () =>
    fetchConfig()
        .then((file) => {
            config.val = file;
            startup.val = withNewNames(file.startupCheats ?? []);
            takePins(file);
        })
        .catch(() => {});
// Read again when the window comes back: the file may have changed in the other window (the in-game overlay and a
// browser both show the menu).
window.addEventListener("focus", loadStartup);

const groupOf = (cheat) => cheat.split(" ")[0];
// "w4" in the startup cheats starts every W4 cheat: only "w4"'s own row can change that.
const throughGroup = (cheat) => groupOf(cheat) !== cheat && (startup.val ?? []).includes(groupOf(cheat));
const autostarts = (cheat) => (startup.val ?? []).includes(cheat) || throughGroup(cheat);

/** A command as the cheat rows take it: its short name, a hint when it takes a value, and whether it's dangerous. */
const rowOf = (command) => {
    const found = store.data.cheats.find((cheat) => cheat.value === command);
    const page = pageRowOf(command);
    const { label, hint } = VALUE_COMMANDS[command]
        ? { label: VALUE_COMMANDS[command].label }
        : page?.cheat === command
          ? page
          : cheatName(found ?? { value: command });
    return {
        cheat: command,
        label,
        ...(found?.needsParam && !VALUE_COMMANDS[command] && { hint: hint ?? "value" }),
        ...(found?.dangerous && { dangerous: true }),
    };
};

const arrive = (el) => {
    el.classList.remove("is-arriving");
    void el.offsetWidth; // restart the wash
    el.classList.add("is-arriving");
    el.addEventListener("animationend", () => el.classList.remove("is-arriving"), { once: true });
};

/**
 * The two tags at the end of a row's command line. Each shows a press at once and saves it in the config file, in turn
 * with the menu's other saves: Pin the pinned cheats (menu/pins.js), Autostart the startup cheats, one press at a time in
 * order, the tag showing the newest press while they run. A failed save is said under the list and read back.
 */
const Tags = (command, { failed, done, linger }) => {
    const wantAuto = van.state(null);
    const isAuto = () => wantAuto.val ?? autostarts(command);
    let autoQueue = Promise.resolve();
    let autoRuns = 0;
    const flipAuto = () => {
        const next = !isAuto();
        linger(command);
        wantAuto.val = next;
        autoRuns++;
        autoQueue = autoQueue.then(async () => {
            try {
                const { config: file } = await saveConfigPart((current) => ({
                    startupCheats: startupWith(withNewNames(current.startupCheats ?? []), command, next),
                }));
                startup.val = withNewNames(file.startupCheats ?? []);
                done();
            } catch {
                failed("Couldn't save. Try again.");
                await loadStartup();
            }
            if (--autoRuns === 0) wantAuto.val = null;
        });
    };
    return div(
        { class: "my-cheat__tags" },
        button(
            {
                type: "button",
                class: "my-tag my-tag--pin",
                "aria-pressed": () => String(isPinned(command)),
                onclick: () => {
                    linger(command);
                    setPinned(command, !isPinned(command)).then(done, () => failed("Couldn't save. Try again."));
                },
            },
            Icons.Pin(),
            "Pin"
        ),
        button(
            {
                type: "button",
                class: "my-tag my-tag--auto",
                "aria-pressed": () => String(isAuto()),
                // Started through its group ("w4" starts every W4 cheat): only the group's own row changes that.
                title: () => (throughGroup(command) ? `Starts with ${groupOf(command)}` : ""),
                disabled: () => startup.val === null || throughGroup(command),
                onclick: flipAuto,
            },
            "Autostart"
        )
    );
};

/** `side`: true while Home has room for the column beside its worlds; else My cheats is one line under the title. */
export const MyCheats = (side) => {
    const { said, say, clear } = useSaid();
    // Cheats that lost their last reason to be here while the player works in the list; they go when the pointer
    // (or focus) leaves it.
    const lingering = van.state([]);
    const linger = (cheat) => {
        if (!lingering.val.includes(cheat)) lingering.val = [...lingering.val, cheat];
    };
    const letGo = () => lingering.val.length && (lingering.val = []);

    // Names for sorting, once the cheat list is in (a command until then).
    const labels = new Map();
    const labelOf = (command) => {
        if (!labels.has(command) && store.data.cheats.length) labels.set(command, rowOf(command).label);
        return labels.get(command) ?? command;
    };
    const shown = () => {
        store.data.cheats; // the names come with the cheat list
        return [...new Set([...store.getActiveCheats(), ...(startup.val ?? []), ...pins.val, ...lingering.val])].sort(
            (a, b) => labelOf(a).localeCompare(labelOf(b))
        );
    };
    const count = van.derive(() => shown().length);
    const onCount = van.derive(() => store.getActiveCheats().length);

    // Read now, and again when the player moves on: Settings › Startup may have changed the file.
    van.derive(() => {
        store.app.activeTab;
        store.app.menuPage;
        loadStartup();
    });

    // Folded (no room beside Home's worlds): the header is one line that opens the rows in place.
    const open = van.state(false);
    const list = div({ class: "my-cheats__list" });
    const openId = van.state(null);
    const body = div(
        {
            id: "my-cheats-rows",
            class: "tabbed-list__body system-cheats__rows my-cheats__body",
            hidden: () => !side.val && !open.val,
        },
        list,
        div(
            { class: "my-cheats__empty", hidden: () => count.val > 0 },
            p("Nothing here yet."),
            p("Turn a cheat on, or pin it with ", span({ class: "my-cheats__glyph" }, Icons.Pin()), " on any page."),
            button(
                { type: "button", class: "btn-quiet btn-sm", onclick: () => store.openMenu({ view: "CHEATS" }) },
                "Open Cheats"
            )
        ),
        Said({ said, className: "said--line" })
    );

    // One element per cheat, kept while it is listed, so a row keeps its state; a new one arrives in the accent.
    const rows = new Map();
    let ready = false;
    let knowsCheats = false;
    const firstStates = store.data.activeCheatStates;
    van.derive(() => {
        const names = shown();
        // Rows made before the cheat list came in don't know their value field: they are made again, once.
        if (!knowsCheats && store.data.cheats.length) {
            knowsCheats = true;
            for (const el of rows.values()) el.remove();
            rows.clear();
        }
        for (const [name, el] of rows)
            if (!names.includes(name)) {
                el.remove();
                rows.delete(name);
            }
        names.forEach((name, i) => {
            let el = rows.get(name);
            if (!el) {
                // A failure is said under the list, and this row's next success takes its own failure away.
                const failed = (reason) => say("failed", `${labelOf(name)}: ${reason}`);
                const done = () => said.val?.text.startsWith(`${labelOf(name)}: `) && clear();
                el = CheatRow(rowOf(name), {
                    openId,
                    config,
                    pin: false,
                    extra: Tags(name, { failed, done, linger }),
                    rowClass: () => `my-cheat${store.getActiveCheats().includes(name) ? "" : " is-off"}`,
                });
                rows.set(name, el);
                if (ready) {
                    arrive(el);
                    requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
                }
            }
            // Moved only when out of place: moving a row that holds focus would drop it.
            if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
        });
        // Not until the startup list and the game's first cheat states are in: what was on at start doesn't "arrive".
        if (startup.val !== null && store.data.activeCheatStates !== firstStates) ready = true;
    });

    const headWords = () => [
        span({ class: "account-section__title" }, "My cheats"),
        span({ class: "account-section__meta system-cheats__count" }, () => (onCount.val ? `${onCount.val} on` : "")),
    ];
    const panel = aside(
        {
            id: "my-cheats",
            class: () => `system-cheats my-cheats ${side.val ? "is-side" : "is-folded"}${open.val ? " is-open" : ""}`,
            "aria-label": "My cheats",
            // Not while a control in it has keyboard focus: its row would go with the focus (focus-out lets it go).
            onpointerleave: () =>
                (panel.contains(document.activeElement) && document.activeElement.matches(":focus-visible")) || letGo(),
            // A switch flipped off here keeps its row until the pointer leaves.
            onchange: (e) =>
                e.target.matches("[role=switch]") && linger(e.target.closest("[data-cheat]")?.dataset.cheat),
            // Focus moving out by keyboard. Not a click inside, and not the whole window losing focus (the player went to
            // the game).
            onfocusout: (e) => {
                if (document.hasFocus() && !panel.matches(":hover") && !panel.contains(e.relatedTarget)) letGo();
            },
            onkeydown: (e) => {
                if (e.key !== "Escape" || side.val || !open.val) return;
                open.val = false;
                panel.querySelector(".system-cheats__toggle")?.focus();
            },
        },
        div(
            { class: "account-section tabbed-list no-tabs" },
            () =>
                side.val
                    ? div({ class: "account-section__header" }, ...headWords())
                    : button(
                          {
                              type: "button",
                              class: "account-section__header system-cheats__toggle row-opener",
                              "aria-expanded": () => String(open.val),
                              "aria-controls": "my-cheats-rows",
                              onclick: () => (open.val = !open.val),
                          },
                          ...headWords()
                      ),
            p(
                { class: "my-cheats__hint", hidden: () => !side.val && !open.val },
                "Pin a cheat on any page to keep it here."
            ),
            body
        )
    );
    return panel;
};
