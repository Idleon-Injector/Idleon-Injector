/**
 * Pages view: the open page of one world. Its systems and pages are its list in the sidebar (MenuLevels.js).
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Icons } from "../../assets/icons.js";
import { Loader } from "../Loader.js";
import { menuTree, menuError } from "../../menu/pageRegistry.js";
import { pageLeft, pageShown, worldClass } from "../../menu/menuModel.js";
import { VIEWS } from "../../state/constants.js";
import { renderLazyPanes } from "./account/tabShared.js";
import { SIDE, SystemCheats } from "../SystemCheats.js";
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

// Balances the page and its cheats column again (balanceFrame, below), once a page has rendered.
let relayout = () => {};

const WorldFrame = (tree) => {
    const allPages = tree.flatMap(pagesOf);
    const activePage = van.derive(() => (pageNow(worldNow(tree)) || { id: "" }).id);
    // Each time a page is shown (picked, or the Pages view shown again) or left, the pages that asked are told.
    let onScreen = null;
    van.derive(() => {
        const now = store.app.activeTab === VIEWS.PAGES.id ? activePage.val : null;
        if (onScreen && onScreen !== now) pageLeft(onScreen);
        onScreen = now;
        if (now) pageShown(now);
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
                // A system's own cheats stand beside its page, or fold under its title (#23).
                renderContent: (page) => {
                    const content = page.component();
                    SystemCheats(page, content);
                    // Its measure is known once it is on screen.
                    requestAnimationFrame(() => relayout());
                    return content;
                },
            })
        )
    );
};

/** True while the open view stands in the two-column frame (a page or Home beside its cheats column). */
export const framed = van.state(false);

/**
 * The page column and the cheats column beside it read as one layout (#23). Where the window holds both, the pair is
 * balanced in it, and the search above spans both. The balance is worked out from a list page (48rem) and a full
 * cheats column on every page, a page with no cheats included, so the page column never moves between pages; a wider
 * table page that doesn't fit beside its cheats at that place folds them under its title instead. Home stands in the
 * same frame, with My cheats as its column. Started once, by whichever of the two views is made first.
 */
let balancing = false;
export const balanceFrame = (root) => {
    if (balancing) return;
    balancing = true;
    let watched = false;
    const apply = () => {
        const viewport = root.closest(".viewport");
        if (!viewport) return;
        // The viewport, not this view: Home is framed too, while this view is hidden.
        if (!watched) new ResizeObserver(apply).observe(viewport);
        watched = true;
        const pad = parseFloat(getComputedStyle(viewport).getPropertyValue("--page-pad")) || 0;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const list = 48 * rem;
        const room = viewport.clientWidth - 2 * pad;
        const onPages = store.app.activeTab === VIEWS.PAGES.id;
        // The Cheats area too, unless the Config drawer takes the window's right side.
        const inFrame =
            onPages ||
            store.app.activeTab === VIEWS.HOME.id ||
            (store.app.activeTab === VIEWS.CHEATS.id && !store.app.configDrawerOpen);
        const fits = inFrame && room - list - SIDE.gap >= SIDE.min;
        viewport.classList.toggle("pages-frame", fits);
        framed.val = fits;
        if (!fits) return;
        const inset = Math.max(0, (room - list - SIDE.gap - SIDE.max) / 2);
        // The open page's own measure: a table page's search is as wide as its column and cheats column. The Cheats
        // area has no column beside it.
        const onCheats = store.app.activeTab === VIEWS.CHEATS.id;
        const open = onPages
            ? document.querySelector("#pages-tab .world-sub-pane.active > .tab-container")
            : onCheats && document.getElementById(VIEWS.CHEATS.id);
        const measure = open ? parseFloat(getComputedStyle(open).getPropertyValue("--page-measure")) * rem : list;
        const column = onCheats ? 0 : Math.min(SIDE.max, room - inset - measure - SIDE.gap);
        viewport.style.setProperty("--page-inset", `${inset}px`);
        viewport.style.setProperty("--frame-width", `${column >= SIDE.min ? measure + SIDE.gap + column : measure}px`);
    };
    relayout = apply;
    // Another page or view: after a frame, once the page is on screen.
    van.derive(() => {
        store.app.activeTab;
        store.app.menuPage;
        store.app.configDrawerOpen;
        requestAnimationFrame(apply);
    });
};

export const Pages = () => {
    const root = div({ id: "pages-tab", class: "tab-pane account-tab-layout" }, () =>
        menuTree.val ? WorldFrame(menuTree.val) : div({ class: "account-loader" }, Loader({ text: "Loading pages" }))
    );
    balanceFrame(root);
    return root;
};
