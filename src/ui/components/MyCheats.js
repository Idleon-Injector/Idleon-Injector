/**
 * My cheats (concept): the sidebar's list of the player's own cheats, where "Active cheats" was. Lumi: every cheat on
 * now plus every cheat set to start with the injector; effectively your favourites. Second pass (her words: "on/off if
 * you press on the name and it turns grey and white depending on the state. a autostart option if its not in autostart
 * already?"): the quiet look of the old list, names only, at the sidebar's own width.
 *
 * A cheat gets in by being turned on anywhere (a page's cheats panel, the Cheats area, the command box) or by being in
 * the startup cheats (Settings › Startup). It arrives with the accent wash draining from its row. Autostart is the
 * same startup list Settings › Startup edits; changing it never turns the cheat on or off now.
 *
 * Rows keep one order (by name) and stay put while the pointer or focus is in the list, so a cheat turned off here
 * doesn't leave from under the cursor; it goes when the pointer leaves. In the icon rail (a narrow window, a folded
 * sidebar) the list opens from a "MY" entry at the rail's foot, over the page, like the status details do.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { fetchConfig, saveConfigPart, startupWith } from "../services/api.js";
import { withNewNames } from "../menu/pageCheats.js";
import { Icons } from "../assets/icons.js";
import { isRail } from "./MenuLevels.js";
import { Said, plainReason, useSaid } from "./inPlace.js";

const { button, div, span } = van.tags;

// The startup cheats as the config file holds them; null until read.
const startup = van.state(null);
const loadStartup = () =>
    fetchConfig()
        .then((file) => (startup.val = withNewNames(file.startupCheats ?? [])))
        .catch(() => {});

const groupOf = (cheat) => cheat.split(" ")[0];
// "w4" in the startup cheats starts every W4 cheat: only "w4"'s own row can change that.
const throughGroup = (cheat) => groupOf(cheat) !== cheat && (startup.val ?? []).includes(groupOf(cheat));
const autostarts = (cheat) => (startup.val ?? []).includes(cheat) || throughGroup(cheat);

const arrive = (el) => {
    el.classList.remove("is-arriving");
    void el.offsetWidth; // restart the wash
    el.classList.add("is-arriving");
    el.addEventListener("animationend", () => el.classList.remove("is-arriving"), { once: true });
};

/**
 * A row is the cheat's name, and the name is the switch: pressing it turns the cheat on or off (white on, grey off).
 * A cheat that starts with the injector has a small dot at the row's end. Pointing at the row (or focus in it) shows
 * "Autostart" there instead, a quiet toggle: plain words when it doesn't autostart, with a tick and the soft fill when
 * it does. Each row's presses save one at a time, in order, and the row shows the newest one while they run.
 */
const Row = (cheat, { say, linger }) => {
    const wantOn = van.state(null);
    const wantAuto = van.state(null);
    const isOn = () => wantOn.val ?? store.getActiveCheats().includes(cheat);
    const isAuto = () => wantAuto.val ?? autostarts(cheat);
    let onQueue = Promise.resolve();
    let autoQueue = Promise.resolve();
    let onRuns = 0;
    let autoRuns = 0;

    const flip = () => {
        const next = !isOn();
        linger(cheat);
        wantOn.val = next;
        onRuns++;
        onQueue = onQueue.then(async () => {
            const result = await store.executeCheat(cheat, next);
            if (!result.ok) say("failed", `${cheat}: ${plainReason(result.message)}`);
            if (--onRuns === 0) wantOn.val = null;
        });
    };
    const flipAuto = () => {
        const next = !isAuto();
        linger(cheat);
        wantAuto.val = next;
        autoRuns++;
        autoQueue = autoQueue.then(async () => {
            try {
                const { config } = await saveConfigPart((file) => ({
                    startupCheats: startupWith(withNewNames(file.startupCheats ?? []), cheat, next),
                }));
                startup.val = withNewNames(config.startupCheats ?? []);
            } catch {
                say("failed", "Couldn't save. Try again.");
                await loadStartup();
            }
            if (--autoRuns === 0) wantAuto.val = null;
        });
    };

    return div(
        {
            class: () => `my-cheat${isOn() ? " is-on" : ""}${isAuto() ? " is-auto" : ""}`,
            "data-cheat": cheat,
        },
        button(
            {
                type: "button",
                class: "my-cheat__name",
                "aria-pressed": () => String(isOn()),
                title: () => (isOn() ? `${cheat}: on` : `${cheat}: off`),
                onclick: flip,
            },
            cheat
        ),
        span({ class: "my-cheat__mark", "aria-hidden": "true" }),
        button(
            {
                type: "button",
                class: "my-cheat__auto",
                "aria-pressed": () => String(isAuto()),
                "aria-label": `${cheat}: autostart`,
                // Started through its group ("w4" starts every W4 cheat): only the group's own row changes that.
                disabled: () => startup.val === null || throughGroup(cheat),
                title: () => (throughGroup(cheat) ? `Starts with ${groupOf(cheat)}` : ""),
                onclick: flipAuto,
            },
            () => (isAuto() ? Icons.Check() : span()),
            "Autostart"
        )
    );
};

export const MyCheats = () => {
    const { said, say } = useSaid();
    // Cheats switched off here that stay in the list until the pointer (or focus) leaves it.
    const lingering = van.state([]);
    const linger = (cheat) => {
        if (!lingering.val.includes(cheat)) lingering.val = [...lingering.val, cheat];
    };
    const letGo = () => lingering.val.length && (lingering.val = []);

    const shown = () =>
        [...new Set([...store.getActiveCheats(), ...(startup.val ?? []), ...lingering.val])].sort((a, b) =>
            a.localeCompare(b)
        );
    const count = van.derive(() => shown().length);

    // Read now, and again when the player moves on: Settings › Startup may have changed the file.
    van.derive(() => {
        store.app.activeTab;
        store.app.menuPage;
        loadStartup();
    });

    // The rail's way in: "MY" at its foot opens the same list over the page.
    const open = van.state(false);
    van.derive(() => {
        if (!isRail()) open.val = false;
    });
    document.addEventListener("click", (e) => {
        if (open.val && !e.target.closest?.(".my-cheats, .my-cheats-rail")) open.val = false;
    });
    const railButton = button(
        {
            type: "button",
            class: () => `tab-button menu-nav-btn my-cheats-rail${open.val ? " active" : ""}`,
            "aria-expanded": () => String(open.val),
            "aria-controls": "my-cheats",
            "aria-label": "My cheats",
            onclick: () => (open.val = !open.val),
        },
        span({ class: "menu-nav-code", "aria-hidden": "true" }, "MY")
    );

    // One element per cheat, kept while it is listed, so a switch keeps its state; a new one arrives with the wash.
    const list = div({ class: "my-cheats__list" });
    // A list longer than its room fades at the foot while more is below.
    const cut = () => list.classList.toggle("is-cut", list.scrollTop + list.clientHeight < list.scrollHeight - 2);
    list.addEventListener("scroll", cut);
    new ResizeObserver(cut).observe(list);
    const rows = new Map();
    let ready = false;
    const firstStates = store.data.activeCheatStates;
    van.derive(() => {
        const names = shown();
        for (const [name, el] of rows)
            if (!names.includes(name)) {
                el.remove();
                rows.delete(name);
            }
        names.forEach((name, i) => {
            let el = rows.get(name);
            if (!el) {
                el = Row(name, { say, linger });
                rows.set(name, el);
                if (ready) {
                    arrive(el);
                    // Folded in the rail: its "MY" takes the wash instead.
                    if (isRail() && !open.val) arrive(railButton);
                    requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
                }
            }
            // Moved only when out of place: moving a row that holds focus would drop it.
            if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
        });
        requestAnimationFrame(cut);
        // Not until the startup list and the game's first cheat states are in: what was on at start doesn't "arrive".
        if (startup.val !== null && store.data.activeCheatStates !== firstStates) ready = true;
    });

    const box = div(
        {
            id: "my-cheats",
            class: () => `my-cheats${isRail() ? " is-pop" : ""}${count.val ? "" : " is-empty"}`,
            hidden: () => isRail() && !open.val,
            onpointerleave: letGo,
            // Focus moving out by keyboard. Not a click inside (a press on a row blurs before the switch takes focus
            // back), and not the whole window losing focus (the player went to the game).
            onfocusout: (e) => {
                if (document.hasFocus() && !box.matches(":hover") && !box.contains(e.relatedTarget)) letGo();
            },
            onkeydown: (e) => {
                if (e.key !== "Escape" || !open.val) return;
                open.val = false;
                railButton.focus();
            },
        },
        div({ class: "my-cheats__head" }, "MY CHEATS"),
        list,
        div({ class: "my-cheats__empty" }, "Cheats you turn on show here."),
        Said({ said, className: "said--line" })
    );
    return [div({ class: "my-cheats-rail-wrap", hidden: () => !isRail() }, railButton), box];
};
