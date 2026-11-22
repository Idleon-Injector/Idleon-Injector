/**
 * Menu levels. The sidebar is one menu that drills down: the top list, or the list of one
 * world or area (its systems, with a system's pages or a long page's sections under it). The open place decides the
 * level, so search lands with that world's list already showing. In the icon rail (the narrow overlay, or a collapsed
 * sidebar) words don't fit, so the level folds into one line above the page that opens the same list (SystemBar).
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VIEWS } from "../state/constants.js";
import { Icons } from "../assets/icons.js";
import { WORLDS, AREAS, pageTitle } from "../menu/menuModel.js";
import { menuTree } from "../menu/pageRegistry.js";
import { pageNow } from "./views/Pages.js";

const { div, button, span } = van.tags;

// The in-game overlay is narrow: the sidebar becomes the icon rail there.
const narrowQuery = window.matchMedia("(max-width: 760px)");
const isNarrow = van.state(narrowQuery.matches);
narrowQuery.addEventListener("change", (e) => (isNarrow.val = e.matches));
export const isRail = () => store.app.sidebarCollapsed || isNarrow.val;

/** Areas whose views become a list (Advanced). An area with one view just opens it. */
export const DRILL_AREAS = AREAS.filter((area) => area.tabs && area.tabs.length > 1);
const areaOf = (key) => DRILL_AREAS.find((area) => area.id === key);
const worldOf = (key) => menuTree.val?.find((world) => world.id === key);

/** The level the open place belongs to: a world's id, a drill area's id, or null for the top list. */
const placeLevel = () => {
    store.app.menuOpens;
    const tab = store.app.activeTab;
    if (tab === VIEWS.PAGES.id) return store.app.menuWorld ?? WORLDS[0].id;
    const area = DRILL_AREAS.find((a) => a.tabs.some((t) => VIEWS[t.view].id === tab));
    return area ? area.id : null;
};
/** The level the sidebar shows. Back sets it to null without leaving the page. */
export const menuLevel = van.state(null);
export const placeKey = van.derive(placeLevel);
// Every openMenu reaches here (menuOpens), so after Back a pick of the same world still shows its list again.
van.derive(() => (menuLevel.val = placeLevel()));

/** The code and label a level is listed under at the top (W1 / World 1, ADV / Advanced). */
export const levelHead = (key) => areaOf(key) || WORLDS.find((world) => world.id === key);

// The section in view: set by a jump, then kept by scrolling. "" means the page's first section.
const sectionNow = van.state("");
van.derive(() => {
    store.app.menuPage;
    store.app.menuWorld;
    sectionNow.val = "";
});
document.addEventListener(
    "scroll",
    (e) => {
        const nodes = [...document.querySelectorAll(".world-sub-pane.active [data-section]")];
        // The page itself scrolling (`document`) has no box to measure: only an inner box keeps the section.
        if (!(e.target instanceof Element) || !nodes.length || !e.target.contains(nodes[0])) return;
        const line = e.target.getBoundingClientRect().top + 120;
        let current = nodes[0];
        for (const node of nodes) if (node.getBoundingClientRect().top <= line) current = node;
        // At the very bottom the last section is the one being read, even when its heading can't reach the line.
        if (e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 2) current = nodes[nodes.length - 1];
        sectionNow.val = current.dataset.section;
    },
    true
);
const jumpTo = (id) => {
    const node = document.querySelector(`.world-sub-pane.active [data-section="${id}"]`);
    if (!node) return;
    sectionNow.val = id;
    node.scrollIntoView({ block: "start", behavior: "smooth" });
    node.focus({ preventScroll: true });
};

/** The page showing, when it belongs to this world; null otherwise (a list can be open on another world's page). */
const shownPage = (world) =>
    store.app.activeTab === VIEWS.PAGES.id && (store.app.menuWorld ?? WORLDS[0].id) === world.id
        ? pageNow(world)
        : null;

/**
 * One entry of a level: the sidebar's own row. A system shows its drawing in the code column (a waypoint until it has
 * one); a sub-entry leaves the column empty, so its words sit under the system's.
 */
const Item = ({ label, current, pick, sub = false }) =>
    button(
        {
            type: "button",
            class: () =>
                `tab-button menu-nav-btn drill-item ${sub ? "drill-item--sub" : ""} ${current() ? "active" : ""}`,
            "aria-current": () => (current() ? (sub ? "true" : "page") : "false"),
            onclick: pick,
        },
        span(
            { class: "menu-nav-code", "aria-hidden": "true" },
            sub ? null : (Icons.System({ name: label }) ?? Icons.Waypoint())
        ),
        span({ class: "tab-label" }, label)
    );

/**
 * A level's entries, shared by the sidebar and the rail's line. Built once per level; only the marks follow the open
 * page, so nothing moves under the pointer and focus stays where it was. `after` runs after a pick (the rail's line
 * closes). The sidebar's capitals come from its buttons' style, so the words stay as written.
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
    return world.systems.flatMap((system) => {
        const first = system.pages[0];
        const isOpen = () => system.pages.includes(shownPage(world));
        const open = () => {
            if (!isOpen()) store.openMenu({ world: world.id, page: first.id });
        };
        const children =
            system.pages.length > 1
                ? system.pages.map((p) => ({
                      label: pageTitle(p, system),
                      current: () => shownPage(world) === p,
                      pick: () => store.openMenu({ world: world.id, page: p.id }),
                  }))
                : (first.sections || []).map((section) => ({
                      label: section.label,
                      current: () => isOpen() && (sectionNow.val || first.sections[0].id) === section.id,
                      pick: () => {
                          if (isOpen()) return jumpTo(section.id);
                          open();
                          // The page mounts on the next render; then its heading can be scrolled to.
                          setTimeout(() => jumpTo(section.id), 80);
                      },
                  }));
        return [
            Item({
                label: system.name,
                current: isOpen,
                pick: () => {
                    open();
                    after();
                },
            }),
            ...children.map((child) =>
                Item({
                    ...child,
                    sub: true,
                    pick: () => {
                        child.pick();
                        after();
                    },
                })
            ),
        ];
    });
};

/** What the rail's line says: the level, then the system or view open in it. */
const lineWords = (key) => {
    const head = levelHead(key);
    const area = areaOf(key);
    const tab = area?.tabs.find((t) => VIEWS[t.view].id === store.app.activeTab);
    const world = worldOf(key);
    const page = world && pageNow(world);
    const system = page && world.systems.find((s) => s.pages.includes(page));
    return [head.label, tab ? tab.label : system ? system.name : ""];
};

/** The rail (narrow overlay, collapsed sidebar): the level folds into one line above the page that opens its list. */
export const SystemBar = () => {
    const open = van.state(false);
    van.derive(() => {
        placeKey.val;
        store.app.menuPage;
        store.app.activeTab;
        open.val = false;
    });
    document.addEventListener("click", (e) => {
        if (open.val && !e.target.closest?.(".syslist-bar")) open.val = false;
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
            if (placeKey.val === null) return span();
            const [level, place] = lineWords(placeKey.val);
            return span(
                { class: "syslist-toggle__words" },
                span({ class: "syslist-toggle__world" }, level),
                span({ class: "syslist-toggle__system" }, place)
            );
        },
        span({ class: () => `syslist-toggle__chev ${open.val ? "is-open" : ""}` }, Icons.Chevron({ dir: "down" }))
    );
    return div(
        {
            class: "syslist-bar",
            hidden: () => !isRail() || placeKey.val === null,
            onkeydown: (e) => {
                if (e.key !== "Escape" || !open.val) return;
                open.val = false;
                toggle.focus();
            },
        },
        toggle,
        div({ id: "syslist-panel", class: "syslist-panel", hidden: () => !open.val }, () =>
            open.val && placeKey.val !== null
                ? div(
                      { class: "syslist-items" },
                      ...LevelItems(placeKey.val, {
                          after: () => {
                              open.val = false;
                              toggle.focus();
                          },
                      })
                  )
                : div()
        )
    );
};
