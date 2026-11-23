// The layout rules of the Page standards catch a broken page: made-up boxes, no browser.
import assert from "node:assert/strict";
import { test } from "node:test";
import { collectLayout, layoutBreaks } from "./layout.mjs";

// A row as collectLayout gives it: a field from `left` to `right` with its − / + at its end.
const field = (
    left,
    right,
    steppers = [
        [right - 54, right - 30],
        [right - 30, right - 6],
    ]
) => ({
    left,
    right,
    top: 0,
    bottom: 36,
    steppers: steppers.map(([l, r]) => ({ left: l, right: r, top: 4, bottom: 32 })),
});
const row = (name, extra = {}) => ({
    name,
    head: false,
    words: [{ left: 0, right: 200, top: 0, bottom: 20 }],
    parts: [],
    field: null,
    toggle: null,
    opener: null,
    cells: [],
    ...extra,
});
const list = (...rows) => [{ where: "", rows }];
const fine = () =>
    list(
        row("Heart Stamp", { field: field(600, 764) }),
        row("Mana Stamp", { field: field(600, 764) }),
        row("Book Stamp", { field: field(600, 764) })
    );

test("a list whose fields line up, with nothing out of place, has no breaks", () => {
    assert.deepEqual(layoutBreaks(fine(), fine()), []);
});

test("a line without Max's room breaks the fields' column", () => {
    const page = fine();
    page[0].rows[1].field = field(680, 844); // no empty slot where the others' Max is
    const breaks = layoutBreaks(page, page);
    assert.ok(
        breaks.some((b) => /the fields don't line up: "Mana Stamp" starts at 680px, 2 of 3 rows at 600px/.test(b)),
        breaks.join("\n")
    );
});

test("− / + outside their field, and a field outside its column, are breaks", () => {
    const page = fine();
    page[0].rows[0].field = field(600, 764, [
        [760, 784],
        [784, 808],
    ]);
    page[0].rows[1].cells = [{ left: 600, right: 700, top: 0, bottom: 36, field: field(600, 740) }];
    const breaks = layoutBreaks(page, page);
    assert.ok(
        breaks.some((b) => b.startsWith(`"Heart Stamp": its − / + stick out of their field`)),
        breaks.join("\n")
    );
    assert.ok(
        breaks.some((b) => b.startsWith(`"Mana Stamp": a field sticks out of its column`)),
        breaks.join("\n")
    );
});

test("controls that overlap each other or the name are breaks", () => {
    const page = fine();
    page[0].rows[0].parts = [
        { left: 600, right: 764, top: 0, bottom: 36 },
        { left: 700, right: 780, top: 0, bottom: 36 },
    ];
    page[0].rows[1].parts = [{ left: 150, right: 300, top: 0, bottom: 36 }];
    page[0].rows[2].words = [
        { left: 0, right: 120, top: 0, bottom: 20 },
        { left: 60, right: 160, top: 0, bottom: 20 },
    ];
    const breaks = layoutBreaks(page, page);
    assert.ok(
        breaks.some((b) => b.startsWith(`"Heart Stamp": two of its controls overlap`)),
        breaks.join("\n")
    );
    assert.ok(
        breaks.some((b) => b.startsWith(`"Mana Stamp": a control lies over its name`)),
        breaks.join("\n")
    );
    assert.ok(
        breaks.some((b) => b.startsWith(`"Book Stamp": its name's lines run into each other`)),
        breaks.join("\n")
    );
});

test("a field that moves when the row's controls show is a break", () => {
    const shown = fine();
    shown[0].rows[2].field = field(560, 764); // a picker beside it got wider
    const breaks = layoutBreaks(fine(), shown);
    assert.ok(breaks.includes(`"Book Stamp": its field moves when the row's controls show`), breaks.join("\n"));
});

test("opening rows' arrows, switches and a table's columns each line up", () => {
    const page = list(
        row("Sample 1", {
            opener: { left: 0, right: 420, top: 0, bottom: 39 },
            toggle: { left: 900, right: 940, top: 0, bottom: 20 },
        }),
        row("Sample 2", {
            opener: { left: 0, right: 420, top: 0, bottom: 39 },
            toggle: { left: 900, right: 940, top: 0, bottom: 20 },
        }),
        row("Sample 5", {
            opener: { left: 0, right: 620, top: 0, bottom: 39 },
            toggle: { left: 880, right: 920, top: 0, bottom: 20 },
        })
    );
    const cell = (left) => ({ left, right: left + 120, top: 0, bottom: 36, field: null });
    page[0].rows.forEach((r, i) => (r.cells = [cell(500), cell(i === 1 ? 640 : 620)]));
    const breaks = layoutBreaks(page, page);
    assert.ok(
        breaks.some((b) => b.startsWith(`the opening rows' arrows don't line up: "Sample 5" ends at 620px`)),
        breaks.join("\n")
    );
    assert.ok(
        breaks.some((b) => b.startsWith(`the switches don't line up: "Sample 5"`)),
        breaks.join("\n")
    );
    assert.ok(
        breaks.some((b) => b.startsWith(`column 2 doesn't line up: in "Sample 2" it starts at 640px`)),
        breaks.join("\n")
    );
});

// A small made-up page for collectLayout: elements with classes, children and boxes, the way a browser lays them out.
const el = (classes, rect, children = [], text = "") => {
    const node = {
        classList: { contains: (name) => classes.split(" ").includes(name) },
        children,
        textContent: text || children.map((child) => child.textContent).join(" "),
        getClientRects: () => (rect ? [rect] : []),
        getBoundingClientRect: () => rect ?? { left: 0, right: 0, top: 0, bottom: 0 },
    };
    children.forEach((child) => (child.parentElement = node));
    return node;
};
const at = (left, right, top = 0, bottom = 36) => ({ left, right, top, bottom });
const valueRow = (name, y, fieldLeft, max, capped = true) =>
    el("account-row account-row--value", at(0, 800, y, y + 54), [
        el("account-row__info", at(16, 400, y, y + 54), [
            el("account-row__name", at(16, 200, y + 10, y + 30), [], name),
        ]),
        el(
            "account-row__controls",
            at(420, 784, y, y + 54),
            [
                el(
                    `number-input-wrapper${capped ? " number-input-wrapper--capped" : ""}`,
                    at(fieldLeft, fieldLeft + 164, y + 9, y + 45),
                    [
                        el("number-input-btn", at(fieldLeft + 110, fieldLeft + 134, y + 13, y + 41)),
                        el("number-input-btn", at(fieldLeft + 134, fieldLeft + 158, y + 13, y + 41)),
                    ]
                ),
                max ? el("account-btn account-row__max", at(712, 784, y + 13, y + 41), [], "Max") : null,
            ].filter(Boolean)
        ),
    ]);

test("collectLayout reads a laid-out page, and a line missing Max's room is caught", () => {
    const panel = (rows) => ({
        body: el("body", at(0, 1440, 0, 900), [el("tabbed-list__body", at(0, 800, 0, 600), rows)]),
    });
    const broken = panel([
        valueRow("Money Points", 0, 540, true),
        valueRow("Bonus Exp", 54, 620, false),
        valueRow("Capacity", 108, 540, true),
    ]);
    const layout = collectLayout(broken);
    assert.equal(layout[0].rows.length, 3);
    assert.deepEqual(layout[0].rows[1].field.steppers.length, 2);
    const breaks = layoutBreaks(layout, layout);
    assert.ok(
        breaks.some((b) => b.startsWith(`the fields don't line up: "Bonus Exp" starts at 620px`)),
        breaks.join("\n")
    );
    const fixed = panel([
        valueRow("Money Points", 0, 540, true),
        valueRow("Bonus Exp", 54, 540, false),
        valueRow("Capacity", 108, 540, true),
    ]);
    assert.deepEqual(layoutBreaks(collectLayout(fixed), collectLayout(fixed)), []);
});

test("a Max showing beside a field without a cap is caught", () => {
    const page = {
        body: el("body", at(0, 1440, 0, 900), [
            el("tabbed-list__body", at(0, 800, 0, 600), [
                valueRow("Money Points", 0, 540, true),
                valueRow("Pingy penguins", 54, 540, true, false),
            ]),
        ]),
    };
    const layout = collectLayout(page);
    assert.deepEqual(layoutBreaks(layout, layout), [
        `"Pingy penguins": Max shows on a line without a cap (at rest)`,
        `"Pingy penguins": Max shows on a line without a cap (controls showing)`,
    ]);
});
