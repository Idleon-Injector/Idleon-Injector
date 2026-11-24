import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS, IS_ELECTRON } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { withTooltip } from "./Tooltip.js";
import { WORLDS, AREAS, worldClass } from "../menu/menuModel.js";
import { menuError, menuTree } from "../menu/pageRegistry.js";
import { isRail, menuLevel, levelHead, LevelItems, DRILL_AREAS } from "./MenuLevels.js";
import { replay } from "./inPlace.js";

const { nav, div, button, span, a, p, ul, li } = van.tags;

const SHORTCUTS_TOOLTIP_TEXT =
    "Keyboard shortcuts:\n" +
    "Ctrl+K - Search the menu\n" +
    "1 - Cheats\n" +
    "3 - Settings\n" +
    "4 - Value search\n" +
    "5 - DevTools\n" +
    "/ - Focus this page's search\n" +
    "Ctrl+S - Save config (Settings)\n";

const areaActive = (area) => (area.tabs || [area]).some((tab) => store.app.activeTab === VIEWS[tab.view].id);

// `tip`: the rail's hover label, in normal case ("World 1"); the rail shows only the code.
const MenuBtn = ({ code, label, tip = label, active, onclick, colorClass = "", key = null, drill = false }) =>
    withTooltip(
        button(
            {
                type: "button",
                class: () =>
                    `tab-button menu-nav-btn ${colorClass} ${drill ? "is-drill" : ""} ${active() ? "active" : ""}`,
                "aria-current": () => (active() ? "page" : "false"),
                "data-key": key === null ? undefined : String(key),
                onclick,
                // Right opens a list, like Enter.
                onkeydown: (e) => {
                    if (drill && e.key === "ArrowRight" && !isRail()) {
                        e.preventDefault();
                        e.currentTarget.click();
                    }
                },
            },
            span({ class: "menu-nav-code", "aria-hidden": "true" }, code),
            span({ class: "tab-label" }, label),
            drill ? span({ class: "menu-nav-more", "aria-hidden": "true" }, Icons.Chevron({ dir: "right" })) : null
        ),
        tip,
        "right",
        isRail
    );

/*
 * The menu drills down. Picking a world (or Account, Classes, Advanced) opens it and slides the list
 * over to its systems; the row at the top goes back. Home above and the status and keys below
 * stay put while the middle slides. In the icon rail a world just opens; its list is the line above the page.
 */
let focusFirst = false; // a pick moves focus to the first entry of the new list
let focusBackTo = null; // going back returns focus to the entry the list was opened from
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// Opening a list doesn't open a page: the page stays until an entry is picked (Lumi: switching quickly around was a
// lot on the eyes; Automation too, her pick on #255). In the icon rail there is no list to slide to, so a world opens
// there as before.
const drillInto = (key, target) => {
    if (isRail()) return store.openMenu(target);
    focusFirst = true;
    menuLevel.val = key;
};

const WorldBtn = (world) =>
    MenuBtn({
        // A world or section with a drawing shows it instead of its code (Automation's loop: "AUT" read as a cut word).
        code: Icons.System({ name: world.label }) ?? world.code,
        label: world.label.toUpperCase(),
        tip: world.label,
        colorClass: worldClass(world),
        key: world.id,
        drill: true,
        active: () => store.app.activeTab === VIEWS.PAGES.id && store.app.menuWorld === world.id,
        onclick: () => drillInto(world.id, { world: world.id }),
    });
const sep = () => div({ class: "menu-nav-sep", role: "separator" });

const TopList = () =>
    div(
        { class: "menu-panel" },
        ...WORLDS.filter((world) => !world.apart).map(WorldBtn),
        // Automation is its own place, between the game's places and the injector's: a player who only wants
        // automation finds it without crossing a cheat page (#249).
        sep(),
        ...WORLDS.filter((world) => world.apart).map(WorldBtn),
        sep(),
        ...AREAS.map((area) => {
            const drill = DRILL_AREAS.includes(area);
            const target = { view: area.view || area.tabs[0].view };
            return MenuBtn({
                code: area.code,
                label: area.label.toUpperCase(),
                tip: area.label,
                key: area.id,
                drill,
                active: () => areaActive(area),
                onclick: () => (drill ? drillInto(area.id, target) : store.openMenu(target)),
            });
        })
    );

const LevelList = (key) => {
    const head = levelHead(key);
    const back = () => {
        focusBackTo = key;
        menuLevel.val = null;
    };
    return div(
        {
            class: "menu-panel menu-panel--level",
            onkeydown: (e) => {
                if (e.key !== "Escape" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                back();
            },
        },
        // The way back and where you are stay at the top while a long list scrolls under them.
        div(
            { class: "drill-head" },
            button(
                { type: "button", class: "tab-button menu-nav-btn drill-back", onclick: back },
                span({ class: "menu-nav-code", "aria-hidden": "true" }, Icons.Chevron({ dir: "left" })),
                span({ class: "tab-label" }, "MENU")
            ),
            div(
                {
                    class: `tab-button menu-nav-btn drill-title ${worldClass(head)}`,
                    role: "heading",
                    "aria-level": "2",
                },
                span(
                    { class: "menu-nav-code", "aria-hidden": "true" },
                    Icons.System({ name: head.label }) ?? head.code
                ),
                span({ class: "tab-label" }, head.label.toUpperCase())
            ),
            div({ class: "menu-nav-sep", role: "separator" })
        ),
        ...LevelItems(key)
    );
};

const MenuNav = () => {
    const box = div({ class: "nav-menu menu-nav menu-drill" });
    let shownKey;
    van.derive(() => {
        const key = isRail() ? null : menuLevel.val;
        menuTree.val; // a world's list fills in once the pages load
        const dir = shownKey === undefined || key === shownKey ? "" : key === null ? "back" : "fwd";
        const animate = dir && !reduceMotion.matches;
        const next = key === null ? TopList() : LevelList(key);
        for (const old of [...box.children]) {
            if (!animate || old.classList.contains("is-leaving")) {
                old.remove();
                continue;
            }
            old.classList.add("is-leaving", `menu-panel--leave-${dir}`);
            setTimeout(() => old.remove(), 240);
        }
        if (animate) next.classList.add(`menu-panel--enter-${dir}`);
        box.append(next);
        box.scrollTop = 0;
        if (focusFirst && key !== null) next.querySelector(".drill-item")?.focus();
        if (focusBackTo !== null && key === null) next.querySelector(`[data-key="${focusBackTo}"]`)?.focus();
        focusFirst = false;
        focusBackTo = null;
        shownKey = key;
    });
    // A long list scrolls inside the middle; the open entry is kept in view, on a new list and after search.
    van.derive(() => {
        store.app.menuPage;
        store.app.activeTab;
        menuLevel.val;
        menuTree.val;
        requestAnimationFrame(() => {
            const open = [...box.querySelectorAll(".menu-panel:not(.is-leaving) .tab-button.active")].pop();
            if (open) open.scrollIntoView({ block: "nearest" });
        });
    });
    return box;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What's wrong with the system right now (#77), for the status line: [] when all is well. Each problem stays
 * until it's fixed: the game closing until a restart, failed hooks until they install, pages until a reload.
 */
const systemProblems = () => {
    const problems = [];
    if (store.app.gameClosed)
        problems.push({
            short: "GAME CLOSED",
            title: "The game closed",
            body: () => [p("Restart the injector to use cheats again.")],
        });
    const hooks = store.app.hookFailures;
    if (hooks.length) {
        // A hook's id names its cheats ("w5.holes", "w4.labpx, w2.sigilspeed").
        const cheats = [...new Set(hooks.flatMap((line) => line.split(": ")[0].split(/,\s*/)))];
        problems.push({
            short: hooks.length === 1 ? "HOOK FAILED" : "HOOKS FAILED",
            title: `${plural(hooks.length, "game hook")} didn't install`,
            body: () => [
                p("So these cheats won't work:"),
                ul({ class: "status-details__cheats" }, ...cheats.map((id) => li(id.replace(/\./g, " ")))),
                p({ class: "status-details__tech" }, hooks.join("\n")),
            ],
        });
    }
    if (menuError.val)
        problems.push({
            short: "PAGES FAILED",
            title: "Some pages didn't load",
            body: () => [p(menuError.val), p("Restart the injector to try again.")],
        });
    return problems;
};

/**
 * The status line: SYSTEM ONLINE, or what's wrong in warm. With a problem it's a button that opens the details
 * (which hooks, which cheats) above it; it goes back to normal once nothing is wrong.
 */
const SystemStatus = () => {
    const open = van.state(false);
    const problems = van.derive(systemProblems);
    van.derive(() => {
        if (!problems.val.length) open.val = false;
    });
    const online = () => IS_ELECTRON || store.app.heartbeat;
    const tone = () => (problems.val.length ? "is-warn" : online() ? "is-online" : "is-offline");
    const label = () => {
        const list = problems.val;
        if (list.length) return list.length === 1 ? list[0].short : `${list.length} PROBLEMS`;
        return online() ? "SYSTEM ONLINE" : "CONNECTION LOST";
    };

    const toggle = button(
        {
            type: "button",
            class: () => `system-status-main ${tone()}`,
            disabled: () => !problems.val.length,
            "aria-expanded": () => String(open.val),
            "aria-controls": "system-status-details",
            onclick: () => (open.val = !open.val),
            onkeydown: (e) => {
                if (e.key === "Escape" && open.val) open.val = false;
            },
        },
        div({ class: () => `status-dot ${tone()}` }),
        span({ id: "system-status-text", class: tone, role: "status" }, label)
    );

    const panel = div(
        {
            id: "system-status-details",
            class: "status-details",
            hidden: () => !open.val,
            onkeydown: (e) => {
                if (e.key !== "Escape") return;
                open.val = false;
                toggle.focus();
            },
        },
        () =>
            div(
                ...problems.val.map((problem) =>
                    div(
                        { class: "status-details__problem" },
                        p({ class: "status-details__title" }, problem.title),
                        ...problem.body()
                    )
                )
            )
    );

    document.addEventListener("click", (e) => {
        if (open.val && !e.target.closest?.(".system-status")) open.val = false;
    });

    // The tone on the line itself lets the icon rail drop a calm "online" dot that says nothing.
    return div({ class: () => `system-status ${tone()}` }, toggle, panel);
};

export const Sidebar = () => {
    const hasUpdate = () => store.app.updateInfo?.updateAvailable;
    // Why the GitHub link didn't open (the desktop app opens it through the injector), said at the link.
    const linkFailed = van.state("");
    const checked = van.state(false);
    // Why the update check failed, said at the version button: a failed check isn't "the latest".
    const checkFailed = van.state("");

    return nav(
        {
            class: () => `sidebar ${isRail() ? "sidebar-collapsed" : ""}`,
            "aria-label": "Menu",
        },
        div(
            { class: "brand" },
            div(
                { class: "brand-main" },
                // Home is the first thing at the top, where the logo was: on the menu's code column, so it lines up
                // with every entry and stays put in the rail (Lumi, 2026-11-24).
                withTooltip(
                    button(
                        {
                            type: "button",
                            class: () =>
                                `tab-button menu-nav-btn brand-home ${store.app.activeTab === VIEWS.HOME.id ? "active" : ""}`,
                            "aria-label": "Home",
                            "aria-current": () => (store.app.activeTab === VIEWS.HOME.id ? "page" : "false"),
                            onclick: () => store.openMenu({ view: "HOME" }),
                        },
                        span({ class: "menu-nav-code", "aria-hidden": "true" }, Icons.System({ name: "Home" }))
                    ),
                    "Home",
                    "right",
                    isRail
                ),
                div(
                    { class: "brand-text" },
                    span("IDLEON"),
                    span({ class: "highlight" }, "INJECTOR"),
                    div(
                        {
                            class: () =>
                                `brand-version ${store.app.appInfo?.version ? "" : "brand-version-hidden"}`.trim(),
                        },
                        button(
                            {
                                type: "button",
                                class: () =>
                                    `brand-version-button ${hasUpdate() ? "has-update" : ""} ${
                                        checkFailed.val ? "is-failed" : ""
                                    }`,
                                // Already on the latest: the button confirms in place; nothing else to say.
                                onclick: async (e) => {
                                    const versionButton = e.currentTarget;
                                    checked.val = false;
                                    checkFailed.val = "";
                                    try {
                                        if (await store.openUpdateModal()) return;
                                    } catch (error) {
                                        checkFailed.val = error.message;
                                        return;
                                    }
                                    checked.val = true;
                                    replay(versionButton, "confirmed");
                                },
                                title: () => (checkFailed.val ? `The update check failed: ${checkFailed.val}` : ""),
                                "aria-label": () =>
                                    hasUpdate()
                                        ? `Update available: ${store.app.updateInfo.latestVersion}`
                                        : checkFailed.val
                                          ? `Current version. The update check failed: ${checkFailed.val}`
                                          : checked.val
                                            ? "Current version: it's the latest"
                                            : "Current version, check for updates",
                            },
                            span(() => (store.app.appInfo?.version ? `v${store.app.appInfo.version}` : "")),
                            span({
                                class: () => `update-ready-dot ${hasUpdate() ? "" : "is-hidden"}`,
                                "aria-hidden": "true",
                            })
                        )
                    )
                )
            )
        ),
        MenuNav(),
        SystemStatus(),

        // GitHub and Keys share the last line with the collapse chevron; the rail keeps only the chevron.
        div(
            { class: "sidebar-foot" },
            withTooltip(
                a(
                    {
                        class: () =>
                            `btn-quiet btn-icon btn-sm system-shortcuts-button system-github-link ${linkFailed.val ? "is-failed" : ""}`,
                        href: "https://github.com/Idleon-Injector/Idleon-Injector",
                        target: "_blank",
                        "aria-label": () =>
                            linkFailed.val ? `Couldn't open GitHub: ${linkFailed.val}` : "Official GitHub Repository",
                        onclick: async (e) => {
                            if (!IS_ELECTRON) return;
                            e.preventDefault();
                            linkFailed.val = await store.openExternalUrl(
                                "https://github.com/Idleon-Injector/Idleon-Injector"
                            );
                        },
                    },
                    Icons.GitHub()
                ),
                () => (linkFailed.val ? `Couldn't open GitHub: ${linkFailed.val}` : "Official GitHub Repository"),
                "right",
                () => !isRail()
            ),
            withTooltip(
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm system-shortcuts-button system-keys-button",
                        "aria-label": "Keys: keyboard shortcuts",
                    },
                    "Keys"
                ),
                SHORTCUTS_TOOLTIP_TEXT,
                "right",
                () => !isRail()
            ),
            withTooltip(
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-icon btn-sm sidebar-toggle",
                        "aria-label": () => (store.app.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"),
                        onclick: () => store.toggleSidebar(),
                    },
                    () => Icons.Chevron({ dir: store.app.sidebarCollapsed ? "right" : "left" })
                ),
                () => (store.app.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"),
                "right"
            )
        )
    );
};
