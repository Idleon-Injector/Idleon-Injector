// Each page standard check catches a broken page: small pages built from the shared pieces, broken one rule at a time.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "../known-bugs/index.mjs";
import { createFakeApi } from "../page-shots/fake-api.mjs";
import { fakeGameData } from "../page-shots/fake-game-data.mjs";
import { bulkBreaks, clickOutlineBreaks, pageBreaks } from "./checks.mjs";

const { router } = await createFakeApi(fakeGameData());
await loadUi(router);
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const { TabbedList, ListPanel } = await importRepo("src/ui/components/views/account/tabShared.js");
const { ClampedLevelRow } = await importRepo("src/ui/components/views/account/ClampedLevelRow.js");
const { AccountSection } = await importRepo("src/ui/components/views/account/components/AccountSection.js");
const { AccountTabHeader } = await importRepo("src/ui/components/views/account/components/AccountTabHeader.js");
const { div, span, button, input, select, label } = van.tags;

const declared = (extra = {}) => ({ id: "w1.test", world: 1, system: "Stamps", keywords: [], ...extra });
// A level line as every page builds it; `cap` is its max, or null for none.
const level = (name, cap = 15) =>
    ClampedLevelRow({
        valueState: van.state(3),
        write: async (next) => next,
        max: cap,
        renderInfo: () => span({ class: "account-row__name" }, name),
    });
// A line drawn by hand, for what the shared rows can't get wrong.
const line = (name, ...controls) =>
    div(
        { class: "account-row account-row--value" },
        div({ class: "account-row__info" }, span({ class: "account-row__name" }, name)),
        div({ class: "account-row__controls" }, ...controls)
    );
const switchLine = (name) => line(name, label({ class: "toggle-switch" }, input({ type: "checkbox", role: "switch" })));
const page = (title, ...body) => div(AccountTabHeader({ title }), ...body);
const breaksOf = (node, decl = declared(), title = "Stamps") => pageBreaks(node, decl, title);
const only = (breaks, rule) => breaks.filter((b) => b.startsWith(`${rule}:`));

test("a page built from the shared pieces, by the rules, has no breaks", () => {
    const node = page("Stamps", ListPanel({ body: [level("Heart Stamp"), level("Mana Stamp", null)] }));
    assert.deepEqual(breaksOf(node), []);
});

test("Max: a capped line without Max is a break; the shared rows add Max to every capped line", () => {
    const node = page(
        "Stamps",
        ListPanel({ body: [line("Book Stamp", div({ class: "number-input-wrapper number-input-wrapper--capped" }))] })
    );
    assert.deepEqual(only(breaksOf(node), "Max"), [`Max: "Book Stamp" has a cap but no Max button`]);
    assert.deepEqual(only(breaksOf(page("Stamps", ListPanel({ body: [level("Heart Stamp")] }))), "Max"), []);
});

test("Automation: a tab named Automation, or the automation list on another page, is a break", () => {
    const tabbed = TabbedList({
        name: "Sneaking",
        tabs: [
            { id: "up", label: "Upgrades", content: div() },
            { id: "auto", label: "Automation", content: div() },
        ],
    });
    assert.deepEqual(
        only(
            breaksOf(page("Upgrades", tabbed.node ?? tabbed), declared({ tab: "Upgrades" }), "Upgrades"),
            "Automation"
        ),
        [`Automation: "Automation" is a tab; make it its own page with tab "Automation"`]
    );
    const list = page("Upgrades", div({ class: "automation-rows" }));
    assert.equal(only(breaksOf(list, declared({ tab: "Upgrades" }), "Upgrades"), "Automation").length, 1);
    assert.deepEqual(only(breaksOf(list, declared({ tab: "Automation" }), "Upgrades"), "Automation"), []);
});

test("Tabs: a tab that holds tabs is a break", () => {
    const inner = TabbedList({
        name: "Fountain",
        tabs: [
            { id: "a", label: "Upgrades", content: div() },
            { id: "b", label: "Water", content: div() },
        ],
    });
    const outer = TabbedList({
        name: "Caverns",
        tabs: [
            { id: "f", label: "Fountain", content: inner },
            { id: "g", label: "Gambit", content: div() },
        ],
    });
    assert.equal(only(breaksOf(page("Caverns", outer), declared(), "Caverns"), "Tabs").length, 1);
});

test("Row switches: a tab that lists some of another tab's lines again with a switch each is a break", () => {
    const names = ["Ninja Stealth", "Jade Fortune", "Gold Rush", "Twin Blades"];
    const tabbed = TabbedList({
        name: "Sneaking",
        tabs: [
            { id: "know", label: "Ninja Knowledge", content: div(...names.map((name) => level(name))) },
            { id: "omni", label: "Omni Jade", content: div(...names.slice(0, 3).map(switchLine)) },
        ],
    });
    assert.deepEqual(only(breaksOf(page("Sneaking", tabbed), declared(), "Sneaking"), "Row switches"), [
        `Row switches: the "Omni Jade" tab lists the "Ninja Knowledge" tab's lines again; put its switch on those lines`,
    ]);
    // Two game screens of the same things (the Slab and its Greenstacks) are fine.
    const twins = TabbedList({
        name: "Slab",
        tabs: [
            { id: "slab", label: "Slab", content: div(...names.map(switchLine)) },
            { id: "green", label: "Greenstacks", content: div(...names.map(switchLine)) },
        ],
    });
    assert.deepEqual(only(breaksOf(page("Slab", twins), declared(), "Slab"), "Row switches"), []);
});

test("Names: a name or label in capitals is a break; the game's short capitals in a name stay", () => {
    const node = page(
        "STAMPS",
        ListPanel({ body: [level("THICC_SKIN"), level("Base STR"), level("RIP Tide")] }),
        button("MAX ALL")
    );
    assert.deepEqual(only(breaksOf(node, declared(), "STAMPS"), "Names"), [
        `Names: "THICC_SKIN" is in capitals; show it in normal case`,
        `Names: "STAMPS" is in capitals; write it in normal case`,
        `Names: "MAX ALL" is in capitals; write it in normal case`,
    ]);
});

test("Title: a page whose title isn't its sidebar name is a break", () => {
    assert.deepEqual(only(breaksOf(page("Liquid", div()), declared(), "Cauldrons"), "Title"), [
        `Title: the page says "Liquid", its sidebar entry "Cauldrons"`,
    ]);
});

test("Search: a declared tab the page lacks, and a Gem shop group search can't find, are breaks", () => {
    const node = page("Stamps", AccountSection({ title: "Gem shop", body: level("Exalted Stamp uses") }));
    const decl = declared({ keywords: ["gem shop"], tabs: [{ id: "imports", label: "Imports" }] });
    assert.deepEqual(only(breaksOf(node, decl), "Search"), [
        `Search: definePage names a tab "Imports" the page doesn't have`,
        `Search: the Gem shop group isn't found by "limited", "fomo"`,
    ]);
});

test("Saving: a field without a save state, and a Save button, are breaks", () => {
    const node = page("Stamps", ListPanel({ body: [line("Book Stamp", input({ type: "text" }), button("Save"))] }));
    assert.deepEqual(only(breaksOf(node), "Saving"), [
        `Saving: "Book Stamp" has a field but no save state`,
        `Saving: a "Save" button; values save on Enter or on leaving the field`,
    ]);
});

test("Buttons, Picks and Feedback: a hover popup on a row button, a dropdown and 'Coming soon' are breaks", () => {
    const explained = button("Relock");
    explained.addEventListener("mouseenter", () => {});
    const node = page("Stamps", ListPanel({ body: [line("Book Stamp", explained, select())] }), div("Coming soon"));
    const breaks = breaksOf(node);
    assert.deepEqual(only(breaks, "Buttons"), [`Buttons: "Relock" on "Book Stamp" explains itself in a hover popup`]);
    assert.deepEqual(only(breaks, "Picks"), ["Picks: a dropdown; pick in place (PickInPlace)"]);
    assert.deepEqual(only(breaks, "Feedback"), [`Feedback: the page says "Coming soon"`]);
});

test("Bulk tools: a tool that takes away without asking, and a Max all that asks, are breaks", async () => {
    let written = 0;
    const tools = (_, ask) => [
        button({ class: "account-btn btn-danger", onclick: () => written++ }, "Unexalt all"),
        button(
            {
                class: "account-btn btn-danger",
                onclick: (e) =>
                    ask({
                        question: "Lock all 12?",
                        confirmLabel: "Lock them",
                        from: e.currentTarget,
                        onConfirm: () => written++,
                    }),
            },
            "Lock all"
        ),
        button(
            {
                class: "account-btn btn-quiet",
                onclick: (e) =>
                    ask({
                        question: "Max all 12?",
                        confirmLabel: "Max them",
                        from: e.currentTarget,
                        onConfirm: () => written++,
                    }),
            },
            "Max all"
        ),
    ];
    const node = page("Stamps", ListPanel({ body: level("Heart Stamp"), tools, toolsLabel: () => "All 12 stamps" }));
    assert.deepEqual(await bulkBreaks(node, () => written), [
        `Bulk tools: "Unexalt all" takes away without asking in the tray`,
        `Bulk tools: "Max all" asks; Max all runs on one press`,
    ]);
});

test("Clicks: a :focus outline or accent ring is a break; :focus-visible and [data-keyboard] are the keyboard's", () => {
    const css = `
        .a:focus { outline: 2px solid var(--c-accent); }
        .b:focus-within { box-shadow: 0 0 0 2px var(--c-accent); }
        .c:focus-visible { outline: 2px solid var(--c-accent); }
        [data-keyboard] .d:focus { outline: 2px solid var(--c-accent); }
        .e:focus { outline: none; border-color: var(--c-border-strong); }
        :focus:not(:focus-visible) { outline: none; }`;
    assert.deepEqual(clickOutlineBreaks(css, "page.css"), [
        `Clicks: page.css rings ".a:focus" after a click; use :focus-visible`,
        `Clicks: page.css rings ".b:focus-within" after a click; use :focus-visible`,
    ]);
});
