/**
 * DESIGN.md's Page standards, checked on a page rendered in Node (`loadUi`'s small DOM, on the fake game). Each check
 * returns the breaks it finds in plain words, each starting with the rule's name from DESIGN.md, so a failing test
 * says which line of the checklist a page breaks. The layout rules need a browser; they are in page-shots/layout.mjs.
 */
import { readdirSync } from "node:fs";
import { importRepo } from "../known-bugs/index.mjs";

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
    // The pages already on the shared pieces in Account: the clickers (Bubba not yet) and the automation pages.
    "account/clickers/1-orion.js",
    "account/clickers/2-poppy.js",
    "account/clickers/4-automation.js",
    "account/automation/2-shops.js",
];

/**
 * Breaks on pages already on the standards that need more than a small fix, each with its issue. A page's test fails
 * on any other break, and on one listed here that is gone, so the list only shrinks. New pages never go on it.
 */
export const KNOWN_BREAKS = {
    // #236: Liquid and Pay 2 Win stacked as two pages, each with its own title and Refresh.
    "world-2/alchemy/2-cauldrons.js": [`Title: the page says "Liquid", its sidebar entry "Cauldrons"`],
    // #236: the characters' skins are native dropdowns.
    "world-2/weekly-bosses/weekly-bosses.js": ["Picks: a dropdown; pick in place (PickInPlace)"],
};

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
        if (attr(at, "hidden") || has(at, "account-page-pane--hidden") || has(at, "is-hidden-until-ready"))
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
        const field = own.find((el) => has(el, "number-input-wrapper"));
        const capped = Boolean(field) && has(field, "number-input-wrapper--capped");
        const maxed = own.some(
            (el) =>
                el.nodeName === "button" && !attr(el, "hidden") && (has(el, "account-row__max") || words(el) === "Max")
        );
        if (capped && !maxed) breaks.push(`Max: "${rowName(row)}" has a cap but no Max button`);
        if (field && !capped && maxed) breaks.push(`Max: "${rowName(row)}" has Max but no cap to fill up to`);
    }

    // Automation: its own sidebar entry, never a tab.
    for (const tab of [...tabsOf(node).map(words), ...(page.tabs ?? []).map((tab) => tab.label)])
        if (/^automation\b/i.test(tab))
            breaks.push(`Automation: "${tab}" is a tab; make it its own page with tab "Automation"`);
    if (byClass(node, "automation-rows").length && page.tab !== "Automation" && page.system !== "Automation")
        breaks.push(
            `Automation: the automation list sits on "${title}"; it goes on its own page with tab "Automation"`
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

    // Search: a page's declared tabs are its real tabs; a limited gem shop buy is found by the shop's words.
    const tabLabels = tabsOf(node).map(words);
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

    // Fields: a value is typed into the shared field (NumberInput, which EditableNumberRow, ClampedLevelRow and the
    // tables use), so its cap, Max, − / + and saving come with it. A field drawn by hand drops out of all of them.
    const within = (el, name) => {
        for (let at = el.parentNode; at && at !== node; at = at.parentNode) if (has(at, name)) return true;
        return false;
    };
    for (const field of elements(node).filter(
        (el) => el.nodeName === "input" && !["checkbox", "radio", "hidden"].includes(attr(el, "type"))
    ))
        if (!within(field, "number-input-wrapper") && !within(field, "pick-in-place")) {
            const row = rows.find((r) => elements(r).includes(field));
            breaks.push(
                `Fields: ${row ? `"${rowName(row)}" has` : "the page has"} a field drawn by hand; use NumberInput`
            );
        }

    // Picks: a pick out of a list opens in place (PickInPlace), never a dropdown.
    if (elements(node).some((el) => el.nodeName === "select"))
        breaks.push(`Picks: a dropdown; pick in place (PickInPlace)`);

    // Feedback: nothing promised for later.
    if (/coming soon/i.test(text(node))) breaks.push(`Feedback: the page says "Coming soon"`);

    return [...new Set(breaks)];
}

/**
 * Bulk tools, pressed: on every tab, a tray tool that lowers or takes away (a danger button) asks in the tray before
 * it writes anything, and Max all runs on one press. `writes()` counts the game writes so far. The page is left as the
 * tools left it, so run this last.
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
        for (const tray of byClass(node, "tabbed-list__tools").filter(shown)) {
            const asking = () => has(byClass(tray, "tabbed-list__tools-label")[0], "is-question");
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
                    const cancel = byClass(tray, "tabbed-list__answer")
                        .flatMap((row) => elements(row))
                        .find((el) => words(el) === "Cancel");
                    if (cancel) click(cancel);
                    for (let i = 0; i < 5; i++) await settle();
                    if (writes() !== before) breaks.push(`Bulk tools: ${where}"${label}" wrote before the answer`);
                } else if (/^Max all\b/.test(label)) {
                    click(tool);
                    for (let i = 0; i < 20; i++) await settle();
                    if (asking()) {
                        breaks.push(`Bulk tools: ${where}"${label}" asks; Max all runs on one press`);
                        click(
                            byClass(tray, "tabbed-list__answer")
                                .flatMap((row) => elements(row))
                                .find((el) => words(el) === "Cancel")
                        );
                    }
                }
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
