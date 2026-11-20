/**
 * Home: every page by world, as a contents page, and the cheats that are on. The menu search sits above it.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Loader } from "../Loader.js";
import { AccountSection } from "./account/components/AccountSection.js";
import { menuTree } from "../../menu/pageRegistry.js";
import { Said, useSaid } from "../inPlace.js";
import { turnOff } from "../Sidebar.js";

const { div, button, span, h3, p } = van.tags;

/** One world as a contents entry: its name as a heading, its systems as plain words under it that open them. */
const WorldEntry = (world) =>
    div(
        { class: `home-world ${world.systems.length ? "" : "is-unmoved"}` },
        h3(
            { class: "home-world__title" },
            span({ class: "home-world__label" }, world.label),
            span({ class: "home-world__name" }, world.name)
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

const ActiveCheats = () => {
    // Turning one off is a toggle: it leaves the list. Only a failure is said, under the list.
    const line = useSaid();
    return div(
        { class: "menu-home-cheats" },
        () => {
            const active = store.getActiveCheats();
            if (!active.length)
                return div(
                    { class: "menu-home-cheats__empty" },
                    span({ class: "no-active-cheats" }, "No cheats are on."),
                    button(
                        {
                            type: "button",
                            class: "btn-quiet btn-sm",
                            onclick: () => store.openMenu({ view: "CHEATS" }),
                        },
                        "Open cheats"
                    )
                );
            return div(
                { class: "menu-home-cheats__list" },
                ...active.map((cheat) =>
                    button(
                        {
                            type: "button",
                            class: "active-cheat-item",
                            title: `Turn off ${cheat}`,
                            onclick: () => turnOff(cheat, line),
                        },
                        span({ class: "active-cheat-text" }, cheat)
                    )
                )
            );
        },
        Said({ said: line.said, className: "said--line" })
    );
};

export const Home = () =>
    div(
        { id: "home-tab", class: "tab-pane" },
        div(
            { class: "scroll-container menu-home" },
            div(
                { class: "account-header account-tab-header" },
                div(
                    { class: "account-tab-header__main" },
                    h3({ class: "account-tab-header__title" }, "Home"),
                    p({ class: "account-tab-header__desc" }, "Every page, by world. Pick a system to open it.")
                )
            ),
            div(
                { class: "home-body" },
                () =>
                    menuTree.val
                        ? div({ class: "home-contents" }, ...menuTree.val.map(WorldEntry))
                        : div({ class: "account-loader" }, Loader({ text: "Loading pages" })),
                AccountSection({
                    title: "Cheats that are on",
                    note: () => (store.getActiveCheats().length ? "Click one to turn it off." : ""),
                    body: ActiveCheats(),
                })
            )
        )
    );
