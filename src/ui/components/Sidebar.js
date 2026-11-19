import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS, IS_ELECTRON } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { withTooltip } from "./Tooltip.js";
import { NotificationHistory } from "./NotificationHistory.js";
import { WORLDS, AREAS, worldClass } from "../menu/menuModel.js";

const { nav, div, button, span, a } = van.tags;

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

const ActiveCheatList = () => {
    return div({ class: "active-cheats" }, div({ class: "active-cheats-header" }, "ACTIVE CHEATS"), () => {
        const activeCheats = store.getActiveCheats();

        if (activeCheats.length === 0) {
            return div({ class: "active-cheats-list" }, span({ class: "no-active-cheats" }, "None"));
        }

        return div(
            { class: "active-cheats-list" },
            ...activeCheats.map((cheat) =>
                span(
                    { class: "active-cheat-item", onclick: () => store.executeCheat(cheat, cheat, false) },
                    span({ class: "active-cheat-text" }, cheat)
                )
            )
        );
    });
};

export const Sidebar = () => {
    const hasUpdate = () => store.app.updateInfo?.updateAvailable;

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
                                onclick: () => store.openUpdateModal(),
                                "aria-label": () =>
                                    hasUpdate()
                                        ? `Update available: ${store.app.updateInfo.latestVersion}`
                                        : "Current version",
                            },
                            span(() => (store.app.appInfo?.version ? `v${store.app.appInfo.version}` : "")),
                            span({
                                class: () => `update-ready-dot ${hasUpdate() ? "" : "is-hidden"}`,
                                "aria-hidden": "true",
                            })
                        )
                    )
                )
            ),
            NotificationHistory()
        ),
        MenuNav(),
        ActiveCheatList(),
        div(
            { class: "system-status" },
            div({
                class: () => {
                    const online = IS_ELECTRON || store.app.heartbeat;
                    return `status-dot ${online ? "is-online" : "is-offline"}`;
                },
            }),
            span(
                {
                    id: "system-status-text",
                    class: () => {
                        const online = IS_ELECTRON || store.app.heartbeat;
                        return online ? "is-online" : "is-offline";
                    },
                },
                () => (IS_ELECTRON || store.app.heartbeat ? "SYSTEM ONLINE" : "CONNECTION LOST")
            ),

            withTooltip(
                a(
                    {
                        class: "system-shortcuts-button system-github-link",
                        href: "https://github.com/Idleon-Injector/Idleon-Injector",
                        target: "_blank",
                        "aria-label": "Official GitHub Repository",
                        onclick: (e) => {
                            if (IS_ELECTRON) {
                                e.preventDefault();
                                store.openExternalUrl("https://github.com/Idleon-Injector/Idleon-Injector");
                            }
                        },
                    },
                    Icons.GitHub()
                ),
                "Official GitHub Repository",
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
