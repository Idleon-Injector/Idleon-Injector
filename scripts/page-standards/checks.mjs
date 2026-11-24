/**
 * DESIGN.md's Page standards, checked on a page rendered in Node (`loadUi`'s small DOM, on the fake game). Each check
 * returns the breaks it finds in plain words, each starting with the rule's name from DESIGN.md, so a failing test
 * says which line of the checklist a page breaks. The layout rules need a browser; they are in page-shots/layout.mjs.
 */
import { readdirSync } from "node:fs";
import { importRepo } from "../known-bugs/index.mjs";

const { resolveNumberInput } = await importRepo("src/ui/components/views/account/accountShared.js");

/**
 * The page folders on the shared look, held to every standard. A world joins when its pages move to the shared
 * pieces (Classes adds its own in its PR); the rest still have pages from before.
 */
export const ON_STANDARDS = [
    "world-1/",
    "world-2/",
    "world-3/",
    "world-4/",
    "world-5/",
    "world-6/",
    "classes/",
    // The pages already on the shared pieces in Account: the clickers (Bubba not yet).
    "account/clickers/1-orion.js",
    "account/clickers/2-poppy.js",
    // The automation pages that were on them before they moved into the Automation section (#249), and Grimoire's,
    // on them with the Classes pages (#239). Overview and Sushi Station aren't yet.
    "automation/alchemy/",
    "automation/construction/",
    "automation/cooking/",
    "automation/sneaking/",
    "automation/summoning/",
    "automation/clickers/",
    "automation/shops/",
    "automation/grimoire/",
];

/**
 * Breaks on pages already on the standards that need more than a small fix, each with its issue. A page's test fails
 * on any other break, and on one listed here that is gone, so the list only shrinks. New pages never go on it.
 */
export const KNOWN_BREAKS = {};

/** Pages of unrelated single numbers, which aren't a list (DESIGN.md's Set all), so they need no Set all. */
export const NOT_LISTS = new Set([
    // Emperor tries, Showdowns won and Entries: three different things, no one number fits them all.
    "world-6/emperor/emperor.js",
]);

const root = new URL("../../", import.meta.url);

/** Every page module under src/ui/pages, as repo paths, in the server's order. */
export const pageFiles = () => {
    const files = [];
    const walk = (dir) => {
        for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true }).sort((a, b) =>
            a.name < b.name ? -1 : 1
        )) {
            if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
            else if (entry.name.endsWith(".js")) files.push(`${dir}${entry.name}`);
        }
    };
    walk("src/ui/pages/");
    return files;
};
export const onStandards = (file) => ON_STANDARDS.some((place) => file.startsWith(`src/ui/pages/${place}`));

// The small DOM's reading helpers. VanJS binds an attribute that changes as a function; these read it as it is now.
const attr = (node, name) =>
    typeof node.attributes?.[name] === "function" ? node.attributes[name]() : node.attributes?.[name];
export const text = (node) =>
    typeof node === "string" ? node : node?.nodeType === 3 ? node.data : (node?.childNodes ?? []).map(text).join("");
export const elements = (node, out = []) => {
    if (node?.nodeType !== 1) return out;
    out.push(node);
    for (const child of node.childNodes) elements(child, out);
    return out;
};
const classes = (node) => String(attr(node, "class") ?? "").split(/\s+/);
const has = (node, name) => classes(node).includes(name);
export const byClass = (node, name) => elements(node).filter((el) => has(el, name));
const words = (node) => text(node).replace(/\s+/g, " ").trim();
/** Shown now: no ancestor hidden, and not in a closed tab's pane or a page still loading. */
export const shown = (node) => {
    for (let at = node; at; at = at.parentNode)
        if (
            attr(at, "hidden") ||
            at.hidden === true ||
            has(at, "account-page-pane--hidden") ||
            has(at, "is-hidden-until-ready")
        )
            return false;
    return true;
};
export const click = (node) =>
    (node.listeners?.click ?? node.onclick)?.({
        preventDefault() {},
        stopPropagation() {},
        currentTarget: node,
        target: node,
        detail: 1,
    });
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** Render a page and wait until it has read the game (its DOM stops changing). */
export async function renderPage(page) {
    const node = page.component();
    let last = -1;
    for (let i = 0, still = 0; i < 400 && still < 15; i++) {
        await settle();
        const count = elements(node).length;
        still = count === last ? still + 1 : 0;
        last = count;
    }
    return node;
}

// A page's rows: the outer ones, without a list's column head and without the rows a row opens.
const rowsIn = (node) =>
    elements(node).filter(
        (el) =>
            has(el, "account-row") &&
            !has(el, "account-row--head") &&
            !(function inDetail(at) {
                for (let up = at.parentNode; up && up !== node; up = up.parentNode)
                    if (has(up, "row-detail") || has(up, "account-row")) return true;
                return false;
            })(el)
    );
// A line: a row whose controls hold one value field (a table's line, several values under column heads, isn't one).
const lineField = (row) =>
    row.childNodes
        .find((el) => el.nodeType === 1 && has(el, "account-row__controls"))
        ?.childNodes.find((el) => el.nodeType === 1 && has(el, "number-input-wrapper"));
const capped = (field) => has(field, "number-input-wrapper--capped");
const rowName = (row) =>
    words(byClass(row, "account-row__name")[0] ?? byClass(row, "account-row__info")[0] ?? row).slice(0, 60);
const tabsOf = (node) => elements(node).filter((el) => attr(el, "role") === "tab");
const panelsOf = (node) => elements(node).filter((el) => attr(el, "role") === "tabpanel");

// Normal case: a label written all in capitals ("AUTOMATION", "THICC_SKIN"). The game's short capitals stay, in a name
// or on their own (EXP, STR, RIP Tide, Talent III, EXP GMO).
const shouts = (label) => /[A-Z]{2,}_[A-Z]/.test(label) || (/\b[A-Z]{4,}\b/.test(label) && !/[a-z]/.test(label));

/**
 * The breaks a page shows, by the rules a rendered page can show. `page` is its definePage declaration; `title` its
 * sidebar name (menuModel's pageTitle).
 */
export function pageBreaks(node, page, title) {
    const breaks = [];
    const rows = rowsIn(node);

    // Max: every line whose value has a cap ("2 / 15") has a Max button, and only those: Max fills up to the cap. A line
    // is one value in the row's controls; a table's line (several values under column heads) isn't one. A line without
    // a cap may keep Max's room (the empty slot, or the shared row's Max hidden).
    for (const row of rows) {
        const controls = row.childNodes.find((el) => el.nodeType === 1 && has(el, "account-row__controls"));
        const own = controls?.childNodes.filter((el) => el.nodeType === 1) ?? [];
        const field = lineField(row);
        const hasCap = Boolean(field) && capped(field);
        const maxed = own.some(
            (el) =>
                el.nodeName === "button" && !attr(el, "hidden") && (has(el, "account-row__max") || words(el) === "Max")
        );
        if (hasCap && !maxed) breaks.push(`Max: "${rowName(row)}" has a cap but no Max button`);
        if (field && !hasCap && maxed) breaks.push(`Max: "${rowName(row)}" has Max but no cap to fill up to`);
    }

    // Automation: its own page in the Automation section, never a tab.
    for (const tab of [...tabsOf(node).map(words), ...(page.tabs ?? []).map((tab) => tab.label)])
        if (/^automation\b/i.test(tab))
            breaks.push(`Automation: "${tab}" is a tab; make it its own page in the Automation section`);
    if (byClass(node, "automation-rows").length && page.world !== "automation")
        breaks.push(
            `Automation: the automation list sits on "${title}"; it goes on its own page in the Automation section`
        );

    // Tabs: a tab never holds tabs.
    for (const panel of panelsOf(node))
        if (elements(panel).some((el) => el !== panel && attr(el, "role") === "tablist"))
            breaks.push(
                `Tabs: the "${words(tabsOf(node).find((t) => attr(t, "aria-controls") === attr(panel, "id")) ?? panel).slice(0, 30)}" tab holds tabs; make its parts headed groups`
            );

    // Row switches: a setting that switches per line sits on that line, not on a tab that lists some of another tab's
    // lines again with a switch each (Omni Jade on 17 of Ninja Knowledge's 31 upgrades). Two tabs of the same things
    // (the Slab and its Greenstacks) are two game screens; lines that only share a name have no switch of their own.
    const switched = (row) => elements(row).some((el) => attr(el, "role") === "switch" || has(el, "toggle-switch"));
    const panels = panelsOf(node).map((panel) => ({
        tab: attr(panel, "aria-labelledby"),
        rows: new Map(rowsIn(panel).map((row) => [rowName(row), row])),
    }));
    for (const panel of panels) {
        if (panel.rows.size < 3) continue;
        const again = panels.find(
            (other) =>
                other.rows.size > panel.rows.size &&
                [...panel.rows].every(
                    ([name, row]) => other.rows.has(name) && switched(row) && !switched(other.rows.get(name))
                )
        );
        if (again) {
            const label = (id) => words(tabsOf(node).find((t) => attr(t, "id") === id) ?? { childNodes: [] });
            breaks.push(
                `Row switches: the "${label(panel.tab)}" tab lists the "${label(again.tab)}" tab's lines again; put its switch on those lines`
            );
        }
    }

    // Names: the game's names in normal case; titles, tabs, headings and buttons too.
    for (const row of rows) {
        const name = words(byClass(row, "account-row__name")[0] ?? { childNodes: [] });
        if (shouts(name)) breaks.push(`Names: "${name}" is in capitals; show it in normal case`);
    }
    const labels = [
        ...byClass(node, "account-tab-header__title"),
        ...tabsOf(node),
        ...byClass(node, "account-section__title"),
        ...elements(node).filter((el) => el.nodeName === "button"),
    ].map(words);
    for (const label of new Set(labels))
        if (shouts(label)) breaks.push(`Names: "${label}" is in capitals; write it in normal case`);

    // Title: the page's title is its sidebar name.
    const heading = byClass(node, "account-tab-header__title")[0];
    if (heading && words(heading) !== title)
        breaks.push(`Title: the page says "${words(heading)}", its sidebar entry "${title}"`);

    // Search: a page's declared tabs are its real tabs (or its pick's parts: Caverns); a limited gem shop buy is found by
    // the shop's words.
    const tabLabels = [
        ...tabsOf(node),
        ...elements(node).filter(
            (el) => attr(el, "role") === "option" && classes(el).includes("pick-in-place__option")
        ),
    ].map(words);
    for (const tab of page.tabs ?? [])
        if (!tabLabels.some((label) => label.startsWith(tab.label)))
            breaks.push(`Search: definePage names a tab "${tab.label}" the page doesn't have`);
    if (byClass(node, "account-section__title").some((el) => words(el) === "Gem shop")) {
        const known = [...page.keywords, ...(page.tabs ?? []).flatMap((tab) => tab.keywords ?? [])].map((w) =>
            w.toLowerCase()
        );
        const missing = ["gem shop", "limited", "fomo"].filter((word) => !known.includes(word));
        if (missing.length)
            breaks.push(`Search: the Gem shop group isn't found by ${missing.map((w) => `"${w}"`).join(", ")}`);
    }

    // Saving: on Enter or on leaving the field, said by the row's save state; no Set or Save buttons.
    for (const row of rows) {
        const field = elements(row).some(
            (el) => el.nodeName === "input" && attr(el, "type") !== "checkbox" && attr(el, "role") !== "switch"
        );
        if (field && !byClass(row, "save-state").length)
            breaks.push(`Saving: "${rowName(row)}" has a field but no save state`);
    }
    for (const button of elements(node).filter((el) => el.nodeName === "button"))
        if (/^(set|save|apply|ok|submit)$/i.test(words(button)))
            breaks.push(`Saving: a "${words(button)}" button; values save on Enter or on leaving the field`);

    // Buttons: no hover popup explains a row's button.
    for (const row of rows)
        for (const button of elements(row).filter(
            (el) => el.nodeName === "button" && el.handlers?.mouseenter?.length && !has(el, "save-state__undo")
        ))
            breaks.push(`Buttons: "${words(button)}" on "${rowName(row)}" explains itself in a hover popup`);

    breaks.push(...fieldAndPickBreaks(node, rows));

    // Feedback: nothing promised for later.
    if (/coming soon/i.test(text(node))) breaks.push(`Feedback: the page says "Coming soon"`);

    return [...new Set(breaks)];
}

/**
 * Fields and Picks, in `node` (a page, or what an opener showed). `where` says what holds a field that isn't in a row.
 * Fields: a value is typed into the shared field (NumberInput, which EditableNumberRow, ClampedLevelRow and the tables
 * use), so its cap, Max, − / + and saving come with it; a field drawn by hand drops out of all of them. Picks: a pick
 * out of a list opens in place (PickInPlace), never a dropdown.
 */
function fieldAndPickBreaks(node, rows, where = "the page has") {
    const breaks = [];
    const within = (el, name) => {
        for (let at = el.parentNode; at && at !== node; at = at.parentNode) if (has(at, name)) return true;
        return false;
    };
    for (const field of elements(node).filter(
        (el) => el.nodeName === "input" && !["checkbox", "radio", "hidden"].includes(attr(el, "type"))
    ))
        if (!within(field, "number-input-wrapper") && !within(field, "pick-in-place")) {
            const row = rows.find((r) => elements(r).includes(field));
            breaks.push(`Fields: ${row ? `"${rowName(row)}" has` : where} a field drawn by hand; use NumberInput`);
        }
    if (elements(node).some((el) => el.nodeName === "select"))
        breaks.push(`Picks: ${where === "the page has" ? "a" : `${where} a`} dropdown; pick in place (PickInPlace)`);
    return breaks;
}

/**
 * What opens, opened: on every tab, each opener (a button with `aria-expanded`: a row that holds a list, a pick in
 * place, a cog on the board) is pressed and what it shows is held to Fields and Picks, then it is closed again. An
 * opener that only shows once another is open (a pick inside an opened row) is pressed while that one stays open.
 * `hosts` are the nodes the page put outside itself (the cog board's editor), checked with it.
 */
export async function openedBreaks(node, hosts = []) {
    const breaks = [];
    const tabs = tabsOf(node);
    const expanded = (el) => attr(el, "aria-expanded") === "true";
    const openersIn = (roots) =>
        roots.flatMap((root) =>
            elements(root).filter(
                (el) =>
                    el.nodeName === "button" &&
                    attr(el, "aria-expanded") !== undefined &&
                    !attr(el, "disabled") &&
                    shown(el)
            )
        );
    // `seen`: the openers already showing before this one opened. ponytail: three levels deep, as deep as pages go.
    const press = async (opener, seen, depth) => {
        if (!expanded(opener)) click(opener);
        for (let i = 0; i < 3; i++) await settle();
        const name = (words(opener) || String(attr(opener, "title") ?? attr(opener, "aria-label") ?? "")).slice(0, 40);
        const where = `what "${name}" opens has`;
        // The first opener that shows a break names it; the rest of the same kind say nothing new.
        for (const root of [node, ...hosts])
            for (const found of fieldAndPickBreaks(root, rowsIn(root), where))
                if (!breaks.some((b) => b.split(":")[0] === found.split(":")[0])) breaks.push(found);
        const inner = depth < 3 ? openersIn([node, ...hosts]).filter((el) => !seen.has(el) && el !== opener) : [];
        for (const child of inner) await press(child, new Set([...seen, opener, ...inner]), depth + 1);
        if (expanded(opener)) click(opener);
        await settle();
    };
    for (const tab of tabs.length ? tabs : [null]) {
        if (tab) {
            click(tab);
            await settle();
        }
        const openers = openersIn([node]);
        for (const opener of openers) await press(opener, new Set(openers), 1);
    }
    return breaks;
}

/**
 * Bulk tools, pressed: on every tab, a tray tool that lowers or takes away (a danger button) asks in the tray before
 * it writes anything, and Max all runs on one press. Set all: a list with lines without a max has it; it refuses an
 * empty field, asks before a number goes past a line's max ("Go past") or lowers a line, and otherwise runs on one
 * press. All to: lines that each have their own step picker have a tray tool with the same steps. `writes()` counts
 * the game writes so far. The page is left as the tools left it, so run this last.
 */
export async function bulkBreaks(node, writes) {
    const breaks = [];
    const tabs = tabsOf(node);
    for (const tab of tabs.length ? tabs : [null]) {
        if (tab) {
            click(tab);
            await settle();
        }
        const where = tab ? `${words(tab)}: ` : "";
        // The lists showing: the open tab's pane, a ListPanel's rows, or the page.
        const panes = panelsOf(node).filter(shown);
        const bodies = byClass(node, "tabbed-list__body").filter(shown);
        const lists = panes.length ? panes : bodies.length ? bodies : [node];
        const linesOf = (list) =>
            rowsIn(list)
                .filter(shown)
                .map((row) => ({ row, field: lineField(row) }))
                .filter(({ field }) => field);
        const setAllsOf = (list) => {
            let scope = list;
            while (scope.parentNode && !has(scope, "tabbed-list")) scope = scope.parentNode;
            return byClass(has(scope, "tabbed-list") ? scope : node, "account-setall-row").filter(shown);
        };
        // A table's column (its fields under one column name, ValueTableRow's cells) is a list of lines too.
        const columnsOf = (list) => {
            const columns = new Map();
            // An automation row's fields are its settings, not the game's values: its tray is Enable all | Disable all.
            for (const row of rowsIn(list).filter(
                (row) =>
                    shown(row) &&
                    !has(row, "automation-row") &&
                    !has(row, "automation-pick") &&
                    !has(row, "automation-setting")
            ))
                for (const field of byClass(row, "number-input-wrapper")) {
                    const name = field.parentNode.childNodes.find((el) => has(el, "value-cell__label"));
                    if (name) columns.set(words(name), [...(columns.get(words(name)) ?? []), { field }]);
                }
            return [...columns.values()];
        };
        for (const list of lists) {
            const open = (lines) => lines.length >= 2 && lines.some(({ field }) => !capped(field));
            if ([linesOf(list), ...columnsOf(list)].some(open) && !setAllsOf(list).length)
                breaks.push(`Set all: ${where}lines without a max but no Set all`);

            // All to: lines that each have their own pick (a step picker: Off | Normal | Pets+) have one tool in the
            // tray with the same steps, so a pick for every line is one press.
            const picks = new Map();
            // A line's own picks, not those of the rows it opens (a captain's bonuses).
            const ownPicks = (row) =>
                byClass(row, "step-picker").filter((picker) => {
                    for (let up = picker.parentNode; up && up !== row; up = up.parentNode)
                        if (has(up, "row-detail")) return false;
                    return true;
                });
            for (const row of rowsIn(list).filter(shown))
                for (const picker of ownPicks(row)) {
                    const steps = elements(picker)
                        .filter((el) => attr(el, "role") === "radio")
                        .map(words)
                        .join(" | ");
                    picks.set(steps, (picks.get(steps) ?? 0) + 1);
                }
            let scope = list;
            while (scope.parentNode && !has(scope, "tabbed-list")) scope = scope.parentNode;
            const tools = byClass(has(scope, "tabbed-list") ? scope : node, "tabbed-list__tool-group")
                .filter(shown)
                .map((group) =>
                    elements(group)
                        .filter((el) => el.nodeName === "button")
                        .map(words)
                );
            for (const [steps, count] of picks)
                if (count >= 2 && !tools.some((tool) => steps.split(" | ").every((step) => tool.includes(step))))
                    breaks.push(`All to: ${where}each line has its own pick (${steps}) but the tray has no All to`);
        }

        for (const tray of byClass(node, "tabbed-list__tools").filter(shown)) {
            const asking = () => has(byClass(tray, "tabbed-list__tools-label")[0], "is-question");
            const answers = () =>
                byClass(tray, "tabbed-list__answer").flatMap((row) =>
                    elements(row).filter((el) => el.nodeName === "button" && shown(el))
                );
            const cancel = () => click(answers().find((el) => words(el) === "Cancel"));
            const tools = byClass(tray, "tabbed-list__tools-row")
                .filter((row) => !has(row, "tabbed-list__answer"))
                .flatMap((row) =>
                    elements(row).filter((el) => el.nodeName === "button" && shown(el) && !attr(el, "disabled"))
                );
            for (const tool of tools) {
                const label = words(tool);
                if (has(tool, "btn-danger")) {
                    // The press isn't awaited: writes are counted from it, while the question stays open and through
                    // Cancel, so a handler that writes after an await is caught too.
                    const before = writes();
                    click(tool);
                    for (let i = 0; i < 20 && !asking(); i++) await settle();
                    if (!asking()) {
                        breaks.push(`Bulk tools: ${where}"${label}" takes away without asking in the tray`);
                        continue;
                    }
                    for (let i = 0; i < 10; i++) await settle();
                    if (answers().some((el) => words(el) === "Cancel")) cancel();
                    for (let i = 0; i < 5; i++) await settle();
                    if (writes() !== before) breaks.push(`Bulk tools: ${where}"${label}" wrote before the answer`);
                } else if (/^Max all\b/.test(label)) {
                    click(tool);
                    for (let i = 0; i < 20; i++) await settle();
                    if (asking()) {
                        breaks.push(`Bulk tools: ${where}"${label}" asks; Max all runs on one press`);
                        cancel();
                    }
                }
            }

            // Set all, on the lines of the list its tray belongs to, by the values and maxes they show. In a table
            // (several values under column names) its lines are the column its field names ("Level"), capped or not.
            const list = lists.find((l) => setAllsOf(l).some((tool) => tray.contains(tool)));
            const number = (raw) => resolveNumberInput(String(raw ?? ""), { formatted: true, float: true }) ?? 0;
            const inputOf = (el) => elements(el).find((child) => child.nodeName === "input");
            const columnOf = (row, column) =>
                byClass(row, "number-input-wrapper").find((field) =>
                    field.parentNode.childNodes.some(
                        (el) => el !== field && String(attr(el, "class")).includes("__label") && words(el) === column
                    )
                );
            // A table whose columns are equal has a pick of them beside the field: Set all is held to the rules in
            // each column.
            const steps = byClass(tray, "tabbed-list__column-pick")
                .filter(shown)
                .flatMap((pick) => elements(pick).filter((el) => attr(el, "role") === "radio"));
            const runs = byClass(tray, "account-setall-row")
                .filter(shown)
                .flatMap((tool) => (steps.length ? steps : [null]).map((step) => [tool, step]));
            for (const [tool, step] of runs) {
                if (step) {
                    click(step);
                    await settle();
                }
                const at = step ? `${where}${words(step)}: ` : where;
                const input = inputOf(tool);
                const press = elements(tool).find((el) => el.nodeName === "button" && words(el) === "Set all");
                if (!input || !press || attr(press, "disabled")) continue;
                const column = attr(input, "placeholder");
                if (step && column !== words(step))
                    breaks.push(`Set all: ${at}the field doesn't name the picked column`);
                // The table's column the field names, when the list has one ("Amount" beside a lone Draconic line);
                // else the list's own lines.
                const inColumn = (list ? rowsIn(list).filter(shown) : [])
                    .map((row) => ({ row, field: columnOf(row, column) }))
                    .filter(({ field }) => field);
                const lines = inColumn.length ? inColumn : list ? linesOf(list) : [];
                const shows = ({ field }) => inputOf(field).value ?? attr(inputOf(field), "value");
                const values = lines.map((line) => number(shows(line)));
                // In a table, the values in the other columns: Set all leaves them as they are.
                const others = () =>
                    inColumn.flatMap(({ row, field }) =>
                        byClass(row, "number-input-wrapper")
                            .filter((other) => other !== field)
                            .map((other) => shows({ field: other }))
                    );
                const othersBefore = others();
                const caps = lines
                    .filter(({ field }) => capped(field))
                    .map(({ field }) => number(words(byClass(field, "number-input__cap")[0].childNodes[0]).slice(1)));
                // Type `value` and press Set all; the press isn't awaited, so a write after an await is counted too.
                const tryWith = async (value) => {
                    const before = writes();
                    input.value = String(value);
                    input.listeners.input?.({ target: input });
                    click(press);
                    for (let i = 0; i < 30; i++) await settle();
                    const outcome = { asked: asking(), wrote: writes() !== before, answers: answers().map(words) };
                    if (outcome.asked) cancel();
                    for (let i = 0; i < 5; i++) await settle();
                    outcome.wrote ||= writes() !== before;
                    return outcome;
                };
                const empty = await tryWith("");
                if (empty.wrote || empty.asked) breaks.push(`Set all: ${at}an empty field isn't refused`);
                if (!lines.length) continue;
                if (values.some((value) => value > 0)) {
                    const lower = await tryWith(0);
                    if (!lower.asked) breaks.push(`Set all: ${at}lowers without asking in the tray`);
                    else if (lower.wrote) breaks.push(`Set all: ${at}wrote before the answer to lowering`);
                }
                // Above every value and max (a formatted value reads rounded), so nothing comes down; in two figures, so
                // a big number shown short ("1.4M") reads back as typed.
                const above = Math.ceil(Math.max(0, ...values, ...caps) * 1.1) + 1;
                const figure = 10 ** Math.max(0, Math.floor(Math.log10(above)) - 1);
                const target = Math.ceil(above / figure) * figure;
                // How many lines the tray's line says it acts on ("All 2 trash upgrades"), else every line.
                const named = /^All (\d[\d,]*) /.exec(words(byClass(tray, "tabbed-list__tools-label")[0]));
                const acts = named ? Number(named[1].replace(/,/g, "")) : lines.length;
                const past = await tryWith(target);
                if (!caps.length) {
                    if (past.asked) breaks.push(`Set all: ${at}asks when nothing goes past a max or down`);
                    // A raise that asks nothing writes the number, and every line it acts on shows it after.
                    else if (!past.wrote || lines.filter((line) => number(shows(line)) === target).length !== acts)
                        breaks.push(`Set all: ${at}a raise that asks nothing doesn't set every line to it`);
                } else if (!past.asked || !["Stop at max", "Go past"].every((a) => past.answers.includes(a)))
                    breaks.push(`Set all: ${at}goes past a max without asking "Stop at max" or "Go past"`);
                else if (past.wrote) breaks.push(`Set all: ${at}wrote before the answer to going past a max`);
                if (others().some((value, i) => value !== othersBefore[i]))
                    breaks.push(`Set all: ${at}changes another column too`);
            }
        }
    }
    return breaks;
}

/**
 * The style rule a page's code can break without rendering anything: no outline or ring left after a click. A ring
 * belongs to :focus-visible (the keyboard) only; a `:focus` or `:focus-within` rule may not draw one.
 */
export function clickOutlineBreaks(css, file) {
    const breaks = [];
    const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selectors, body] of plain.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        // An outline, or a ring in the accent (a field may take the neutral strong border while it's typed in).
        const ringed =
            /(^|[;\s])outline\s*:(?!\s*(none|0)\s*(;|$))/.test(body) || /box-shadow\s*:[^;]*accent/.test(body);
        if (!ringed) continue;
        for (const selector of selectors.split(","))
            // [data-keyboard] is the keyboard's own: App.js sets it on Tab and clears it on a click.
            if (/:focus(?!-visible)/.test(selector) && !/:focus:not\(:focus-visible\)|\[data-keyboard\]/.test(selector))
                breaks.push(`Clicks: ${file} rings "${selector.trim()}" after a click; use :focus-visible`);
    }
    return breaks;
}

/** Every stylesheet the WebUI loads, as [repo path, text]. */
export const styleSheets = async () => {
    const { readFile } = await import("node:fs/promises");
    const files = [];
    const walk = (dir) => {
        for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
            if (entry.isDirectory()) walk(`${dir}${entry.name}/`);
            else if (entry.name.endsWith(".css") && !dir.includes("/vendor/")) files.push(`${dir}${entry.name}`);
        }
    };
    walk("src/ui/");
    return Promise.all(files.map(async (file) => [file, await readFile(new URL(file, root), "utf8")]));
};

export const loadPage = async (file) => (await importRepo(file)).default;
