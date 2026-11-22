/**
 * The top bar's "This page" search, for every page at once. It hides the open page's shared rows (`.account-row`)
 * whose name or bonus doesn't match; a section left with no match hides with its heading, a tabbed list's tabs say how
 * many of their rows match, and a list left with none says so. Pages add nothing for it. A column head row carries
 * `account-row--head` and stays. A page without shared rows is searched only "Everywhere".
 *
 * It works on the page's DOM, so it reaches every page built from the shared rows without their code knowing; it
 * follows the page as its rows load or change, and never touches what the page itself hides.
 *
 * A list's tools act on what the search shows: they keep each entry's row and ask `shownBySearch(row)`, and their tray
 * line says "3 matching combat stamps" instead of "All 44 combat stamps" while `isSearching()`.
 */

import van from "../vendor/van-1.6.0.js";

// The rows the search leaves on the open page, or null while it isn't searching. Set only when it changes, so a tray
// line that redraws (and wakes the search) doesn't set it again.
export const searchHits = van.state(null);

/** Whether the top bar is searching the open page. */
export const isSearching = () => searchHits.val !== null;

/** Whether the search leaves `row` on screen: a tool acts on a row only when it does. */
export const shownBySearch = (row) => searchHits.val === null || searchHits.val.has(row);

const sameRows = (a, b) =>
    a === b || (a !== null && b !== null && a.size === b.size && [...a].every((row) => b.has(row)));

const ROW = ".account-row:not(.account-row--head)";
const MISS = "data-search-miss";
const COUNT = "data-search-count";
const normalize = (text) =>
    text
        .toLowerCase()
        .replace(/[_\s]+/g, " ")
        .trim();

// What a row is found by: its name and bonus (`.account-row__info`, all of it, a name that opens the row included), or,
// for a row that keeps its name elsewhere (a tile), its own words without its buttons. Pieces join with spaces ("#1"
// and "Egg" stay apart); save marks and hidden text never count, so "undo" doesn't find every row.
const rowText = (row) => {
    const info = row.querySelector(".account-row__info");
    const byInfo = Boolean(info?.textContent.trim());
    const skip = byInfo ? "[role=status], [hidden]" : "button, [role=status], [hidden]";
    const walker = document.createTreeWalker(byInfo ? info : row, NodeFilter.SHOW_TEXT);
    const parts = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement.closest(skip)) parts.push(node.data);
    }
    return normalize(parts.join(" "));
};

const noteFor = (query) => {
    const note = document.createElement("p");
    note.className = "page-search-none";
    note.textContent = `Nothing here matches "${query.trim()}".`;
    return note;
};

/** Show only the rows of `pane` that match `query`, and return them; "" shows them all again and returns null. */
const filterPane = (pane, query) => {
    pane.querySelectorAll(`[${MISS}]`).forEach((node) => node.removeAttribute(MISS));
    pane.querySelectorAll(`[${COUNT}]`).forEach((node) => node.removeAttribute(COUNT));
    pane.querySelectorAll(".page-search-none").forEach((node) => node.remove());
    const words = normalize(query);
    if (!words) return null;

    // Every read before any write, so the page is laid out once. A row the page itself hides, or a box around it hides
    // (a filter, an unused entry), is neither searched nor counted; a tab not open still is, so its tab can say how many
    // of its rows match.
    const rendered = (row) => {
        for (let node = row; node && node !== pane; node = node.parentElement) {
            if (!node.classList.contains("account-page-pane") && getComputedStyle(node).display === "none")
                return false;
        }
        return true;
    };
    const shown = [...pane.querySelectorAll(ROW)].filter(rendered);
    const hits = new Set(shown.filter((row) => rowText(row).includes(words)));
    const hitIn = (box) => shown.some((row) => hits.has(row) && box.contains(row));
    const sections = [...pane.querySelectorAll(".account-section")].filter(
        (section) => shown.some((row) => section.contains(row)) && !hitIn(section)
    );
    const tabbed = [...pane.querySelectorAll(".tabbed-list:not(.no-tabs)")].map((list) => ({
        tabs: [...list.querySelectorAll(".tabbed-list__tabs [role=tab]")],
        panes: [...list.querySelectorAll(":scope > .tabbed-list__body > .account-page-pane")],
    }));
    const lists = [
        ...pane.querySelectorAll(".tabbed-list__body > .account-page-pane, .tabbed-list.no-tabs > .tabbed-list__body"),
    ];
    const empty = (lists.length ? lists : [pane]).filter(
        (box) => shown.some((row) => box.contains(row)) && !hitIn(box)
    );

    shown.forEach((row) => hits.has(row) || row.setAttribute(MISS, ""));
    sections.forEach((section) => section.setAttribute(MISS, ""));
    tabbed.forEach(({ tabs, panes }) =>
        tabs.forEach((tab, i) =>
            tab.setAttribute(COUNT, String(shown.filter((row) => hits.has(row) && panes[i]?.contains(row)).length))
        )
    );
    empty.forEach((box) => box.append(noteFor(query)));
    return hits;
};

/**
 * The search of whichever page is open. `follow(pageId)` when another page opens ("" for none), `search(text)` as the
 * player types; `hasRows` says whether the open page has rows to search.
 */
export const createPageSearch = () => {
    const hasRows = van.state(false);
    let pageId = "";
    let query = "";
    let pane = null;
    const apply = () => {
        observer.disconnect();
        pane = pageId ? document.querySelector(`#pages-tab [data-page="${pageId}"]`) : null;
        hasRows.val = Boolean(pane?.querySelector(ROW));
        const hits = pane ? filterPane(pane, query) : null;
        // rawVal: the bar calls this inside its own derives, which must not start following the result.
        if (!sameRows(hits, searchHits.rawVal)) searchHits.val = hits;
        // The pages may not be on screen yet (the menu still loading): wait for the page to appear.
        if (!pane) return void (pageId && observer.observe(document.body, { childList: true, subtree: true }));
        // Rows load after the page opens, change as it saves, and come and go with its own filters: the search keeps
        // up with them. Its own marks are data attributes, so they don't wake it again.
        observer.observe(pane, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class", "hidden"],
        });
    };
    const observer = new MutationObserver(apply);
    return {
        hasRows,
        follow: (id) => {
            if (pane) filterPane(pane, "");
            pageId = id;
            query = "";
            apply();
        },
        search: (text) => {
            if (text === query) return;
            query = text;
            apply();
        },
    };
};
