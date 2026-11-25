import van from "../../../vendor/van-1.6.0.js";
import { joinClasses, lastRun, toNodes } from "./accountShared.js";
import { announce, replay } from "../../inPlace.js";
import { labelOf, withAction } from "../../../services/changeLog.js";
import { searchHits } from "../../../menu/pageSearch.js";
import { tabRequest } from "../../../menu/pageRegistry.js";
import { SetAllTool, setAllLines, trayLabel } from "./BulkActionBar.js";
import { StepPicker } from "./components/StepPicker.js";
import { PickInPlace } from "./components/PickInPlace.js";
import { EmptyState } from "../../EmptyState.js";

const { div, button, p, span } = van.tags;

export const createComingSoonPlaceholder = (label) =>
    div({ class: "world-sub-placeholder" }, p({ class: "world-sub-placeholder__label" }, `${label} — COMING SOON`));

/**
 * A row of tabs. Read out as tabs; Left and Right (Home, End) move to a tab and open it, and Tab reaches only the open
 * one, so the keyboard goes from the tabs straight into what they show.
 * `label` names what the tabs choose between, for assistive technology.
 */
export const renderTabNav = (opts) => buildTabNav(opts).nav;

// The row and its buttons, for a caller that also places things by the buttons (TabbedList's pill).
const buildTabNav = ({
    tabs,
    activeId,
    navClass,
    buttonClass,
    activeClass = "active",
    stubClass = null,
    isStub = () => false,
    renderLabel = (tab) => tab.label,
    getButtonProps = null,
    label = null,
}) => {
    const buttons = tabs.map((tab) =>
        button(
            {
                ...(typeof getButtonProps === "function" ? getButtonProps(tab) : {}),
                type: "button",
                role: "tab",
                "aria-selected": () => String(activeId.val === tab.id),
                tabindex: () => (activeId.val === tab.id ? "0" : "-1"),
                // class and onclick are owned by renderTabNav so active-state wiring stays consistent.
                class: () =>
                    joinClasses(
                        "account-sub-tab-btn",
                        typeof buttonClass === "function" ? buttonClass(tab) : buttonClass,
                        activeId.val === tab.id && activeClass,
                        stubClass && isStub(tab) && stubClass
                    ),
                onclick: () => (activeId.val = tab.id),
            },
            renderLabel(tab)
        )
    );
    const onkeydown = (e) => {
        const at = tabs.findIndex((tab) => tab.id === activeId.val);
        const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const next = (to + tabs.length) % tabs.length;
        activeId.val = tabs[next].id;
        buttons[next].focus();
    };
    const nav = div(
        {
            class: joinClasses("account-sub-nav", navClass),
            role: "tablist",
            ...(label ? { "aria-label": label } : {}),
            onkeydown,
        },
        ...buttons
    );
    return { nav, buttons };
};

// The tab each tabbed list was left on, by its name: a page opened again comes back on that tab.
const pickedTabs = new Map();
let listCount = 0;

/**
 * A long list split into tabs, the way a page shows a system's parts (Stamps: Combat, Skills, Misc). The tabs are the
 * top of one panel and only the panel's rows scroll, so the page's title and the tabs stay where they are. Every tab's
 * rows stay mounted (they keep their saves and Undo); a newly opened tab starts at its top.
 *
 * Switching glides the open tab's pill to the new tab and lets the new list fade in (both off when the player asks
 * for less motion). `tools`, when given, is a tray under the tabs for what acts on the open tab (Set all, Exalt all),
 * set into the panel so it never reads as more tabs; `toolsLabel` is its first line, saying what the tools act on
 * ("All 30 combat stamps"). Both are functions of the open tab's id state; `tools` also gets `ask`, which puts a
 * question in the tray before a risky change runs.
 *
 * @param {object} opts
 * @param {string} opts.name what the tabs choose between ("Stamps"), read out by assistive technology
 * @param {{id: string, label: string, content: *}[]} opts.tabs
 * @param {(activeId: {val: string}, ask: (q: {question: string, confirmLabel: string, from: HTMLElement,
 *   onConfirm: () => *, lowers?: () => Array, again?: () => *}) => void) => *} [opts.tools]
 * @param {(activeId: {val: string}) => string} [opts.toolsLabel]
 * @param {(tabId: string) => boolean} [opts.toolsOn] which tabs have tools (all, when not given): a tab without them
 *   shows no tray, and its open tab runs down into its rows like a list without tools
 * @param {(tabId: string) => void} [opts.onTab] called with the tab the player opens (a pane closes what it had open)
 * @param {() => boolean} [opts.busy] true while the page saves: a question's Yes waits, so it can't start a second save
 * @param {string} [opts.page] the page id whose `tabs` (definePage) these are: a search hit on one opens it
 * @param {boolean} [opts.wrap] more tabs than a row holds (six on a phone): the tabs wrap onto rows instead of
 *   scrolling sideways
 * @param {string} [opts.pick] far more parts than a tab row holds (Hole's 18 caverns): one pick named for them
 *   ("Cavern") in place of the tabs; while the top bar searches, each part says how many of its rows match
 * @param {{val: string}} [opts.activeId] the open tab's id, when the page shows something of it outside the list (the
 *   stats beside its title)
 * @param {object} [opts.setAll] the open tab's Set all on its rows (see withSetAll): SetAllTool's options, `word` at
 *   least; the tray then shows on a tab whose rows need it, and says what it acts on unless `toolsLabel` does
 * @returns {HTMLElement}
 */
/**
 * TabbedList's `tools` when each tab has its own (a page whose tabs were pages: Sailing's Islands, Artifacts): `byTab`
 * maps a tab's id to its tools. Every tab's tools stay in the tray, the open tab's shown, so their buttons keep following
 * the game while another tab is open.
 *
 * @param {Record<string, (ask: Function) => *>} byTab
 */
export const toolsPerTab = (byTab) => (activeId, ask) =>
    Object.entries(byTab).map(([id, tools]) =>
        div({ class: "tabbed-list__tab-tools", hidden: () => activeId.val !== id }, tools(ask))
    );

/**
 * A list's Set all (TabbedList's and ListPanel's `setAll`): the shared tool on the list's own lines, first in its
 * tray, shown only where the list has two lines or more and one without a max. `setAll` is SetAllTool's options
 * without `lines` (`word`, `placeholder`, `bulk`, ...); its `word(n, tabId)` also gets the open tab, and so does a
 * `placeholder(tabId)` given as a function (a table's column on one tab: Farming's "Rank").
 *
 * A table whose columns are equal (Cooking's Speed, Fire, Luck) has a pick of them before the field: `columns` (the
 * steps, `{ value: key, label }`, or `(tabId) => steps` for a tab that has them, null for one that hasn't) and
 * `column`, the picked key's state, which the table's rows get as their `setAll`. The field is then named by the
 * picked column, and Set all acts on that column's lines only.
 */
const hasSetAll = (lines) => lines.length >= 2 && lines.some((line) => line.max === null);
const withSetAll = (setAll, allLinesOf, tools, toolsLabel) => {
    const columnsOf = (tab) => (typeof setAll.columns === "function" ? setAll.columns(tab) : setAll.columns) ?? null;
    const linesOf = (tab) =>
        columnsOf(tab) ? allLinesOf(tab).filter((line) => line.column === setAll.column.val) : allLinesOf(tab);
    return {
        linesOf,
        tools: (activeId, ask) => {
            const word = (n) => setAll.word(n, activeId.val);
            const { placeholder } = setAll;
            const picked = () => columnsOf(activeId.val)?.find((step) => step.value === setAll.column.val);
            const tool = SetAllTool({
                ...setAll,
                ask,
                word,
                // SetAllTool's own default ("Level") when the page names none.
                placeholder: () =>
                    picked()?.label ??
                    (typeof placeholder === "function" ? placeholder(activeId.val) : (placeholder ?? "Level")),
                lines: () => linesOf(activeId.val),
            });
            // The column pick, rebuilt only when the open tab's columns change (a tab without them shows none).
            const pick = div({ class: "tabbed-list__column-pick" }, () => {
                const columns = columnsOf(activeId.val);
                return columns
                    ? StepPicker({
                          name: "Column",
                          steps: columns,
                          picked: () => setAll.column.val,
                          onPick: (value) => (setAll.column.val = value),
                      })
                    : span();
            });
            van.derive(() => {
                tool.hidden = !hasSetAll(linesOf(activeId.val));
                pick.hidden = tool.hidden || !columnsOf(activeId.val);
            });
            return [pick, tool, ...toNodes(tools?.(activeId, ask))];
        },
        // The page's own words where it has them for the open tab; else what Set all acts on.
        toolsLabel: (activeId) =>
            toolsLabel?.(activeId) || trayLabel(linesOf(activeId.val).length, (n) => setAll.word(n, activeId.val)),
    };
};

/**
 * Loads every part of a tabbed page and waits for all of them, so a read that is still running can't land after the
 * next load. Then fails with the first part that failed.
 *
 * @param {Map<string, { load: () => Promise<any> }>} parts
 */
export const loadParts = async (parts) => {
    const results = await Promise.allSettled([...parts.values()].map((part) => part.load()));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
};

export const TabbedList = ({
    name,
    tabs,
    tools = null,
    toolsLabel = null,
    toolsOn = null,
    onTab = null,
    busy = null,
    activeId: sharedId = null,
    wrap = false,
    pick = null,
    page = null,
    setAll = null,
}) => {
    const activeId = sharedId ?? van.state(tabs[0].id);
    activeId.val = pickedTabs.get(name) ?? activeId.val;
    // A search hit on one of the page's tabs (definePage's `tabs`) opens it, now or when the page first shows.
    if (page)
        van.derive(() => {
            const asked = tabRequest.val;
            if (asked?.page === page && tabs.some((tab) => tab.id === asked.tab)) activeId.val = asked.tab;
        });
    const showsTools = () =>
        (Boolean(tools) && (!toolsOn || toolsOn(activeId.val))) ||
        (Boolean(trayTools.linesOf) && hasSetAll(trayTools.linesOf(activeId.val)));
    // Each tab names the pane it opens and each pane its tab, for assistive technology.
    const key = `tabbed-list-${++listCount}`;
    const tabId = (tab) => `${key}-tab-${tabs.indexOf(tab)}`;
    const paneId = (tab) => `${key}-pane-${tabs.indexOf(tab)}`;
    const body = div(
        { class: "tabbed-list__body" },
        ...renderPersistentPagePanes({
            tabs,
            activeId,
            renderContent: (tab) => tab.content,
            // With a pick there are no tabs to name a pane: each pane is a group named for its part.
            getPaneProps: (tab) =>
                pick
                    ? { id: paneId(tab), role: "group", "aria-label": tab.label }
                    : { id: paneId(tab), role: "tabpanel", "aria-labelledby": tabId(tab) },
        })
    );
    const { nav, buttons } = buildTabNav({
        tabs,
        activeId,
        navClass: "tabbed-list__tabs",
        buttonClass: "tabbed-list__tab",
        label: name,
        getButtonProps: (tab) => ({ id: tabId(tab), "aria-controls": paneId(tab) }),
    });
    if (wrap) nav.classList.add("tabbed-list__tabs--wrap");

    // The pick in place of the tabs: "Cavern [The Well]", the parts opening over the page like a character's names.
    let picker = null;
    if (pick) {
        const matching = (tab) => {
            if (!searchHits.val) return "";
            const pane = body.childNodes[tabs.indexOf(tab)];
            return `${[...searchHits.val].filter((row) => pane.contains(row)).length} matching`;
        };
        const labelNow = () => tabs.find((tab) => tab.id === activeId.val)?.label ?? "";
        const choice = PickInPlace({
            name: pick,
            opener: () => {
                const tab = tabs.find((t) => t.id === activeId.val);
                return tab && matching(tab) ? `${tab.label} · ${matching(tab)}` : labelNow();
            },
            label: labelNow,
            options: () => tabs.map((tab) => ({ id: tab.id, label: tab.label, note: matching(tab) })),
            picked: () => activeId.val,
            onPick: (id) => (activeId.val = id),
        });
        // A click on the list's own ground keeps it open; anywhere else (or Tab past the end) closes it.
        choice.panel.tabIndex = -1;
        picker = div(
            {
                class: "character-picker tabbed-list__pick",
                onfocusout: (e) => {
                    if (choice.isOpen() && !picker.contains(e.relatedTarget)) choice.close();
                },
            },
            div({ class: "character-picker__line" }, span({ class: "character-picker__label" }, pick), choice.opener),
            choice.panel
        );
    }

    // The pill under the open tab (the tabs sit above it): placed from the tab's own box, so it fits any label and
    // follows a resize.
    const pill = span({ class: "tabbed-list__pill", "aria-hidden": "true" });
    nav.append(pill);
    const placePill = () => {
        const tab = buttons[tabs.findIndex((t) => t.id === activeId.val)];
        if (!tab || !tab.offsetWidth) return; // not laid out yet (the page still loading); the resize places it
        pill.style.setProperty("--pill-x", `${tab.offsetLeft}px`);
        pill.style.setProperty("--pill-w", `${tab.offsetWidth}px`);
        // Wrapped rows: the pill follows its tab's row. On a row above the last, the rows of tabs under it stand on the
        // ground it opens (--band, their height), so the open tab is joined to its list from any row.
        nav.style.setProperty("--pill-y", `${tab.offsetTop - buttons[0].offsetTop}px`);
        const band = Math.max(...buttons.map((b) => b.offsetTop)) - tab.offsetTop;
        nav.style.setProperty("--band", `${band}px`);
        nav.classList.toggle("has-band", band > 0);
        // A tab at its row's end has no room for a foot on that side.
        nav.classList.toggle("pill-at-start", tab.offsetLeft === buttons[0].offsetLeft);
        nav.classList.toggle("pill-at-end", tab.offsetLeft + tab.offsetWidth > nav.clientWidth - 12);
        if (nav.classList.contains("has-pill")) return;
        // The first place is taken without a glide; from the next frame on, a move glides.
        nav.classList.add("has-pill");
        requestAnimationFrame(() => nav.classList.add("pill-glides"));
    };
    // The row and each tab: a tab whose label changes (a count while searching) moves the pill with it.
    const resized = new ResizeObserver(placePill);
    [nav, ...buttons].forEach((node) => resized.observe(node));

    // A tab's lines, for its Set all: the rows in its pane.
    const linesOf = (id) => setAllLines(body.childNodes[tabs.findIndex((tab) => tab.id === id)]);
    const trayTools = setAll ? withSetAll(setAll, linesOf, tools, toolsLabel) : { tools, toolsLabel };
    const tray = trayTools.tools ? ToolsTray({ ...trayTools, activeId, busy }) : null;
    if (tray) van.derive(() => (tray.node.hidden = !showsTools()));

    let first = true;
    van.derive(() => {
        pickedTabs.set(name, activeId.val);
        requestAnimationFrame(placePill);
        if (first) return (first = false);
        tray?.drop(); // a question is about the tab it was asked on
        onTab?.(activeId.val);
        body.scrollTop = 0;
        replay(body, "switched");
    });

    return div(
        { class: () => joinClasses("tabbed-list", showsTools() && "has-tools") },
        div({ class: "tabbed-list__head" }, picker ?? nav, tray?.node),
        body
    );
};

/**
 * The tray of tools under a list's head (TabbedList, ListPanel), and the question a tool can ask in it before a risky
 * change (lowering, taking away). The question takes the tray's place, in its words and shapes, and waits for an
 * answer: no popup and no timer. Cancel or Escape drop it unanswered; `drop` does too (another tab), and so does a
 * change in the page search, since the question counted the rows the search showed when it was asked.
 */
const ToolsTray = ({ tools, toolsLabel, activeId, busy = null }) => {
    const asking = van.state(null);
    const questionId = `tabbed-list-question-${++listCount}`;
    // `pick`: the answer's run (onConfirm, or the second answer's), or null for Cancel.
    const answer = (pick) => {
        const question = asking.val;
        if (!question) return;
        asking.val = null;
        // A keyboard player goes back to the button that asked, once it shows again (the next frame).
        if (question.byKeyboard) requestAnimationFrame(() => question.from?.focus({ preventScroll: true }));
        if (!pick) return;
        // A row saved while the question was open can change what the answer takes away: then the tool asks again.
        const now = question.lowers?.();
        const changed =
            now && (now.length !== question.lowered.length || now.some((item, i) => item !== question.lowered[i]));
        // The change is the asking button's: its Undo all comes up beside it.
        withAction({ label: labelOf(question.from), anchor: question.from }, () =>
            changed ? question.again() : pick(question)()
        );
    };
    // An answer that only raises (Set all's "Stop at max", "Go past") is quiet; one that lowers or takes away is red.
    const answerClass = (name) => () => `account-btn btn-sm ${asking.val?.quiet ? "btn-quiet" : "btn-danger"} ${name}`;
    const yesButton = button(
        {
            type: "button",
            class: answerClass("tabbed-list__yes"),
            "aria-describedby": questionId,
            disabled: () => Boolean(busy?.()),
            onclick: () => answer((q) => q.onConfirm),
        },
        () => asking.val?.confirmLabel ?? ""
    );
    const otherButton = button(
        {
            type: "button",
            class: answerClass("tabbed-list__other"),
            "aria-describedby": questionId,
            hidden: () => !asking.val?.other,
            disabled: () => Boolean(busy?.()),
            onclick: () => answer((q) => q.other.onConfirm),
        },
        () => asking.val?.other?.label ?? ""
    );
    const noButton = button(
        { type: "button", class: "account-btn btn-quiet btn-sm", onclick: () => answer(false) },
        "Cancel"
    );
    /** Ask before `onConfirm` runs: `question` ("Lower 30 combat stamps to level 47?"), `confirmLabel` ("Lower
     *  them"), and `from`, the button that asked. `lowers`, when given, lists what the answer takes away (ids or
     *  rows); if that list is different when an answer is pressed, `again` runs instead, to ask again. `other`
     *  ({ label, onConfirm }) is a second answer beside the first; `quiet` says neither answer lowers anything. */
    const ask = ({
        question,
        confirmLabel,
        from,
        onConfirm,
        lowers = null,
        again = null,
        other = null,
        quiet = false,
    }) => {
        // Pressed from the keyboard, the asking button holds focus: the answer takes it. A click leaves focus alone,
        // so nothing is ringed that the pointer didn't touch.
        const byKeyboard = document.activeElement === from;
        asking.val = {
            question,
            confirmLabel,
            from,
            onConfirm,
            lowers,
            again,
            other,
            quiet,
            lowered: lowers?.(),
            byKeyboard,
        };
        if (byKeyboard) requestAnimationFrame(() => yesButton.focus({ preventScroll: true }));
    };
    van.derive(() => {
        searchHits.val;
        asking.val = null;
    });
    // Why the tray's tool stopped, said on the tray's line until that tool's next try (Lumi, #241).
    const failed = van.state(null);
    const node = div(
        { class: "tabbed-list__tools" },
        div(
            {
                id: questionId,
                class: () =>
                    joinClasses("tabbed-list__tools-label", asking.val ? "is-question" : failed.val && "is-failure"),
            },
            () => asking.val?.question ?? failed.val?.reason ?? (toolsLabel ? toolsLabel(activeId) : "")
        ),
        div(
            { class: "tabbed-list__tools-row", "data-undo-at-end": "", hidden: () => !!asking.val },
            ...toNodes(tools(activeId, ask))
        ),
        div(
            { class: "tabbed-list__tools-row tabbed-list__answer", hidden: () => !asking.val },
            yesButton,
            otherButton,
            noButton
        )
    );
    van.derive(() => {
        const run = lastRun.val;
        if (!run?.anchor || !node.contains(run.anchor)) return;
        if (run.reason === null) {
            if (failed.rawVal?.anchor === run.anchor) failed.val = null;
            return;
        }
        failed.val = run;
        announce(`${labelOf(run.anchor)}: ${run.reason}`);
    });
    // Escape drops the question wherever focus is (a click on a tool left it outside the tray), but only on the page
    // showing: a page left open in the background keeps its question, and leaves Escape to the one on screen.
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || !asking.val || e.defaultPrevented || !node.getClientRects().length) return;
        e.preventDefault();
        answer(false);
    });
    return { node, drop: () => (asking.val = null) };
};

/**
 * One list in the same panel as TabbedList, for a page without parts (Statues): only the rows scroll, and the tools
 * (a function of `ask`, see TabbedList) sit in the tray above them.
 *
 * @param {object} opts
 * @param {*} [opts.body] the rows (and a column head, when the list is a table); a page that is only its tools (Sushi
 *   Tools) has none, and the panel ends with its tray
 * @param {() => string|null} [opts.empty] what the list says when it has nothing to show ("No nametags found"), or null
 *   while it has: it stands in for the rows and their tools
 * @param {boolean} [opts.short] a list of a few rows (The Button): the panel ends with them, with no room kept below
 * @param {(activeId: *, ask: Function) => *} [opts.tools]
 * @param {() => string} [opts.toolsLabel]
 * @param {string} [opts.className]
 * @param {object} [opts.setAll] Set all on the list's rows, as TabbedList's
 * @returns {HTMLElement}
 */
export const ListPanel = ({
    body = null,
    tools = null,
    toolsLabel = null,
    className = "",
    setAll = null,
    empty = null,
    short = !body,
}) => {
    const isEmpty = () => Boolean(empty?.());
    const rows = div({ class: "tabbed-list__body", hidden: isEmpty }, ...toNodes(body));
    const trayTools = setAll ? withSetAll(setAll, () => setAllLines(rows), tools, toolsLabel) : { tools, toolsLabel };
    const tray = trayTools.tools ? ToolsTray({ ...trayTools, activeId: van.state("") }) : null;
    return div(
        {
            class: () =>
                joinClasses(
                    "tabbed-list no-tabs",
                    trayTools.tools && !isEmpty() && "has-tools",
                    (short || isEmpty()) && "is-short",
                    className
                ),
        },
        tray ? div({ class: "tabbed-list__head", hidden: isEmpty }, tray.node) : null,
        body ? rows : null,
        empty ? () => (isEmpty() ? EmptyState({ title: empty() }) : span({ hidden: true })) : null
    );
};

export const renderLazyPanes = ({
    tabs,
    activeId,
    paneClass,
    activeClass = "active",
    dataAttr = "data-tab",
    renderContent,
}) =>
    tabs.map((tab) => {
        const pane = div({
            class: () => joinClasses(paneClass, activeId.val === tab.id && activeClass),
            [dataAttr]: tab.id,
        });

        let mounted = false;
        van.derive(() => {
            if (activeId.val !== tab.id || mounted) return;
            mounted = true;
            const content = renderContent(tab);
            if (content) van.add(pane, content);
        });

        return pane;
    });

/**
 * Render all pane bodies immediately and keep them mounted.
 * `renderContent` is called eagerly for every tab when the parent mounts.
 */
export const renderPersistentPagePanes = ({
    tabs,
    activeId,
    paneClass = "account-page-pane",
    hiddenClass = "account-page-pane--hidden",
    dataAttr = "data-tab",
    renderContent = null,
    getPaneProps = null,
}) =>
    tabs.map((tab, index) =>
        div(
            {
                ...(typeof getPaneProps === "function" ? getPaneProps(tab) : {}),
                class: () => joinClasses(paneClass, activeId.val !== tab.id && hiddenClass),
                [dataAttr]: tab.id,
            },
            ...toNodes(typeof renderContent === "function" ? renderContent(tab, index) : null)
        )
    );

export const createWorldComingSoonTab =
    ({ worldClass, worldKey }) =>
    () => {
        const tabs = [{ id: "coming-soon", label: "COMING SOON" }];
        const activeSubTab = van.state(tabs[0].id);

        return div(
            { class: joinClasses("world-tab", worldClass) },
            renderTabNav({
                tabs,
                activeId: activeSubTab,
                navClass: "world-sub-nav",
                buttonClass: "account-world-sub-tab-btn",
                stubClass: "account-world-sub-tab-btn--stub",
                isStub: () => true,
            }),
            div(
                { class: "world-sub-content" },
                div(
                    { class: "world-sub-pane active world-sub-pane--empty" },
                    p({ class: "world-empty-label" }, `${worldKey} SYSTEMS COMING SOON`),
                    p(
                        { class: "world-empty-desc" },
                        `Follow the W1Tab pattern to add sub-tabs for each ${worldKey} system.`
                    )
                )
            )
        );
    };
