/**
 * Pages view: the open page of one world. A world's systems and pages are its list in the sidebar (MenuLevels.js).
 * Built from the page declarations under src/ui/pages/.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Icons } from "../../assets/icons.js";
import { Loader } from "../Loader.js";
import { menuTree, menuError } from "../../menu/pageRegistry.js";
import { pageShown, worldClass } from "../../menu/menuModel.js";
import { pageNow } from "../MenuLevels.js";
import { VIEWS } from "../../state/constants.js";
import { renderLazyPanes } from "./account/tabShared.js";
// Undo all, offered beside a page's bulk control after it changed values.
import "./account/UndoAllOffer.js";

const { div, p } = van.tags;

/** A world none of whose pages loaded (the menu error says why). */
const NoPages = (world) =>
    div(
        { class: "world-sub-pane active world-sub-pane--empty" },
        p({ class: "world-empty-label" }, Icons.Warning({ class: "empty-state-mark" }), `${world.label} has no pages`),
        p({ class: "world-empty-desc" }, menuError.val || "None of its pages loaded.")
    );

const WorldFrame = (tree) => {
    const allPages = tree.flatMap((world) => world.systems.flatMap((system) => system.pages));
    const worldNow = () => tree.find((world) => world.id === store.app.menuWorld) || tree[0];
    const activePage = van.derive(() => (pageNow(worldNow()) || { id: "" }).id);
    // Each time a page is shown (picked, or the Pages view shown again), the pages that asked are told.
    van.derive(() => {
        if (store.app.activeTab === VIEWS.PAGES.id) pageShown(activePage.val);
    });

    return div(
        { class: () => `world-tab menu-world ${worldClass(worldNow())}` },
        () => (worldNow().systems.length ? div({ hidden: true }) : NoPages(worldNow())),
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
        menuTree.val ? WorldFrame(menuTree.val) : div({ class: "account-loader" }, Loader({ text: "Loading pages" }))
    );
