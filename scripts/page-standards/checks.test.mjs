// Each page standard check catches a broken page: small pages built from the shared pieces, broken one rule at a time.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importRepo, loadUi } from "../known-bugs/index.mjs";
import { createFakeApi } from "../page-shots/fake-api.mjs";
import { fakeGameData } from "../page-shots/fake-game-data.mjs";
import { bulkBreaks, clickOutlineBreaks, openedBreaks, pageBreaks } from "./checks.mjs";

const { router, game } = await createFakeApi(fakeGameData());
const { requests } = await loadUi(router);
const van = (await importRepo("src/ui/vendor/van-1.6.0.js")).default;
const { TabbedList, ListPanel } = await importRepo("src/ui/components/views/account/tabShared.js");
const { ClampedLevelRow } = await importRepo("src/ui/components/views/account/ClampedLevelRow.js");
const { SetAllTool, setAllLines } = await importRepo("src/ui/components/views/account/BulkActionBar.js");
const { ValueTableRow } = await importRepo("src/ui/components/views/account/EditableFieldsRow.js");
const { AccountSection } = await importRepo("src/ui/components/views/account/components/AccountSection.js");
const { AccountTabHeader } = await importRepo("src/ui/components/views/account/components/AccountTabHeader.js");
const { div, span, button, input, select, label } = van.tags;

const declared = (extra = {}) => ({ id: "w1.test", world: 1, system: "Stamps", keywords: [], ...extra });
// Writes the level lines made (a raise has to write).
let levelWrites = 0;
// A level line as every page builds it; `cap` is its max, or null for none.
const level = (name, cap = 15) =>
    ClampedLevelRow({
        valueState: van.state(3),
        write: async (next) => (levelWrites++, next),
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

test("Max: Max on a line without a cap is a break; an uncapped line keeping Max's empty room is fine", () => {
    const node = page(
        "Stamps",
        ListPanel({
            className: "field-columns",
            body: [
                level("Heart Stamp"),
                level("Mana Stamp", null),
                line(
                    "Book Stamp",
                    div({ class: "number-input-wrapper" }),
                    button({ class: "account-row__max" }, "Max")
                ),
            ],
        })
    );
    assert.deepEqual(only(breaksOf(node), "Max"), [`Max: "Book Stamp" has Max but no cap to fill up to`]);
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
        [`Automation: "Automation" is a tab; make it its own page in the Automation section`]
    );
    const list = page("Upgrades", div({ class: "automation-rows" }));
    assert.equal(only(breaksOf(list, declared({ tab: "Upgrades" }), "Upgrades"), "Automation").length, 1);
    assert.equal(
        only(breaksOf(list, declared({ tab: "Automation" }), "Upgrades"), "Automation").length,
        1,
        "a tab called Automation on a system's page still breaks it"
    );
    assert.deepEqual(only(breaksOf(list, declared({ world: "automation" }), "Upgrades"), "Automation"), []);
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
        ListPanel({ body: [level("THICC_SKIN"), level("Base STR"), level("RIP Tide"), level("EXP GMO")] }),
        button("UNLOCK ALL")
    );
    assert.deepEqual(only(breaksOf(node, declared(), "STAMPS"), "Names"), [
        `Names: "THICC_SKIN" is in capitals; show it in normal case`,
        `Names: "STAMPS" is in capitals; write it in normal case`,
        `Names: "UNLOCK ALL" is in capitals; write it in normal case`,
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

test("Fields: a field drawn by hand is a break, so a page can't leave the shared field (and its Max) out", () => {
    const capped = div({ class: "number-input-wrapper number-input-wrapper--capped" }, input({ type: "text" }));
    const node = page(
        "Stamps",
        ListPanel({
            body: [
                level("Heart Stamp"),
                line("Book Stamp", input({ type: "text", value: "3 / 15" })),
                line("Mana Stamp", capped),
            ],
        })
    );
    assert.deepEqual(only(breaksOf(node), "Fields"), [
        `Fields: "Book Stamp" has a field drawn by hand; use NumberInput`,
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

test("Bulk tools: a tool that asks, then writes after an await without the answer, is a break", async () => {
    let written = 0;
    const tools = (_, ask) => [
        button(
            {
                class: "account-btn btn-danger",
                onclick: async (e) => {
                    ask({ question: "Reset 12?", confirmLabel: "Reset them", from: e.currentTarget, onConfirm() {} });
                    await new Promise((resolve) => setTimeout(resolve, 30));
                    written++;
                },
            },
            "Reset all"
        ),
    ];
    const node = page("Stamps", ListPanel({ body: level("Heart Stamp"), tools, toolsLabel: () => "All 12 stamps" }));
    assert.deepEqual(await bulkBreaks(node, () => written), [`Bulk tools: "Reset all" wrote before the answer`]);
});

// The shared Set all on a list's lines, and one drawn by hand that does `press(value, ask, from)` on a press.
const setAllTool = (lines) => (_, ask) => SetAllTool({ ask, lines, word: (n) => `stamp${n === 1 ? "" : "s"}` });
const handSetAll = (press) => (_, ask) => {
    const field = input({ type: "text", placeholder: "Level" });
    return div(
        { class: "account-setall-row" },
        div({ class: "number-input-wrapper" }, field),
        button({ class: "account-btn btn-quiet", onclick: (e) => press(field.value, ask, e.currentTarget) }, "Set all")
    );
};
const levels = (...caps) => {
    const rows = caps.map((cap, i) => level(`Stamp ${i}`, cap));
    return { rows, lines: () => setAllLines({ childNodes: rows }) };
};

test("Set all: a list with lines without a max needs Set all; a list where every line has a max doesn't", async () => {
    const mixed = levels(15, null);
    assert.deepEqual(await bulkBreaks(page("Stamps", ListPanel({ body: mixed.rows })), () => 0), [
        "Set all: lines without a max but no Set all",
    ]);
    const capped = levels(15, 15);
    assert.deepEqual(await bulkBreaks(page("Stamps", ListPanel({ body: capped.rows })), () => 0), []);
    const tabbed = TabbedList({
        name: "Stamps",
        tabs: [
            { id: "combat", label: "Combat", content: div(...levels(null, null).rows) },
            { id: "skills", label: "Skills", content: div(...levels(15, 15).rows) },
        ],
    });
    assert.deepEqual(await bulkBreaks(page("Stamps", tabbed), () => 0), [
        "Set all: Combat: lines without a max but no Set all",
    ]);
});

test("Set all: the shared tool asks before it goes past a max or lowers, and otherwise runs on one press", async () => {
    const mixed = levels(15, null);
    const node = page(
        "Stamps",
        ListPanel({ body: mixed.rows, tools: setAllTool(mixed.lines), toolsLabel: () => "All 2 stamps" })
    );
    assert.deepEqual(await bulkBreaks(node, () => 0), []);
    const open = levels(null, null);
    const raising = page(
        "Stamps",
        ListPanel({ body: open.rows, tools: setAllTool(open.lines), toolsLabel: () => "All 2 stamps" })
    );
    assert.deepEqual(await bulkBreaks(raising, () => levelWrites), []);
});

test("Set all: one that writes past a max or lowers without asking, or asks when it only raises, is a break", async () => {
    let written = 0;
    const mixed = levels(15, null);
    const writesAtOnce = handSetAll((value) => value !== "" && written++);
    const node = page("Stamps", ListPanel({ body: mixed.rows, tools: writesAtOnce, toolsLabel: () => "All 2 stamps" }));
    assert.deepEqual(await bulkBreaks(node, () => written), [
        "Set all: lowers without asking in the tray",
        `Set all: goes past a max without asking "Stop at max" or "Go past"`,
    ]);
    const open = levels(null, null);
    const alwaysAsks = handSetAll((_value, ask, from) =>
        ask({ question: "Set 2 stamps?", confirmLabel: "Set them", from, onConfirm() {} })
    );
    const raising = page("Stamps", ListPanel({ body: open.rows, tools: alwaysAsks, toolsLabel: () => "All 2 stamps" }));
    assert.deepEqual(await bulkBreaks(raising, () => written), [
        "Set all: an empty field isn't refused",
        "Set all: asks when nothing goes past a max or down",
    ]);
});

test("Set all: in a table, the column its field names counts, so a capped column has to ask too", async () => {
    let written = 0;
    const row = (name) =>
        ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: [{ key: "level", label: "Level", valueState: van.state(3), paths: [`${name}[0]`], max: 15 }],
            read: async () => ({ level: 3 }),
        });
    const rows = [row("Heart"), row("Mana")];
    const tools = handSetAll((value) => value !== "" && written++);
    const node = page("Stamps", ListPanel({ body: rows, tools, toolsLabel: () => "All 2 stamps" }));
    assert.deepEqual(await bulkBreaks(node, () => written), [
        "Set all: lowers without asking in the tray",
        `Set all: goes past a max without asking "Stop at max" or "Go past"`,
    ]);
});

// A table line (#241): Level under its column, with a max or none.
const tableRow = (name, max) =>
    ValueTableRow({
        name,
        info: span({ class: "account-row__name" }, name),
        fields: [
            { key: "level", label: "Level", valueState: van.state(3), paths: [`${name}[0]`], ...(max && { max }) },
        ],
        read: async () => ({ level: 3 }),
    });

test("Set all: a table with a column without a max needs Set all, as a list does", async () => {
    const open = page("Stamps", ListPanel({ body: [tableRow("Heart"), tableRow("Mana")] }));
    assert.deepEqual(await bulkBreaks(open, () => 0), ["Set all: lines without a max but no Set all"]);
    const capped = page("Stamps", ListPanel({ body: [tableRow("Heart", 15), tableRow("Mana", 15)] }));
    assert.deepEqual(await bulkBreaks(capped, () => 0), []);
});

test("Set all: a raise that asks nothing but writes nothing, or leaves a line out, is a break", async () => {
    const open = levels(null, null);
    // Runs on one press, as it should, and writes nothing.
    const writesNothing = handSetAll(() => {});
    const node = page("Stamps", ListPanel({ body: open.rows, tools: writesNothing, toolsLabel: () => "All 2 stamps" }));
    assert.deepEqual(await bulkBreaks(node, () => 0), [
        "Set all: lowers without asking in the tray",
        "Set all: a raise that asks nothing doesn't set every line to it",
    ]);
    // Writes only the first line.
    let written = 0;
    const rows = ["Heart", "Mana"].map((name) =>
        ClampedLevelRow({
            valueState: van.state(3),
            write: async (next) => (written++, next),
            max: null,
            renderInfo: () => span({ class: "account-row__name" }, name),
        })
    );
    const firstOnly = (_, ask) =>
        SetAllTool({
            ask,
            lines: () => setAllLines({ childNodes: rows }).slice(0, 1),
            word: (n) => `stamp${n === 1 ? "" : "s"}`,
        });
    const partial = page("Stamps", ListPanel({ body: rows, tools: firstOnly, toolsLabel: () => "All 2 stamps" }));
    assert.deepEqual(await bulkBreaks(partial, () => written), [
        "Set all: a raise that asks nothing doesn't set every line to it",
    ]);
});

test("Set all: a column pick is held to the rules in each column, and only the picked column may change", async () => {
    const ola = game.gga.OptionsListAccount;
    const saved = ola.slice(600, 606);
    const gameWrites = () => requests.filter((line) => line.includes("/write")).length;
    const COLUMNS = [
        { value: "speed", label: "Speed" },
        { value: "fire", label: "Fire" },
    ];
    // Two kitchens, Speed and Fire each in its own place; `setAll` is what each row sets. `tied` shows one value in
    // both columns, so setting one changes the other.
    const kitchens = (setAll, tied = false) =>
        [0, 1].map((k) => {
            const at = (c) => `OptionsListAccount[${600 + k * 2 + c}]`;
            const speed = van.state(3);
            const states = { speed, fire: tied ? speed : van.state(4) };
            return ValueTableRow({
                name: `Kitchen ${k + 1}`,
                info: span({ class: "account-row__name" }, `Kitchen ${k + 1}`),
                fields: COLUMNS.map(({ value, label }, c) => ({
                    key: value,
                    label,
                    valueState: states[value],
                    paths: [at(c)],
                })),
                read: async () => ({ speed: ola[600 + k * 2], fire: ola[601 + k * 2] }),
                setAll,
            });
        });
    const panel = (column, setAll, tied) =>
        page(
            "Tables",
            ListPanel({
                body: kitchens(setAll, tied),
                setAll: { word: (n) => `kitchen${n === 1 ? "" : "s"}`, columns: COLUMNS, column },
            })
        );
    try {
        ola.splice(600, 4, 3, 4, 3, 4);
        const column = van.state("speed");
        assert.deepEqual(await bulkBreaks(panel(column, column), gameWrites), []);
        // Rows that keep setting Speed whichever column is picked: Fire's Set all has no lines to set.
        ola.splice(600, 4, 3, 4, 3, 4);
        const picked = van.state("speed");
        assert.deepEqual(await bulkBreaks(panel(picked, "speed"), gameWrites), [
            "Set all: Fire: lowers without asking in the tray",
            "Set all: Fire: a raise that asks nothing doesn't set every line to it",
        ]);
        // Rows where setting one column changes the other too.
        ola.splice(600, 4, 3, 3, 3, 3);
        const tied = van.state("speed");
        assert.deepEqual(await bulkBreaks(panel(tied, tied, true), gameWrites), [
            "Set all: Speed: changes another column too",
            "Set all: Fire: changes another column too",
        ]);
    } finally {
        ola.splice(600, saved.length, ...saved);
    }
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

// CodeRabbit on #248 (#250): an opener that shows only inside an opened row wasn't pressed, so what it opens passed.
test("a dropdown behind an opener inside an opened row is found", async () => {
    const outer = van.state(false);
    const inner = van.state(false);
    const opener = (state, name) =>
        button(
            { type: "button", "aria-expanded": () => String(state.val), onclick: () => (state.val = !state.val) },
            name
        );
    const pick = opener(inner, "Pick");
    const node = page(
        "Stamps",
        ListPanel({
            body: [
                line("Heart Stamp", opener(outer, "Open")),
                div(() => (outer.val ? div(pick, () => (inner.val ? select() : span())) : span())),
            ],
        })
    );
    assert.deepEqual(only(await openedBreaks(node), "Picks"), [
        `Picks: what "Pick" opens has a dropdown; pick in place (PickInPlace)`,
    ]);
});
