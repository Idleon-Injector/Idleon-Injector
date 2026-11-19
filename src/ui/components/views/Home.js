/**
 * Home: the worlds and the active cheats. The menu search sits above every view, Home included.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { Loader } from "../Loader.js";
import { AccountSection } from "./account/components/AccountSection.js";
import { menuTree } from "../../menu/pageRegistry.js";
import { worldClass } from "../../menu/menuModel.js";

const { div, button, span } = van.tags;

const WorldTile = (world) =>
    div(
        { class: `menu-world-tile ${worldClass(world)} ${world.systems.length ? "" : "is-unmoved"}` },
        button(
            {
                type: "button",
                class: "menu-world-tile__head",
                onclick: () => store.openMenu({ world: world.id }),
            },
            span({ class: "menu-world-tile__code" }, world.code),
            span({ class: "menu-world-tile__label" }, world.label),
            span({ class: "menu-world-tile__name" }, world.name)
        ),
        world.systems.length
            ? div(
                  { class: "menu-world-tile__systems" },
                  ...world.systems.map((system) =>
                      button(
                          {
                              type: "button",
                              class: "menu-world-tile__system",
                              onclick: () => store.openMenu({ world: world.id, page: system.pages[0].id }),
                          },
                          system.name
                      )
                  )
              )
            : null
    );

const ActiveCheats = () =>
    div({ class: "menu-home-cheats" }, () => {
        const active = store.getActiveCheats();
        if (!active.length)
            return div(
                { class: "menu-home-cheats__empty" },
                span({ class: "no-active-cheats" }, "No cheats are on."),
                button(
                    { type: "button", class: "btn-secondary", onclick: () => store.openMenu({ view: "CHEATS" }) },
                    "OPEN CHEATS"
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
                        onclick: () => store.executeCheat(cheat, cheat, false),
                    },
                    span({ class: "active-cheat-text" }, cheat)
                )
            )
        );
    });

export const Home = () =>
    div(
        { id: "home-tab", class: "tab-pane" },
        div(
            { class: "scroll-container menu-home" },
            AccountSection({
                title: "WORLDS",
                note: "Dimmed worlds haven't moved yet; their pages still work in Older pages.",
                body: () =>
                    menuTree.val
                        ? div({ class: "menu-world-grid" }, ...menuTree.val.map(WorldTile))
                        : div({ class: "account-loader" }, Loader({ text: "LOADING PAGES" })),
            }),
            AccountSection({
                title: "ACTIVE CHEATS",
                note: () => {
                    const count = store.getActiveCheats().length;
                    return count ? `${count} on. Click one to turn it off.` : "";
                },
                body: ActiveCheats(),
            })
        )
    );
