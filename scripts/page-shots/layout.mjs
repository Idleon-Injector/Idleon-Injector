/**
 * The layout rules of DESIGN.md's Page standards, measured on a page the browser laid out: what lines up down a list,
 * what stays inside its column, what may not overlap, and what may not move when a row's controls show.
 *
 * `collectLayout(document)` runs in the page and returns plain boxes; `layoutBreaks(quiet, shown)` reads two of them
 * (rows at rest, and with every row's − / + and picker showing) and says what breaks, in plain words. No browser is
 * needed for the second part, so the tests can feed it made-up pages.
 */

/**
 * Runs in the browser (shoot.mjs sends its source). It walks the DOM by `children` and `classList` only, so a test can
 * hand it a small made-up tree. Each list is one panel's visible rows (a tabbed list's open tab, or a list panel);
 * the rows a row opens (`row-detail`) are left out, they belong to the row that holds them.
 */
export function collectLayout(doc) {
    const shows = (el) => el.getClientRects().length > 0;
    const is = (el, name) => el.classList.contains(name);
    const box = (el) => {
        const r = el.getBoundingClientRect();
        return {
            left: Math.round(r.left),
            right: Math.round(r.right),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
        };
    };
    const find = (el, test, { into = () => true } = {}, out = []) => {
        for (const child of el.children) {
            if (!shows(child)) continue;
            if (test(child)) out.push(child);
            if (into(child)) find(child, test, { into }, out);
        }
        return out;
    };
    const first = (el, name) => find(el, (c) => is(c, name))[0] ?? null;
    const words = (el) => (el ? String(el.textContent).replace(/\s+/g, " ").trim() : "");
    const named = (row) =>
        words(first(row, "account-row__name") ?? first(row, "account-row__info") ?? row).slice(0, 48);
    const field = (wrapper) => ({
        ...box(wrapper),
        steppers: find(wrapper, (c) => is(c, "number-input-btn")).map(box),
    });
    const lists = find(doc.body, (el) => is(el, "tabbed-list__body"));
    return lists.map((list) => {
        const rows = find(list, (el) => is(el, "account-row"), {
            into: (el) => !is(el, "account-row") && !is(el, "row-detail"),
        });
        return {
            // The shot's name says the page and tab; a page with several lists says which one.
            where: lists.length > 1 ? `list ${lists.indexOf(list) + 1}` : "",
            rows: rows.map((row) => {
                const controls = find(row, (c) => is(c, "account-row__controls"), {
                    into: (c) => !is(c, "row-detail"),
                })[0];
                const own = controls ? [...controls.children].filter(shows) : [];
                const cellsNode = controls ? (first(controls, "value-cells") ?? first(controls, "statue-cells")) : null;
                const opener = first(row, "row-opener");
                const single = own.find((c) => is(c, "number-input-wrapper") || is(c, "capped-value"));
                const toggle = own.find((c) => is(c, "toggle-switch"));
                return {
                    name: named(row),
                    head: is(row, "account-row--head"),
                    // The row's name and its state word: its own text, which nothing may lie over.
                    words: [...row.children]
                        .filter((c) => shows(c) && (is(c, "account-row__info") || is(c, "account-row__badge")))
                        .flatMap((c) => {
                            const lines = find(
                                c,
                                (l) =>
                                    is(l, "account-row__bonus") ||
                                    is(l, "account-row__name") ||
                                    is(l, "account-row__index")
                            );
                            return lines.length ? lines.map(box) : [box(c)];
                        }),
                    // What sits in the row's controls, in order, except the save state (its Undo lies over the words).
                    // A table's cells count one by one (`cells`), not as their row.
                    parts: own.filter((c) => !is(c, "save-state") && !is(c, "sr-only") && c !== cellsNode).map(box),
                    field: single ? field(single) : null,
                    // A Max showing beside a field without a cap: Max fills up to the cap, so it has nothing to fill.
                    uncappedMax:
                        Boolean(single) &&
                        is(single, "number-input-wrapper") &&
                        !is(single, "number-input-wrapper--capped") &&
                        own.some((c) => is(c, "account-row__max")),
                    toggle: toggle ? box(first(toggle, "slider") ?? toggle) : null,
                    opener: opener ? box(opener) : null,
                    cells: cellsNode
                        ? [...cellsNode.children].filter(shows).map((cell) => {
                              const wrapper = is(cell, "number-input-wrapper")
                                  ? cell
                                  : first(cell, "number-input-wrapper");
                              return { ...box(cell), field: wrapper ? field(wrapper) : null };
                          })
                        : [],
                };
            }),
        };
    });
}

const SLACK = 1; // px a box may be off: subpixel rounding

// The most common value, so a break names the rows that are off, not the ones that are right.
const usual = (values) => {
    const counts = new Map();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
};
const inside = (inner, outer) =>
    inner.left >= outer.left - SLACK &&
    inner.right <= outer.right + SLACK &&
    inner.top >= outer.top - SLACK &&
    inner.bottom <= outer.bottom + SLACK;
const overlap = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > SLACK &&
    Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > SLACK;

/** One list's breaks of the rules that hold in any state. */
function listBreaks(list, state) {
    const at = list.where ? `${list.where}: ` : "";
    const breaks = [];
    const rows = list.rows.filter((row) => !row.head);
    // Down a list, the same thing sits in the same place: `pick` gives a row's box for it, `edge` the side that counts.
    const lineUp = (what, pick, edges) => {
        const having = rows.map((row) => ({ row, b: pick(row) })).filter(({ b }) => b);
        if (having.length < 2) return;
        for (const edge of edges) {
            const want = usual(having.map(({ b }) => b[edge]));
            const off = having.filter(({ b }) => Math.abs(b[edge] - want) > SLACK);
            if (off.length)
                breaks.push(
                    `${at}${what} don't line up: "${off[0].row.name}" ${edge === "left" ? "starts" : "ends"} at ${off[0].b[edge]}px, ` +
                        `${having.length - off.length} of ${having.length} rows at ${want}px`
                );
        }
    };
    lineUp("the fields", (row) => row.field, ["left", "right"]);
    lineUp("the switches", (row) => row.toggle, ["left"]);
    lineUp("the opening rows' arrows", (row) => row.opener, ["right"]);
    // A table's columns: rows with the same columns, and the head over them.
    const widest = Math.max(0, ...list.rows.map((row) => row.cells.length));
    const table = list.rows.filter((row) => row.cells.length === widest && widest > 0);
    for (let i = 0; i < widest && table.length > 1; i++) {
        const want = usual(table.map((row) => row.cells[i].left));
        const off = table.find((row) => Math.abs(row.cells[i].left - want) > SLACK);
        if (off)
            breaks.push(
                `${at}column ${i + 1} doesn't line up: in "${off.name}" it starts at ${off.cells[i].left}px, elsewhere at ${want}px`
            );
    }
    for (const row of rows) {
        const where = `${at}"${row.name}"`;
        if (row.uncappedMax) breaks.push(`${where}: Max shows on a line without a cap`);
        const fields = [row.field, ...row.cells.map((cell) => cell.field)].filter(Boolean);
        for (const f of fields)
            if (f.steppers.some((s) => !inside(s, f))) breaks.push(`${where}: its − / + stick out of their field`);
        for (const cell of row.cells)
            if (cell.field && !inside(cell.field, cell)) breaks.push(`${where}: a field sticks out of its column`);
        const parts = [...row.parts, ...row.cells];
        for (let i = 0; i < parts.length; i++)
            for (let j = i + 1; j < parts.length; j++)
                if (overlap(parts[i], parts[j])) breaks.push(`${where}: two of its controls overlap`);
        for (let i = 0; i < row.words.length; i++) {
            if (row.words.slice(i + 1).some((other) => overlap(other, row.words[i])))
                breaks.push(`${where}: its name's lines run into each other`);
            if (parts.some((p) => overlap(p, row.words[i]))) breaks.push(`${where}: a control lies over its name`);
        }
    }
    return [...new Set(breaks)].map((b) => `${b} (${state})`);
}

/**
 * What breaks the layout rules, in plain words. `quiet` is the page at rest; `shown` the same page with every row's
 * controls showing (touch, or the row under the pointer). Nothing may move between the two.
 */
export function layoutBreaks(quiet, shown) {
    const breaks = [
        ...quiet.flatMap((list) => listBreaks(list, "at rest")),
        ...shown.flatMap((list) => listBreaks(list, "controls showing")),
    ];
    quiet.forEach((list, l) => {
        const other = shown[l];
        if (!other || other.rows.length !== list.rows.length) return;
        const at = list.where ? `${list.where}: ` : "";
        list.rows.forEach((row, r) => {
            const then = other.rows[r];
            const moved = [
                ["its field", row.field, then.field],
                ["its switch", row.toggle, then.toggle],
                ...row.cells.map((cell, i) => [`column ${i + 1}`, cell, then.cells[i]]),
            ].find(
                ([, a, b]) =>
                    a && b && ["left", "right", "top", "bottom"].some((side) => Math.abs(a[side] - b[side]) > SLACK)
            );
            if (moved) breaks.push(`${at}"${row.name}": ${moved[0]} moves when the row's controls show`);
        });
    });
    return [...new Set(breaks)];
}
