/**
 * Pages view: the open page of one world. Its systems and pages are its list in the sidebar (MenuLevels.js).
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Icons } from "../../assets/icons.js";
import { Loader } from "../Loader.js";
import { menuTree, menuError } from "../../menu/pageRegistry.js";
import { pageShown, worldClass } from "../../menu/menuModel.js";
import { VIEWS } from "../../state/constants.js";
import { renderLazyPanes } from "./account/tabShared.js";
// Undo all, offered beside a page's bulk control after it changed values.
import "./account/UndoAllOffer.js";

const { div, span, p } = van.tags;

/** A world none of whose pages loaded (the menu error says why). */
const NoPages = (world) =>
    div(
        { class: "world-sub-pane active world-sub-pane--empty" },
        p({ class: "world-empty-label" }, Icons.Warning({ class: "empty-state-mark" }), `${world.label} has no pages`),
        p({ class: "world-empty-desc" }, menuError.val || "None of its pages loaded.")
    );

/** The world on screen and its open page (its first page until one is picked). Shared with the sidebar's lists. */
export const worldNow = (tree) => tree.find((world) => world.id === store.app.menuWorld) || tree[0];
const pagesOf = (world) => world.systems.flatMap((system) => system.pages);
export const pageNow = (world) => pagesOf(world).find((page) => page.id === store.app.menuPage) || pagesOf(world)[0];

const WorldFrame = (tree) => {
    const allPages = tree.flatMap(pagesOf);
    const activePage = van.derive(() => (pageNow(worldNow(tree)) || { id: "" }).id);
    // Each time a page is shown (picked, or the Pages view shown again), the pages that asked are told.
    van.derive(() => {
        if (store.app.activeTab !== VIEWS.PAGES.id) return;
        pageShown(activePage.val);
    });

    // No tab rows: a world's systems and a system's pages are its list in the sidebar (MenuLevels.js); this view is
    // only the page.
    return div(
        { class: () => `world-tab menu-world ${worldClass(worldNow(tree))}` },
        () => {
            const world = worldNow(tree);
            return world.systems.length ? span({ hidden: true }) : NoPages(world);
        },
        div(
            { class: "world-sub-content", hidden: () => !worldNow(tree).systems.length },
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
        menuTree.val ? WorldFrame(menuTree.val) : div({ class: "account-loader" }, Loader({ text: "Loading pages" }))
    );
