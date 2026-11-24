/**
 * Home: every page by world, as a contents page, and the player's own cheats beside it. The menu search sits above it.
 * It stands in the same frame as a system page (Pages.js): the contents are the page column, one group whose worlds are
 * its rows, and My cheats is the column on the right, the sibling of a page's cheats panel. Where the window has no
 * room for the column, My cheats folds into one line under the title.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Loader } from "../Loader.js";
import { menuTree } from "../../menu/pageRegistry.js";
import { WORLDS, worldClass } from "../../menu/menuModel.js";
import { Icons } from "../../assets/icons.js";
import { MyCheats } from "../MyCheats.js";
import { balanceFrame, framed } from "./Pages.js";

const { div, button, span, h3, p } = van.tags;

/** One world as a row of the contents: its name opens it, its systems stand in a grid beside it. */
const WorldEntry = (world) =>
    div(
        { class: `home-world ${world.systems.length ? "" : "is-unmoved"}` },
        button(
            { type: "button", class: "home-world__title", onclick: () => store.openMenu({ world: world.id }) },
            span(
                { class: `home-world__code ${worldClass(world)}`, "aria-hidden": "true" },
                Icons.System({ name: world.label }) ?? WORLDS.find((w) => w.id === world.id)?.code ?? ""
            ),
            span(
                { class: "home-world__words" },
                span({ class: "home-world__label" }, world.label),
                span({ class: "home-world__name" }, world.name)
            )
        ),
        world.systems.length
            ? div(
                  { class: "home-world__systems" },
                  ...world.systems.map((system) =>
                      button(
                          {
                              type: "button",
                              class: "home-world__system",
                              onclick: () => store.openMenu({ world: world.id, page: system.pages[0].id }),
                          },
                          system.name
                      )
                  )
              )
            : null
    );

export const Home = () => {
    const root = div(
        { id: "home-tab", class: "tab-pane" },
        div(
            { class: () => `menu-home ${framed.val ? "is-framed" : ""}` },
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
                div(
                    { class: "account-section tabbed-list no-tabs home-list" },
                    div({ class: "tabbed-list__body home-list__body" }, () =>
                        menuTree.val
                            ? div({ class: "home-contents" }, ...menuTree.val.map(WorldEntry))
                            : div({ class: "account-loader" }, Loader({ text: "Loading pages" }))
                    )
                ),
                MyCheats(framed)
            )
        )
    );
    balanceFrame(root);
    return root;
};
