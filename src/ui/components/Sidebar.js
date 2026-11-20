import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS, IS_ELECTRON } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { withTooltip } from "./Tooltip.js";
import { WORLDS, AREAS, DRILL_AREAS, worldClass } from "../menu/menuModel.js";
import { menuError, menuTree } from "../menu/pageRegistry.js";
import { isRail, levelHead, LevelItems, railOpen } from "./MenuLevels.js";
import { Said, plainReason, replay, useSaid } from "./inPlace.js";

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

const MenuBtn = ({ code, label, active, onclick, colorClass = "", key = null, drill = false }) =>
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
                    if (!drill || e.key !== "ArrowRight") return;
                    e.preventDefault();
                    e.currentTarget.click();
                },
            },
            span({ class: "menu-nav-code", "aria-hidden": "true" }, code),
            span({ class: "tab-label" }, label),
            drill ? span({ class: "menu-nav-more", "aria-hidden": "true" }, Icons.Chevron({ dir: "right" })) : null
        ),
        label,
        "right",
        isRail
    );

/*
 * The menu drills down. Picking a world (or Advanced) slides the list over to that world's systems, with the way back
 * on top; the page on screen stays until an entry is picked. The logo above and the active cheats, status and keys
 * below stay put while the middle slides. In the icon rail the list opens from the line above the page instead.
 */
let focusFirst = false; // a pick moves focus to the first entry of the new list
let focusBackTo = null; // going back returns focus to the row the list was opened from
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const openList = (key) => {
    focusFirst = true;
    store.showMenuLevel(key);
    if (isRail()) railOpen.val = true;
};

const TopList = () =>
    div(
        { class: "menu-panel" },
        MenuBtn({
            code: "HOM",
            label: "Home",
            active: () => store.app.activeTab === VIEWS.HOME.id,
            onclick: () => store.openMenu({ view: "HOME" }),
        }),
        ...WORLDS.map((world) =>
            MenuBtn({
                code: world.code,
                label: world.label,
                colorClass: worldClass(world),
                key: world.id,
                drill: true,
                active: () => store.app.activeTab === VIEWS.PAGES.id && store.app.menuWorld === world.id,
                onclick: () => openList(world.id),
            })
        ),
        div({ class: "menu-nav-sep", role: "separator" }),
        ...AREAS.map((area) => {
            const drill = DRILL_AREAS.includes(area);
            return MenuBtn({
                code: area.code,
                label: area.label,
                key: area.id,
                drill,
                active: () => areaActive(area),
                onclick: () => (drill ? openList(area.id) : store.openMenu({ view: area.view || area.tabs[0].view })),
            });
        })
    );

const LevelList = (key) => {
    const head = levelHead(key);
    const back = () => {
        focusBackTo = key;
        store.showMenuLevel(null);
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
                span({ class: "tab-label" }, "Menu")
            ),
            div(
                { class: `menu-nav-btn drill-title ${worldClass(head)}`, role: "heading", "aria-level": "2" },
                span({ class: "menu-nav-code", "aria-hidden": "true" }, head.code),
                span({ class: "tab-label" }, head.label)
            ),
            div({ class: "menu-nav-sep", role: "separator" })
        ),
        ...LevelItems(key)
    );
};

const MenuNav = () => {
    const box = div({ class: "nav-menu menu-nav" });
    let shownKey;
    van.derive(() => {
        const key = isRail() ? null : store.app.menuLevel;
        menuTree.val; // a world's list fills in once the pages load
        const dir = shownKey === undefined || key === shownKey ? "" : key === null ? "back" : "fwd";
        const animate = dir && !reduceMotion.matches;
        const next = key === null ? TopList() : LevelList(key);
        for (const old of [...box.children]) {
            // A list still sliding out goes at once, so quick picks never stack lists.
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
        store.app.menuLevel;
        menuTree.val;
        requestAnimationFrame(() => {
            const open = [...box.querySelectorAll(".menu-panel:not(.is-leaving) .drill-item.active")].pop();
            open?.scrollIntoView({ block: "nearest" });
        });
    });
    return box;
};

/**
 * Turn an active cheat off. It leaving the list says it worked; a failure is said under the list (`line`, a
 * `useSaid()`) until that cheat turns off.
 */
export const turnOff = async (cheat, { said, say, clear }) => {
    const result = await store.executeCheat(cheat, false);
    if (!result.ok) return say("failed", `${cheat}: ${plainReason(result.message)}`);
    if (said.val?.text.startsWith(`${cheat}: `)) clear();
};

const ActiveCheatList = () => {
    const line = useSaid();
    return div(
        { class: "active-cheats" },
        div({ class: "active-cheats-header" }, "ACTIVE CHEATS"),
        () => {
            const activeCheats = store.getActiveCheats();

            if (activeCheats.length === 0) {
                return div({ class: "active-cheats-list" }, span({ class: "no-active-cheats" }, "None"));
            }

            return div(
                { class: "active-cheats-list" },
                ...activeCheats.map((cheat) =>
                    span(
                        { class: "active-cheat-item", onclick: () => turnOff(cheat, line) },
                        span({ class: "active-cheat-text" }, cheat)
                    )
                )
            );
        },
        Said({ said: line.said, className: "said--line" })
    );
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

    return [toggle, panel];
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
                div({ class: "brand-logo" }, Icons.Logo()),
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
        ActiveCheatList(),
        div({ class: "system-status" }, ...SystemStatus()),

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
