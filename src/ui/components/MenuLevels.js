/**
 * The menu's lists. The sidebar is one menu that drills down: the top list, or the list of one world or area (its
 * systems, with a system's pages or a page's sections under it). Which list shows is store.app.menuLevel: opening a
 * place shows its list, and picking a world only shows its list, so the page on screen stays until an entry is picked.
 * In the icon rail (the narrow overlay, or a collapsed sidebar) words don't fit, so the list opens from one line above
 * the page instead (SystemBar).
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { WORLDS, DRILL_AREAS, pageTitle } from "../menu/menuModel.js";
import { menuTree } from "../menu/pageRegistry.js";
import { pageSection } from "./views/account/tabShared.js";

const { div, button, span } = van.tags;

// The in-game overlay is narrow: the sidebar becomes the icon rail there.
const narrowQuery = window.matchMedia("(max-width: 760px)");
const isNarrow = van.state(narrowQuery.matches);
narrowQuery.addEventListener("change", (e) => (isNarrow.val = e.matches));
export const isRail = () => store.app.sidebarCollapsed || isNarrow.val;

const areaOf = (key) => DRILL_AREAS.find((area) => area.id === key);
const worldOf = (key) => menuTree.val?.find((world) => world.id === key);

/** The code and label a list is listed under at the top (W1 / World 1, ADV / Advanced). */
export const levelHead = (key) => areaOf(key) || WORLDS.find((world) => world.id === key);

const pagesOf = (world) => world.systems.flatMap((system) => system.pages);
/** The page on screen in a world: the one picked, else its first. Shared with the Pages view. */
export const pageNow = (world) => pagesOf(world).find((page) => page.id === store.app.menuPage) || pagesOf(world)[0];

/** The page showing, when it is one of this world's; null otherwise (a list can be open beside another page). */
const shownPage = (world) =>
    store.app.activeTab === VIEWS.PAGES.id && store.app.menuWorld === world.id ? pageNow(world) : null;

/** The open page's pane, where its section headings are. */
const paneOf = (page) => document.querySelector(`.world-sub-pane[data-page="${page.id}"]`);

// A page whose sections are headings on one long page: the sidebar marks the heading in view.
document.addEventListener(
    "scroll",
    (e) => {
        const pane = e.target.closest?.(".world-sub-pane.active");
        const page = pane && menuTree.val?.flatMap(pagesOf).find((p) => p.id === pane.dataset.page);
        if (!page?.sections || page.sectionMode === "switch") return;
        const nodes = [...pane.querySelectorAll("[data-section]")];
        if (!nodes.length) return;
        const line = e.target.getBoundingClientRect().top + 120;
        let current = nodes[0];
        for (const node of nodes) if (node.getBoundingClientRect().top <= line) current = node;
        // At the very bottom the last section is the one being read, even when its heading can't reach the line.
        if (e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 2) current = nodes[nodes.length - 1];
        pageSection(page.id, page.sections[0].id).val = current.dataset.section;
    },
    true
);

/** Show section `id` of a page: switch to it, or scroll its heading into view once the page has mounted. */
const showSection = (page, id) => {
    pageSection(page.id, page.sections[0].id).val = id;
    if (page.sectionMode === "switch") return;
    requestAnimationFrame(() => {
        const heading = paneOf(page)?.querySelector(`[data-section="${id}"]`);
        if (!heading) return;
        heading.scrollIntoView({
            block: "start",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
        heading.focus({ preventScroll: true });
    });
};

/** One entry of a list: the sidebar's own row, with an empty code column so it lines up under the list's head. */
const Item = ({ label, current, pick, depth = 0 }) =>
    button(
        {
            type: "button",
            class: () =>
                `tab-button menu-nav-btn drill-item ${depth ? `drill-item--sub drill-item--depth${depth}` : ""} ${current() ? "active" : ""}`,
            "aria-current": () => (current() ? (depth ? "true" : "page") : "false"),
            onclick: pick,
        },
        span({ class: "menu-nav-code", "aria-hidden": "true" }),
        span({ class: "tab-label" }, label)
    );

/** A page's sections as entries, under the page. */
const sectionItems = (world, page, depth, after) =>
    page.sections.map((section) =>
        Item({
            label: section.label,
            depth,
            current: () => shownPage(world) === page && pageSection(page.id, page.sections[0].id).val === section.id,
            pick: () => {
                if (shownPage(world) !== page) store.openMenu({ world: world.id, page: page.id });
                showSection(page, section.id);
                after();
            },
        })
    );

/**
 * A list's entries, shared by the sidebar and the rail's line. Built once per list; only the marks follow the page
 * on screen, so nothing moves under the pointer and focus stays where it was. `after` runs after a pick (the rail's
 * line closes).
 */
export const LevelItems = (key, { after = () => {} } = {}) => {
    const area = areaOf(key);
    if (area)
        return area.tabs.map((tab) =>
            Item({
                label: tab.label,
                current: () => store.app.activeTab === VIEWS[tab.view].id,
                pick: () => {
                    store.openMenu({ view: tab.view });
                    after();
                },
            })
        );
    const world = worldOf(key);
    if (!world) return [span({ class: "drill-note" }, "Loading pages")];
    const open = (page) => () => {
        if (shownPage(world) !== page) store.openMenu({ world: world.id, page: page.id });
        after();
    };
    return world.systems.flatMap((system) => {
        const [first] = system.pages;
        const head = Item({
            label: system.name,
            current: () => system.pages.includes(shownPage(world)),
            pick: open(first),
        });
        if (system.pages.length === 1) return [head, ...(first.sections ? sectionItems(world, first, 1, after) : [])];
        // A system's pages; the open page's sections (Map bonuses' worlds) show under it.
        return [
            head,
            ...system.pages.flatMap((page) => [
                Item({
                    label: pageTitle(page, system),
                    depth: 1,
                    current: () => shownPage(world) === page,
                    pick: open(page),
                }),
                ...(page.sections
                    ? [
                          () =>
                              div(
                                  { class: "drill-group", hidden: shownPage(world) !== page },
                                  ...(shownPage(world) === page ? sectionItems(world, page, 2, after) : [])
                              ),
                      ]
                    : []),
            ]),
        ];
    });
};

/** What the rail's line says: the list, then the entry open in it ("" when the page on screen is elsewhere). */
const lineWords = (key) => {
    const area = areaOf(key);
    const tab = area?.tabs.find((t) => store.app.activeTab === VIEWS[t.view].id);
    const world = worldOf(key);
    const page = world && shownPage(world);
    const system = page && world.systems.find((s) => s.pages.includes(page));
    return [levelHead(key).label, tab ? tab.label : system ? pageTitle(page, system) : ""];
};

/**
 * The rail (narrow overlay, collapsed sidebar): the list folds into one line above the page that opens it. Picking a
 * world in the rail opens the line's list straight away (`railOpen`).
 */
export const railOpen = van.state(false);

export const SystemBar = () => {
    const open = railOpen;
    van.derive(() => {
        // A page picked (here or by search) closes the list.
        store.app.menuPage;
        store.app.activeTab;
        open.val = false;
    });
    document.addEventListener("click", (e) => {
        if (open.val && !e.target.closest?.(".syslist-bar, .sidebar")) open.val = false;
    });
    const toggle = button(
        {
            type: "button",
            class: "syslist-toggle",
            "aria-expanded": () => String(open.val),
            "aria-controls": "syslist-panel",
            onclick: () => (open.val = !open.val),
        },
        () => {
            if (store.app.menuLevel === null) return span();
            const [level, place] = lineWords(store.app.menuLevel);
            return span(
                { class: "syslist-toggle__words" },
                span({ class: "syslist-toggle__world" }, level),
                span({ class: "syslist-toggle__system" }, place || "Pick a page")
            );
        },
        span({ class: () => `syslist-toggle__chev ${open.val ? "is-open" : ""}` }, Icons.Chevron({ dir: "down" }))
    );
    const panel = div({ id: "syslist-panel", class: "syslist-panel", hidden: () => !open.val }, () =>
        open.val && store.app.menuLevel !== null
            ? div(
                  { class: "syslist-items" },
                  ...LevelItems(store.app.menuLevel, {
                      after: () => {
                          open.val = false;
                          toggle.focus();
                      },
                  })
              )
            : div()
    );
    // Opened from a world in the rail: the first entry takes focus, as in the sidebar's list.
    van.derive(() => {
        if (open.val) requestAnimationFrame(() => panel.querySelector(".drill-item")?.focus());
    });
    return div(
        {
            class: "syslist-bar",
            hidden: () => !isRail() || store.app.menuLevel === null,
            onkeydown: (e) => {
                if (e.key !== "Escape" || !open.val) return;
                open.val = false;
                toggle.focus();
            },
        },
        toggle,
        panel
    );
};
