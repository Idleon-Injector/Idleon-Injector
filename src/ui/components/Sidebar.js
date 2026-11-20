import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS, IS_ELECTRON } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { withTooltip } from "./Tooltip.js";
import { WORLDS, AREAS, worldClass } from "../menu/menuModel.js";
import { menuError } from "../menu/pageRegistry.js";
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

// The in-game overlay is narrow: the sidebar becomes the icon rail there.
const narrowQuery = window.matchMedia("(max-width: 760px)");
const isNarrow = van.state(narrowQuery.matches);
narrowQuery.addEventListener("change", (e) => (isNarrow.val = e.matches));
const isRail = () => store.app.sidebarCollapsed || isNarrow.val;

const areaActive = (area) => (area.tabs || [area]).some((tab) => store.app.activeTab === VIEWS[tab.view].id);

const MenuBtn = ({ code, label, active, onclick, colorClass = "" }) =>
    withTooltip(
        button(
            {
                type: "button",
                class: () => `tab-button menu-nav-btn ${colorClass} ${active() ? "active" : ""}`,
                "aria-current": () => (active() ? "page" : "false"),
                onclick,
            },
            span({ class: "menu-nav-code", "aria-hidden": "true" }, code),
            span({ class: "tab-label" }, label)
        ),
        label,
        "right",
        isRail
    );

const MenuNav = () =>
    div(
        { class: "nav-menu menu-nav" },
        MenuBtn({
            code: Icons.Home(),
            label: "HOME",
            active: () => store.app.activeTab === VIEWS.HOME.id,
            onclick: () => store.openMenu({ view: "HOME" }),
        }),
        ...WORLDS.map((world) =>
            MenuBtn({
                code: world.code,
                label: world.label.toUpperCase(),
                colorClass: worldClass(world),
                active: () => store.app.activeTab === VIEWS.PAGES.id && store.app.menuWorld === world.id,
                onclick: () => store.openMenu({ world: world.id }),
            })
        ),
        div({ class: "menu-nav-sep", role: "separator" }),
        ...AREAS.map((area) =>
            MenuBtn({
                code: area.code,
                label: area.label.toUpperCase(),
                active: () => areaActive(area),
                onclick: () => store.openMenu({ view: area.view || area.tabs[0].view }),
            })
        )
    );

/** Turn an active cheat off. It leaving the list says it worked; a failure is said under the list. */
export const turnOff = async (cheat, say) => {
    const result = await store.executeCheat(cheat, false);
    if (!result.ok) say("failed", `${cheat}: ${plainReason(result.message)}`);
};

const ActiveCheatList = () => {
    const { said, say } = useSaid();
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
                        { class: "active-cheat-item", onclick: () => turnOff(cheat, say) },
                        span({ class: "active-cheat-text" }, cheat)
                    )
                )
            );
        },
        Said({ said, className: "said--line" })
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
                                class: () => `brand-version-button ${hasUpdate() ? "has-update" : ""}`,
                                // Already on the latest: the button confirms in place; nothing else to say.
                                onclick: async (e) => {
                                    const versionButton = e.currentTarget;
                                    if (!(await store.openUpdateModal())) {
                                        checked.val = true;
                                        replay(versionButton, "is-confirmed");
                                    }
                                },
                                "aria-label": () =>
                                    hasUpdate()
                                        ? `Update available: ${store.app.updateInfo.latestVersion}`
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
        div(
            { class: "system-status" },
            ...SystemStatus(),

            withTooltip(
                a(
                    {
                        class: () => `system-shortcuts-button system-github-link ${linkFailed.val ? "is-failed" : ""}`,
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
                        class: "system-shortcuts-button",
                        "aria-label": "Keyboard shortcuts",
                    },
                    Icons.Keyboard()
                ),
                SHORTCUTS_TOOLTIP_TEXT,
                "right",
                () => !isRail()
            )
        ),

        withTooltip(
            button({ class: "sidebar-toggle", onclick: () => store.toggleSidebar() }, () =>
                store.app.sidebarCollapsed ? Icons.ChevronRight() : Icons.ChevronLeft()
            ),
            () => (store.app.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"),
            "right"
        )
    );
};
