/**
 * Home (concept, three ways to open the injector; ?home=a|b|c or the switcher at the foot of the page):
 *
 * - Atlas (a): every page by world, as an index in four columns: a world's code and region on top, its systems under
 *   it with their drawings, no boxes around them.
 * - Today (b): what is going on now. The game, what runs and the last save copy in the line under the title; the world
 *   codes as the page's buttons; then one group of the pages opened lately, the automations running and the newest
 *   changes.
 * - Search (c): the top bar's search is the page. Under it the pages opened lately and the world codes, large.
 *
 * My cheats is the right column in all three. Home stands in the same frame as a system page (Pages.js); where the
 * window has no room for the column, My cheats folds into one line under the title.
 */

import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { VIEWS, IS_ELECTRON } from "../../state/constants.js";
import { Loader } from "../Loader.js";
import { menuTree } from "../../menu/pageRegistry.js";
import { pageTitle, worldClass } from "../../menu/menuModel.js";
import { Icons } from "../../assets/icons.js";
import { MyCheats } from "../MyCheats.js";
import { balanceFrame, framed, pageNow, worldNow } from "./Pages.js";
import { fetchChanges, fetchSaveCopies } from "../../services/api.js";
import { changesVersion } from "../../services/changeLog.js";
import { readAutomations } from "./account/automation.js";
import { StepPicker } from "./account/components/StepPicker.js";

const { div, button, span, h3, p, time } = van.tags;

// ---------------------------------------------------------------- the concept switch

const VARIANTS = [
    { value: "a", label: "Atlas" },
    { value: "b", label: "Today" },
    { value: "c", label: "Search" },
];
const storedVariant = () => {
    try {
        return localStorage.getItem("homeConcept");
    } catch {
        return null;
    }
};
const asked = new URLSearchParams(globalThis.location?.search ?? "").get("home");
const variant = van.state(
    [asked, storedVariant()].find((v) => VARIANTS.some((x) => x.value === v)) ?? VARIANTS[0].value
);
const pickVariant = (value) => {
    variant.val = value;
    try {
        localStorage.setItem("homeConcept", value);
    } catch {
        // ponytail: storage blocked; the pick lasts this visit.
    }
    const url = new URL(location.href);
    url.searchParams.set("home", value);
    history.replaceState(null, "", url);
};

const onHome = () => store.app.activeTab === VIEWS.HOME.id;
// Search (c) makes the top bar the page's hero.
van.derive(() => document.body?.classList.toggle("home-hero", onHome() && variant.val === "c"));

// ---------------------------------------------------------------- pages opened lately

const RECENT_KEY = "homeRecentPages";
const readRecent = () => {
    try {
        const list = JSON.parse(localStorage.getItem(RECENT_KEY));
        return Array.isArray(list) ? list : [];
    } catch {
        return [];
    }
};
const recentIds = van.state(readRecent());
// Every page shown goes to the front of the list (six kept), in this browser only.
van.derive(() => {
    const tree = menuTree.val;
    if (!tree || store.app.activeTab !== VIEWS.PAGES.id) return;
    const world = worldNow(tree);
    const page = world && pageNow(world);
    if (!page) return;
    const now = recentIds.rawVal;
    if (now[0] === page.id) return;
    const next = [page.id, ...now.filter((id) => id !== page.id)].slice(0, 6);
    recentIds.val = next;
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        // ponytail: storage blocked; the list lasts this visit.
    }
});
/** The pages opened lately, newest first, as { page, system, world }. */
const recentPages = () => {
    const tree = menuTree.val ?? [];
    const found = new Map();
    for (const world of tree)
        for (const system of world.systems)
            for (const page of system.pages) found.set(page.id, { page, system, world });
    return recentIds.val.map((id) => found.get(id)).filter(Boolean);
};
const openPage = ({ world, page }) => store.openMenu({ world: world.id, page: page.id });
const openWorld = (world) =>
    store.openMenu(
        world.systems.length ? { world: world.id, page: world.systems[0].pages[0].id } : { world: world.id }
    );

const drawingOf = (name) => Icons.System({ name }) ?? Icons.Waypoint();
const codeOf = (world) => Icons.System({ name: world.label }) ?? world.code;

// ---------------------------------------------------------------- shared pieces

const Title = (desc, actions = null) =>
    div(
        { class: "account-header account-tab-header home-head" },
        span({ class: "account-tab-header__icon", "aria-hidden": "true" }, Icons.System({ name: "Home" })),
        div(
            { class: "account-tab-header__main" },
            h3({ class: "account-tab-header__title" }, "Home"),
            p({ class: "account-tab-header__desc" }, desc)
        ),
        actions
    );

/** The world codes in a row, each opening its world: small as a page's buttons (Today), large as the page (Search). */
const WorldCodes = ({ large = false, onPoint = null } = {}) =>
    div(
        { class: `home-codes${large ? " is-large" : ""}`, role: "group", "aria-label": "Worlds" },
        ...(menuTree.val ?? []).map((world) =>
            button(
                {
                    type: "button",
                    class: `home-code ${worldClass(world)}`,
                    "aria-label": typeof world.id === "number" ? `${world.label}, ${world.name}` : world.label,
                    onclick: () => openWorld(world),
                    onpointerenter: () => onPoint?.(world),
                    onfocus: () => onPoint?.(world),
                    onpointerleave: () => onPoint?.(null),
                    onblur: () => onPoint?.(null),
                },
                codeOf(world)
            )
        )
    );

/** A page opened lately as a row: its system's drawing, its name, its world's code at the end. */
const RecentRow = (entry) =>
    button(
        { type: "button", class: "home-row", onclick: () => openPage(entry) },
        span({ class: "home-row__mark", "aria-hidden": "true" }, drawingOf(entry.system.name)),
        span({ class: "home-row__name" }, pageTitle(entry.page, entry.system)),
        span({ class: `home-row__where ${worldClass(entry.world)}` }, entry.world.code)
    );

// ---------------------------------------------------------------- A: Atlas

const AtlasWorld = (world) =>
    div(
        { class: `home-atlas__world ${worldClass(world)}` },
        button(
            { type: "button", class: "home-atlas__head", onclick: () => openWorld(world) },
            span({ class: "home-atlas__code", "aria-hidden": "true" }, codeOf(world)),
            span({ class: "home-atlas__name" }, typeof world.id === "number" ? world.name : world.label)
        ),
        ...world.systems.map((system) =>
            button(
                {
                    type: "button",
                    class: "home-atlas__system",
                    onclick: () => store.openMenu({ world: world.id, page: system.pages[0].id }),
                },
                span({ class: "home-atlas__mark", "aria-hidden": "true" }, drawingOf(system.name)),
                span(system.name)
            )
        ),
        world.systems.length ? null : p({ class: "home-atlas__none" }, "No pages yet")
    );

/** A section apart from the worlds (Automation): one band under the columns, its pages in a line. */
const AtlasApart = (world) =>
    div(
        { class: "home-atlas__apart" },
        button(
            { type: "button", class: "home-atlas__head", onclick: () => openWorld(world) },
            span({ class: "home-atlas__code", "aria-hidden": "true" }, codeOf(world)),
            span({ class: "home-atlas__name" }, world.label)
        ),
        div(
            { class: "home-atlas__line" },
            ...world.systems.map((system) =>
                button(
                    {
                        type: "button",
                        class: "home-atlas__system",
                        onclick: () => store.openMenu({ world: world.id, page: system.pages[0].id }),
                    },
                    span(system.name)
                )
            )
        )
    );

const Atlas = () => [
    Title("Every page, by world."),
    div(
        { class: "home-frame" },
        div(
            { class: "account-section tabbed-list no-tabs home-list" },
            div({ class: "tabbed-list__body home-list__body" }, () =>
                menuTree.val
                    ? div(
                          div({ class: "home-atlas" }, ...menuTree.val.filter((w) => !w.apart).map(AtlasWorld)),
                          ...menuTree.val.filter((w) => w.apart).map(AtlasApart)
                      )
                    : div({ class: "account-loader" }, Loader({ text: "Loading pages" }))
            )
        )
    ),
];

// ---------------------------------------------------------------- B: Today

const clock = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const today = {
    changes: van.state(null), // null until read; "" when it failed
    automations: van.state(null),
    copy: van.state(undefined), // undefined until read, null when there is none
};
const readToday = () => {
    fetchChanges()
        .then(({ actions }) => (today.changes.val = actions))
        .catch(() => (today.changes.val = ""));
    readAutomations()
        .then((list) => (today.automations.val = list))
        .catch(() => (today.automations.val = ""));
    fetchSaveCopies()
        .then(({ copies }) => (today.copy.val = copies[0] ?? null))
        .catch(() => (today.copy.val = null));
};
van.derive(() => {
    changesVersion.val;
    if (onHome() && variant.val === "b") readToday();
});

const online = () => IS_ELECTRON || store.app.heartbeat;
const running = () => (today.automations.val || []).filter((a) => a.on);

/** The line under the title: the game, what runs, the last save copy. */
const StatusLine = () =>
    span(
        { class: "home-status" },
        span(
            { class: "home-status__part" },
            span({
                class: () => `status-dot ${store.app.gameClosed ? "is-warn" : online() ? "is-online" : "is-offline"}`,
            }),
            () => (store.app.gameClosed ? "Game closed" : online() ? "Game connected" : "Connection lost")
        ),
        span({ class: "home-status__part" }, () =>
            today.automations.val === null
                ? ""
                : running().length
                  ? `${plural(running().length, "automation")} running`
                  : "No automation running"
        ),
        span({ class: "home-status__part" }, () =>
            today.copy.val === undefined
                ? ""
                : today.copy.val
                  ? `Save copy at ${clock(today.copy.val.time)}`
                  : "No save copy yet"
        )
    );

const Section = (title, link, body) =>
    div(
        { class: "home-today__section" },
        div(
            { class: "home-today__head" },
            span({ class: "home-today__title" }, title),
            link ? button({ type: "button", class: "home-today__link", onclick: link.go }, link.label) : null
        ),
        body
    );

const Quiet = (text) => p({ class: "home-today__quiet" }, text);

const Today = () => [
    Title(StatusLine()),
    // The worlds, on the line under the title where a page keeps its filters.
    div({ class: "home-jump" }, () => WorldCodes()),
    div(
        { class: "home-frame" },
        div(
            { class: "account-section tabbed-list no-tabs home-list home-today" },
            div(
                { class: "tabbed-list__body home-list__body" },
                Section("Recent", null, () => {
                    const list = recentPages();
                    return list.length
                        ? div({ class: "home-rows" }, ...list.map(RecentRow))
                        : Quiet("Pages you open show here.");
                }),
                Section(
                    "Running",
                    {
                        label: "Automation",
                        go: () => store.openMenu({ world: "automation", page: "automation.overview" }),
                    },
                    () => {
                        const list = today.automations.val;
                        if (list === null) return Quiet("Reading…");
                        if (list === "") return Quiet("Couldn't read the automations.");
                        const on = running();
                        return on.length
                            ? div(
                                  { class: "home-rows" },
                                  ...on.map((a) =>
                                      button(
                                          {
                                              type: "button",
                                              class: "home-row home-row--two",
                                              onclick: () =>
                                                  store.openMenu({ world: "automation", page: "automation.overview" }),
                                          },
                                          span(
                                              { class: "home-row__mark", "aria-hidden": "true" },
                                              Icons.System({ name: "Automation" })
                                          ),
                                          span({ class: "home-row__name" }, a.label ?? a.cheat),
                                          span({ class: "home-row__note" }, a.status ?? "")
                                      )
                                  )
                              )
                            : Quiet("Nothing running.");
                    }
                ),
                Section("Changes", { label: "History", go: () => store.openMenu({ view: "HISTORY" }) }, () => {
                    const list = today.changes.val;
                    if (list === null) return Quiet("Reading…");
                    if (list === "") return Quiet("Couldn't read the changes.");
                    return list.length
                        ? div(
                              { class: "home-rows" },
                              ...list.slice(0, 4).map((action) =>
                                  button(
                                      {
                                          type: "button",
                                          class: "home-row home-change",
                                          onclick: () => store.openMenu({ view: "HISTORY" }),
                                      },
                                      time({ class: "home-change__time" }, clock(action.time)),
                                      span({ class: "home-row__name" }, action.label || action.page || "Change"),
                                      span({ class: "home-row__note" }, action.page || ""),
                                      span({ class: "home-change__count" }, plural(action.entries.length, "value"))
                                  )
                              )
                          )
                        : Quiet("Nothing changed this session.");
                })
            )
        )
    ),
];

// ---------------------------------------------------------------- C: Search

const Launcher = () => {
    const pointed = van.state(null);
    return [
        h3({ class: "sr-only" }, "Home"),
        div(
            { class: "home-frame" },
            div(
                { class: "home-launch" },
                () => {
                    const list = recentPages();
                    return div(
                        { class: "home-launch__recent" },
                        span({ class: "home-launch__label" }, "Recent"),
                        list.length
                            ? div(
                                  { class: "home-launch__pages" },
                                  ...list.map((entry) =>
                                      button(
                                          {
                                              type: "button",
                                              class: "home-launch__page",
                                              onclick: () => openPage(entry),
                                          },
                                          span(
                                              { class: "home-row__mark", "aria-hidden": "true" },
                                              drawingOf(entry.system.name)
                                          ),
                                          pageTitle(entry.page, entry.system)
                                      )
                                  )
                              )
                            : span({ class: "home-launch__none" }, "Pages you open show here.")
                    );
                },
                div(
                    { class: "home-launch__worlds" },
                    () => WorldCodes({ large: true, onPoint: (world) => (pointed.val = world) }),
                    p({ class: "home-launch__named", "aria-hidden": "true" }, () =>
                        pointed.val
                            ? `${pointed.val.label} · ${pointed.val.apart ? `${pointed.val.systems.length} pages` : pointed.val.name}`
                            : ""
                    )
                )
            )
        ),
    ];
};

// ---------------------------------------------------------------- the view

export const Home = () => {
    const variants = { a: Atlas, b: Today, c: Launcher };
    // One My cheats for all three, moved into the shown variant's frame, so its rows keep their state.
    const myCheats = MyCheats(framed);
    const page = div({ class: () => `menu-home home-${variant.val} ${framed.val ? "is-framed" : ""}` });
    // Built fresh on each switch (VanJS drops the bindings of nodes taken off the page).
    const show = () => {
        page.replaceChildren(...variants[variant.val]());
        page.querySelector(".home-frame").append(myCheats);
    };
    show();
    const root = div(
        { id: "home-tab", class: "tab-pane" },
        page,
        div(
            { class: "home-concept", hidden: () => !onHome() },
            span({ class: "home-concept__label" }, "Home concept"),
            StepPicker({
                name: "Home concept",
                steps: VARIANTS.map((v) => ({ ...v, tone: "accent" })),
                picked: () => variant.val,
                onPick: (value) => {
                    pickVariant(value);
                    show();
                },
            })
        )
    );
    balanceFrame(root);
    return root;
};
