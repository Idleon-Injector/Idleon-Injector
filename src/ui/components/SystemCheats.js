/**
 * A system's own cheats, beside its page (#23). Lumi: "we have space on the right, cant we put a cheats menu in our
 * current design on the side?" On a wide window the list stands in the free room right of the page; where the page has
 * no room beside it (the overlay, a phone, a table page on a smaller screen) it folds into one line under the title
 * that opens the same list in place. A tabbed system shows the open tab's cheats and the ones for every tab
 * (menu/pageCheats.js).
 *
 * Built from the page's own pieces: the quiet group (`ListPanel` + the section header, like Stamps' "Gem shop"), a row
 * per cheat with its short label first and its command small under it (`RowTitles`), the one on/off switch
 * (`StateSwitch`), and a cheat's settings in the row it opens (`row-opener`, `row-detail`) as the shared value rows
 * (`EditableNumberRow`). A switch runs the cheat the way the Cheats area does (`store.executeCheat`), so it is on until
 * the injector restarts; a cheat turned on here arrives in the sidebar's My cheats, whose Autostart keeps it on at
 * every start (concept, replacing the pin). A command (a reset, an unlock) gets a Run button instead, with a field
 * when it takes a value.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { fetchConfig, saveConfigPart } from "../services/api.js";
import { parseFunction, generateFunctionString, FUNCTION_TYPES } from "../utils/functionParser.js";
import { configDescriptions } from "../config/configDescriptions.js";
import { cheatsOfPage } from "../menu/pageCheats.js";
import { whenShown } from "../menu/menuModel.js";
import { revealFound } from "../utils/index.js";
import { Icons } from "../assets/icons.js";
import { AccountRow, RowTitles } from "./views/account/components/AccountRow.js";
import { StateSwitch } from "./views/account/components/StateSwitch.js";
import { EditableNumberRow } from "./views/account/EditableNumberRow.js";
import { Said, plainReason, replay, useSaid } from "./inPlace.js";

const { aside, button, datalist, div, input, option, span } = van.tags;

const { MULTIPLY, DIVIDE, FIXED, PASSTHROUGH } = FUNCTION_TYPES;
const SIGN = { [MULTIPLY]: "×", [DIVIDE]: "÷", [FIXED]: "=" };

const at = (config, path) => path.reduce((node, key) => node?.[key], config.cheatConfig);
const nest = (path, value) => path.reduceRight((inner, key) => ({ [key]: inner }), value);

/** "Breeding: Egg incubation speed. (lower is better)" -> "Egg incubation speed". */
const settingLabel = (description) => {
    const words = description
        .replace(/^[^:]{1,30}:\s*/, "")
        .split(/\.\s|\s\(|!/)[0]
        .replace(/\.$/, "")
        .trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * A cheat's settings, from the setting descriptions: every setting under its command's path ("w3 buildspd" ->
 * cheatConfig.w3.buildspd, "w3 worshipspeed" -> cheatConfig.w3.WorshipSpeed). Each is `{ path, label, op }` when the
 * panel edits it (× ÷ =, or a plain number), or counted in `more` for the Config page (lists, words, formulas).
 * ponytail: matched by name, so a setting kept under another name than its command shows only on the Config page.
 */
const settingsOf = (command, config) => {
    const words = command.toLowerCase().split(" ");
    const settings = [];
    let more = 0;
    for (const [key, description] of Object.entries(configDescriptions)) {
        const path = key.split(".").slice(1);
        if (!words.every((word, i) => path[i]?.toLowerCase() === word)) continue;
        const value = at(config, path);
        if (value === undefined) continue;
        const parsed = typeof value === "number" ? null : parseFunction(value);
        const lowerIsBetter = description.includes("lower is better");
        const op =
            typeof value === "number"
                ? "number"
                : parsed.type === PASSTHROUGH
                  ? lowerIsBetter
                      ? DIVIDE
                      : MULTIPLY
                  : [MULTIPLY, DIVIDE, FIXED].includes(parsed.type)
                    ? parsed.type
                    : null;
        if (!op) {
            more++;
            continue;
        }
        settings.push({ path, label: settingLabel(description), op });
    }
    return { settings, more };
};

/** A setting's number as the panel shows it: what follows × ÷ =, or the number itself; 1 for "(t) => t". */
const shownNumber = (value) => (typeof value === "number" ? value : (parseFunction(value).value ?? 1));

/** One setting of a cheat: its number after × ÷ or =, saved to the config file on Enter or on leaving the field. */
const SettingRow = (setting, valueState) =>
    EditableNumberRow({
        valueState,
        inputMode: "float",
        normalize: (raw) => {
            const n = Number(raw);
            if (!Number.isFinite(n)) return null;
            if ((setting.op === MULTIPLY || setting.op === DIVIDE) && n <= 0) throw new Error("Above 0");
            if (n < 0) throw new Error("0 or more");
            return n;
        },
        write: async (next) => {
            const value = setting.op === "number" ? next : generateFunctionString(setting.op, next);
            const { config } = await saveConfigPart(() => ({ cheatConfig: nest(setting.path, value) }));
            return shownNumber(at(config, setting.path));
        },
        renderInfo: () => span({ class: "account-row__name" }, setting.label),
        renderBadge: () => SIGN[setting.op] ?? "",
        rowClass: "system-cheats__setting",
    });

const isOn = (command) => store.getActiveCheats().includes(command);

/** "toggle" for an on/off cheat, "run" for a command, "" until the cheat list has loaded. */
const kindOf = (command) => {
    const row = store.data.cheats.find((cheat) => cheat.value === command);
    return row ? (row.toggle ? "toggle" : "run") : "";
};

/** A command's value field, with the command's own choices (chips, gems, units) from the cheat list. */
const ValueField = (cheat) => {
    const listId = `cheat-choices-${cheat.cheat.replace(/\W+/g, "-")}`;
    const prefix = `${cheat.cheat} `;
    const choices = datalist({ id: listId });
    // The cheat list may load after the panel.
    van.derive(() =>
        choices.replaceChildren(
            ...store.data.cheats
                .filter((row) => row.value.startsWith(prefix))
                .map((row) => option({ value: row.value.slice(prefix.length) }))
        )
    );
    return {
        field: input({
            type: "text",
            class: "system-cheats__value",
            placeholder: cheat.hint,
            "aria-label": `${cheat.label}: ${cheat.hint}`,
            list: listId,
        }),
        choices,
    };
};

/**
 * A cheat: its label and its command, then what it takes: a switch for an on/off cheat, a Run button
 * for a command, and a field first when it takes a value. A cheat with settings opens them under it from its name.
 */
const CheatRow = (cheat, { openId, config }) => {
    const { said, say } = useSaid();
    const isOpen = () => openId.val === cheat.cheat;
    // Made again when the row learns it has settings (it then opens them), so the words never move between parents.
    const titles = () =>
        div(
            { class: "system-cheats__titles" },
            RowTitles({ bonus: cheat.label, name: cheat.cheat }),
            Said({ said, className: "system-cheats__said" })
        );
    const kind = van.derive(() => kindOf(cheat.cheat));
    const { field, choices } = cheat.hint ? ValueField(cheat) : { field: null, choices: null };
    const value = () => field?.value.trim() ?? "";

    // A second press while it runs is let go: a command like "add chips" would run twice.
    let running = false;
    const run = async (e) => {
        const runButton = e.currentTarget;
        if (running) return;
        if (field && !value()) {
            replay(field, "refused");
            return say("refused", `Needs ${cheat.hint === "1-25" ? "a number" : `a ${cheat.hint.split(" ")[0]}`}`);
        }
        running = true;
        try {
            const result = await store.executeCheat(field ? `${cheat.cheat} ${value()}` : cheat.cheat);
            if (!result.ok) return say("failed", plainReason(result.message));
            replay(runButton, "confirmed");
            say("done", result.message);
        } finally {
            running = false;
        }
    };

    const toggle = () =>
        StateSwitch({
            checked: () => isOn(cheat.cheat),
            words: ["On", ""],
            name: cheat.label,
            ownStatus: true,
            onFlip: async (next) => {
                if (next && field && !value()) {
                    replay(field, "refused");
                    return { ok: false, error: new Error(`Needs a ${cheat.hint.split(" ")[0]}`) };
                }
                const result = await store.executeCheat(
                    next && field ? `${cheat.cheat} ${value()}` : cheat.cheat,
                    next
                );
                if (!result.ok) return { ok: false, error: new Error(plainReason(result.message)) };
                // In the rail My cheats is folded away, so where the cheat went is said here.
                if (next && document.getElementById("my-cheats")?.hidden) say("done", "In My cheats");
                return { ok: true };
            },
        });

    // The settings this cheat has, once the config is read; a row with none has no opener.
    const found = () => (config.val ? settingsOf(cheat.cheat, config.val) : { settings: [], more: 0 });
    // A state, so a new read of the config redraws the opener only when the row gains or loses settings.
    const hasDetail = van.derive(() => found().settings.length > 0 || found().more > 0);
    const values = new Map();
    const valueOf = (setting) => {
        const key = setting.path.join(".");
        if (!values.has(key)) values.set(key, van.state(""));
        const state = values.get(key);
        state.val = String(shownNumber(at(config.val, setting.path)));
        return state;
    };

    const row = AccountRow({
        rowClass: () => `system-cheats__row${isOpen() ? " is-open" : ""}`,
        rowProps: { "data-cheat": cheat.cheat },
        info: () =>
            hasDetail.val
                ? button(
                      {
                          type: "button",
                          class: "row-opener",
                          "aria-expanded": () => String(isOpen()),
                          onclick: () => (openId.val = isOpen() ? null : cheat.cheat),
                      },
                      titles()
                  )
                : titles(),
        // Rebuilt only when the kind is first known, so a switch keeps its state as cheats turn on and off.
        controls: () =>
            div(
                { class: "system-cheats__controls" },
                field,
                choices,
                kind.val === "toggle"
                    ? toggle()
                    : kind.val === "run"
                      ? button({ type: "button", class: "btn-quiet btn-sm system-cheats__run", onclick: run }, "Run")
                      : null
            ),
    });
    row.append(
        div({ class: "row-detail", hidden: () => !isOpen() }, () => {
            const { settings, more } = found();
            return div(
                ...settings.map((setting) => SettingRow(setting, valueOf(setting))),
                more
                    ? button(
                          {
                              type: "button",
                              class: "system-cheats__more",
                              onclick: () => store.navigateToCheatConfig(cheat.cheat),
                          },
                          settings.length ? "More settings in Config" : "Settings in Config",
                          Icons.Arrow()
                      )
                    : null
            );
        })
    );
    return row;
};

/** The cheats column beside a page: the gap before it and its narrowest and widest width, in px. */
export const SIDE = { gap: 32, min: 288, max: 336 };

// The newest search hit a panel showed, so a panel made later for another tab doesn't show it again.
let shownFocus = 0;

/**
 * The panel for one page. It sits beside the page when the page leaves room for it, else under the page's title as one
 * line that opens it. Returns null for a page whose system has no cheats.
 */
export const SystemCheats = (page, content) => {
    const cheats = cheatsOfPage(page);
    if (!cheats.length) return null;

    const side = van.state(false);
    const open = van.state(false);
    const openId = van.state(null);
    // The config: the settings' numbers, read again each time the page is shown (the Config page
    // may have changed them). Each save reads its own back.
    const config = van.state(null);
    const loadFailed = van.state(false);
    const load = () =>
        fetchConfig()
            .then((file) => {
                config.val = file;
                loadFailed.val = false;
            })
            .catch(() => (loadFailed.val = true));
    load();
    whenShown(page.id, load);

    const onCount = () => cheats.filter((cheat) => isOn(cheat.cheat)).length;
    const headWords = () => [
        span({ class: "account-section__title" }, "Cheats"),
        span({ class: "account-section__note" }, "until restart"),
        span({ class: "account-section__meta system-cheats__count" }, () => (onCount() ? `${onCount()} on` : "")),
    ];
    const rows = div(
        { class: "tabbed-list__body system-cheats__rows", hidden: () => !side.val && !open.val },
        // Without the config the settings aren't known: said here, with a way to read it again.
        div(
            { class: "system-cheats__failed", hidden: () => !loadFailed.val, role: "status" },
            span("Couldn't read the settings."),
            button({ type: "button", class: "btn-quiet btn-sm", onclick: load }, "Try again")
        ),
        ...cheats.map((cheat) => CheatRow(cheat, { openId, config }))
    );
    const panel = aside(
        {
            class: () => `system-cheats ${side.val ? "is-side" : "is-folded"}${open.val ? " is-open" : ""}`,
            "aria-label": `${page.tab ?? page.system} cheats`,
            onkeydown: (e) => {
                if (e.key !== "Escape" || side.val || !open.val) return;
                open.val = false;
                panel.querySelector(".system-cheats__toggle")?.focus();
            },
        },
        // The group carries the panel's edge, so the top bar's "This page" search hides all of it when no cheat matches.
        div(
            { class: "account-section tabbed-list no-tabs" },
            () =>
                side.val
                    ? div({ class: "account-section__header" }, ...headWords())
                    : button(
                          {
                              type: "button",
                              class: "account-section__header system-cheats__toggle row-opener",
                              "aria-expanded": () => String(open.val),
                              onclick: () => (open.val = !open.val),
                          },
                          ...headWords()
                      ),
            rows
        )
    );

    // A search hit on one of these cheats: open the list where it folds, and show the row.
    van.derive(() => {
        const { cheat, focus, n } = store.app.cheatFocus;
        if (!n || n === shownFocus || !cheats.some((row) => row.cheat === cheat)) return;
        shownFocus = n;
        // Once the panel is in the page (a page the hit opens places it a frame or two later): VanJS drops the bindings
        // of a panel that isn't in the page yet when a state changes.
        const show = () => {
            if (!panel.isConnected) return requestAnimationFrame(show);
            open.val = true;
            const row = rows.querySelector(`[data-cheat="${CSS.escape(cheat)}"]`);
            revealFound(() => row);
            // Keyboard: focus goes to what the row is for (its name that opens it, its switch, its field or Run).
            if (focus)
                setTimeout(
                    () =>
                        row
                            ?.querySelector(".row-opener, [role=switch], .system-cheats__value, .system-cheats__run")
                            ?.focus(),
                    120
                );
        };
        show();
    });

    // Beside the page when the room right of it holds the panel, else under its title. Measured, not a media query: a
    // table page (60rem) needs more room than a list page (48rem), and the sidebar may be open or folded. Pages.js
    // balances the page and this column in the window; the panel's top lines up with the page's first box, so the
    // title, its words and Refresh sit above the page column only.
    // Placed again when the window changes, and when the page's top or first box moves (the page reads the game, a
    // character picker comes in).
    const watcher = new ResizeObserver(() => place());
    const place = () => {
        const pane = content.parentElement;
        const header = content.querySelector(".account-tab-header");
        if (!pane || !header || !pane.clientWidth) return false;
        // The page's first box (a list panel), else the first thing its body shows.
        const body = content.querySelector(".account-page-shell__body");
        const box =
            body && (body.querySelector(".tabbed-list") ?? [...body.children].find((child) => child.offsetHeight));
        watcher.observe(pane);
        watcher.observe(header.closest(".account-page-top") ?? header);
        if (body) watcher.observe(body);
        const room = pane.clientWidth - header.offsetWidth - SIDE.gap;
        side.val = room >= SIDE.min;
        if (side.val) {
            if (panel.parentElement !== pane) pane.append(panel);
            const top = box
                ? box.getBoundingClientRect().top - pane.getBoundingClientRect().top + content.scrollTop
                : header.offsetTop + header.offsetHeight;
            panel.style.setProperty("--cheats-left", `${header.offsetWidth + SIDE.gap}px`);
            panel.style.setProperty("--cheats-top", `${top}px`);
            panel.style.setProperty("--cheats-width", `${Math.min(room, SIDE.max)}px`);
        } else if (panel.previousElementSibling !== header) header.after(panel);
        return true;
    };
    // The page's header may come a frame or two after the page itself.
    const tryPlace = () => place() || requestAnimationFrame(tryPlace);
    requestAnimationFrame(tryPlace);
    return panel;
};
