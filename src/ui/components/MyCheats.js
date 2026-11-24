/**
 * My cheats (concept, third pass): the sidebar's list of the player's own cheats, where "Active cheats" was, in the old
 * list's quiet look. Two small sections, each hidden while empty: Starts with injector (the startup cheats, the same
 * list Settings › Startup edits) and This session (on now, not starting with the injector). A name is white when its
 * cheat is on and grey when off, and pressing it turns the cheat on or off. Lumi: no dots or marks on rows; moving a
 * row between sections is one faint word shown while the row is pointed at.
 *
 * A cheat gets in by being turned on anywhere (a page's cheats panel, the Cheats area, the command box); its name
 * arrives in the accent and fades to white. While the pointer or focus is in the list nothing moves: a cheat turned off
 * here stays, and a row moved to the other section goes there, when the pointer leaves. In the icon rail (a narrow
 * window, a folded sidebar) the list opens from a "MY" entry at the rail's foot, over the page.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { fetchConfig, saveConfigPart, startupWith } from "../services/api.js";
import { withNewNames } from "../menu/pageCheats.js";
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
 * Pointing at the row (or focus in it) shows one faint word at its end that moves it to the other section:
 * "autostart" in This session, "remove" in Starts with injector. Each row's presses save one at a time, in order, and
 * the row shows the newest one while they run.
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
            class: () => `my-cheat${isOn() ? " is-on" : ""}`,
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
        button(
            {
                type: "button",
                class: "my-cheat__move",
                "aria-label": () =>
                    isAuto() ? `${cheat}: don't start with the injector` : `${cheat}: start with the injector`,
                // Started through its group ("w4" starts every W4 cheat): only the group's own row changes that.
                disabled: () => startup.val === null || throughGroup(cheat),
                title: () => (throughGroup(cheat) ? `Starts with ${groupOf(cheat)}` : ""),
                onclick: flipAuto,
            },
            () => (isAuto() ? "remove" : "autostart")
        )
    );
};

export const MyCheats = () => {
    const { said, say } = useSaid();
    // Cheats switched off here that stay in the list until the pointer (or focus) leaves it.
    const lingering = van.state([]);
    // While the player works in the list, every row keeps its section; a row whose autostart changed moves on leaving.
    const held = van.state(false);
    const linger = (cheat) => {
        held.val = true;
        if (!lingering.val.includes(cheat)) lingering.val = [...lingering.val, cheat];
    };
    const letGo = () => {
        held.val = false;
        if (lingering.val.length) lingering.val = [];
    };

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

    // Two sections, each hidden while empty: the cheats that start with the injector, then the ones on this session.
    const autoList = div({ class: "my-cheats__list" });
    const sessionList = div({ class: "my-cheats__list" });
    const autoCount = van.state(0);
    const sessionCount = van.state(0);
    const section = (title, list, n) =>
        div({ class: "my-cheats__section", hidden: () => !n.val }, div({ class: "my-cheats__sub" }, title), list);
    // The sections scroll together; a list longer than its room fades at the foot while more is below.
    const body = div(
        { class: "my-cheats__body" },
        section("STARTS WITH INJECTOR", autoList, autoCount),
        section("THIS SESSION", sessionList, sessionCount)
    );
    const cut = () => body.classList.toggle("is-cut", body.scrollTop + body.clientHeight < body.scrollHeight - 2);
    body.addEventListener("scroll", cut);
    new ResizeObserver(cut).observe(body);

    // One element per cheat, kept while it is listed, so a row keeps its state; a new one arrives in the accent.
    const rows = new Map();
    const placed = new Map(); // the section each row sits in: true for Starts with injector
    let ready = false;
    const firstStates = store.data.activeCheatStates;
    van.derive(() => {
        const names = shown();
        const keep = held.val;
        for (const [name, el] of rows)
            if (!names.includes(name)) {
                el.remove();
                rows.delete(name);
                placed.delete(name);
            }
        const lists = { true: [], false: [] };
        for (const name of names) {
            let el = rows.get(name);
            const isNew = !el;
            if (isNew) {
                el = Row(name, { say, linger });
                rows.set(name, el);
            }
            const auto = keep && placed.has(name) ? placed.get(name) : autostarts(name);
            const moved = placed.has(name) && placed.get(name) !== auto;
            placed.set(name, auto);
            lists[auto].push(el);
            if (ready && (isNew || moved)) {
                arrive(el);
                // Folded in the rail: its "MY" takes the accent instead.
                if (isNew && isRail() && !open.val) arrive(railButton);
                // A new cheat is shown; a moved one isn't scrolled to, so the list stays where the player left it.
                if (isNew) requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" }));
            }
        }
        for (const [list, els, n] of [
            [autoList, lists.true, autoCount],
            [sessionList, lists.false, sessionCount],
        ]) {
            // Moved only when out of place: moving a row that holds focus would drop it.
            els.forEach((el, i) => list.children[i] !== el && list.insertBefore(el, list.children[i] ?? null));
            n.val = els.length;
        }
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
        body,
        div({ class: "my-cheats__empty" }, "Cheats you turn on show here."),
        Said({ said, className: "said--line" })
    );
    return [div({ class: "my-cheats-rail-wrap", hidden: () => !isRail() }, railButton), box];
};
