/**
 * Home: every page by world, and the player's own cheats beside it. The menu search sits above it.
 * Each world is its own card (concept B): its code on the tile a page's header has, in its world's colour, its name,
 * and its systems as an index of lines inside it. The cards flow into as many columns as the width holds, so Home uses
 * the window at every size. The whole page scrolls; My cheats stays in view on the right while the worlds scroll, and
 * folds into one line under the title only when the window has no room for both.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Loader } from "../Loader.js";
import { menuTree } from "../../menu/pageRegistry.js";
import { WORLDS, worldClass } from "../../menu/menuModel.js";
import { Icons } from "../../assets/icons.js";
import { MyCheats } from "../MyCheats.js";
import { VIEWS } from "../../state/constants.js";

const { div, button, span, h3, p, nav } = van.tags;

// Room Home needs to put My cheats beside the worlds: one card's column (20rem), the gap, and the column (18rem).
const SIDE_MIN = 40 * 16;

/** One world as a card: its head opens the world's list, each line under it opens a system. */
const WorldCard = (world) =>
    div(
        { class: `world-card ${worldClass(world)}${world.systems.length ? "" : " is-unmoved"}` },
        button(
            {
                type: "button",
                class: "world-card__head",
                onclick: () => store.openMenu({ world: world.id }),
            },
            span(
                { class: "world-card__tile", "aria-hidden": "true" },
                Icons.System({ name: world.label }) ?? WORLDS.find((w) => w.id === world.id)?.code ?? ""
            ),
            span(
                { class: "world-card__words" },
                span({ class: "world-card__label" }, world.label),
                span({ class: "world-card__name" }, world.name)
            ),
            span({ class: "world-card__open", "aria-hidden": "true" }, Icons.Chevron({ dir: "right" }))
        ),
        world.systems.length
            ? nav(
                  { class: "world-card__systems", "aria-label": world.label },
                  ...world.systems.map((system) =>
                      button(
                          {
                              type: "button",
                              class: "world-card__system",
                              onclick: () => store.openMenu({ world: world.id, page: system.pages[0].id }),
                          },
                          span({ class: "world-card__system-name" }, system.name),
                          Icons.Chevron({ dir: "right", class: "world-card__arrow" })
                      )
                  )
              )
            : p({ class: "world-card__none" }, "No pages here yet.")
    );

export const Home = () => {
    const side = van.state(true);
    const root = div(
        { id: "home-tab", class: "tab-pane" },
        div(
            { class: () => `menu-home home-b ${side.val ? "has-side" : "is-narrow"}` },
            div(
                { class: "account-header account-tab-header" },
                span({ class: "account-tab-header__icon", "aria-hidden": "true" }, Icons.System({ name: "Home" })),
                div(
                    { class: "account-tab-header__main" },
                    h3({ class: "account-tab-header__title" }, "Home"),
                    p({ class: "account-tab-header__desc" }, "Every page, by world. Pick a system to open it.")
                )
            ),
            div(
                { class: "home-frame" },
                () =>
                    menuTree.val
                        ? div({ class: "home-worlds" }, ...menuTree.val.map(WorldCard))
                        : div({ class: "account-loader" }, Loader({ text: "Loading pages" })),
                MyCheats(side)
            )
        )
    );
    // Beside or folded from Home's own width (the sidebar may be open or folded), and the column's height for the
    // sticky list.
    new ResizeObserver(() => {
        if (!root.clientWidth) return;
        const pad = parseFloat(getComputedStyle(root).paddingLeft) * 2;
        side.val = root.clientWidth - pad >= SIDE_MIN;
        root.style.setProperty("--home-h", `${root.clientHeight}px`);
    }).observe(root);
    // The search above spans Home's whole width too, while Home is open.
    van.derive(() => {
        const home = store.app.activeTab === VIEWS.HOME.id;
        requestAnimationFrame(() => document.querySelector(".viewport")?.classList.toggle("home-wide", home));
    });
    return root;
};
