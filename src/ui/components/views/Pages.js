/**
 * Pages view: one world of the menu. Its systems as tabs, a system's pages as a second tab row,
 * then the page itself. Built from the page declarations under src/ui/pages/.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Icons } from "../../assets/icons.js";
import { Loader } from "../Loader.js";
import { menuTree, menuError } from "../../menu/pageRegistry.js";
import { pageTitle, worldClass } from "../../menu/menuModel.js";
import { renderLazyPanes } from "./account/tabShared.js";
// Undo all, offered beside a page's bulk control after it changed values.
import "./account/UndoAllOffer.js";

const { div, button, span, p } = van.tags;

const TabRow = ({ navClass, buttonClass, tabs, isActive, onPick, label }) =>
    div(
        { class: `account-sub-nav menu-tabs ${navClass}`, role: "tablist", "aria-label": label },
        ...tabs.map((tab) =>
            button(
                {
                    type: "button",
                    role: "tab",
                    class: `account-sub-tab-btn ${buttonClass} ${isActive(tab) ? "active" : ""}`,
                    "aria-selected": String(isActive(tab)),
                    onclick: () => onPick(tab),
                },
                tab.label
            )
        )
    );

/** A world none of whose pages loaded (the menu error says why). */
const NoPages = (world) =>
    div(
        { class: "world-sub-pane active world-sub-pane--empty" },
        span({ class: "world-empty-icon" }, Icons.Wrench()),
        p({ class: "world-empty-label" }, `${world.label.toUpperCase()} HAS NO PAGES`),
        p({ class: "world-empty-desc" }, menuError.val || "None of its pages loaded.")
    );

const WorldFrame = (tree) => {
    const allPages = tree.flatMap((world) => world.systems.flatMap((system) => system.pages));
    const worldNow = () => tree.find((world) => world.id === store.app.menuWorld) || tree[0];
    const pagesOf = (world) => world.systems.flatMap((system) => system.pages);
    const activePage = van.derive(() => {
        const pages = pagesOf(worldNow());
        return (pages.find((page) => page.id === store.app.menuPage) || pages[0] || { id: "" }).id;
    });

    return div(
        { class: () => `world-tab menu-world ${worldClass(worldNow())}` },
        () => {
            const world = worldNow();
            if (!world.systems.length) return NoPages(world);
            const system = world.systems.find((s) => s.pages.some((page) => page.id === activePage.val));
            return div(
                { class: "menu-world__nav" },
                TabRow({
                    label: `${world.label} systems`,
                    navClass: "menu-system-nav",
                    buttonClass: "account-world-sub-tab-btn",
                    tabs: world.systems.map((s) => ({ ...s, label: s.name })),
                    isActive: (s) => s.name === system.name,
                    onPick: (s) => store.openMenu({ world: world.id, page: s.pages[0].id }),
                }),
                system.pages.length > 1
                    ? TabRow({
                          label: `${system.name} pages`,
                          navClass: "account-page-nav",
                          buttonClass: "account-page-btn",
                          tabs: system.pages.map((page) => ({ ...page, label: pageTitle(page, system) })),
                          isActive: (page) => page.id === activePage.val,
                          onPick: (page) => store.openMenu({ world: world.id, page: page.id }),
                      })
                    : span()
            );
        },
        div(
            { class: "world-sub-content", hidden: () => !worldNow().systems.length },
            ...renderLazyPanes({
                tabs: allPages,
                activeId: activePage,
                paneClass: "world-sub-pane",
                dataAttr: "data-page",
                renderContent: (page) => page.component(),
            })
        )
    );
};

export const Pages = () =>
    div({ id: "pages-tab", class: "tab-pane account-tab-layout" }, () =>
        menuTree.val ? WorldFrame(menuTree.val) : div({ class: "account-loader" }, Loader({ text: "LOADING PAGES" }))
    );
