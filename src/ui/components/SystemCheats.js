/**
 * A system's own cheats, beside its page (#23, concept). Lumi: "we have space on the right, cant we put a cheats menu
 * in our current design on the side?" On a wide window the list stands in the free room right of the page; where the
 * page has no room beside it (the overlay, a phone, a table page on a smaller screen) it folds into one line under the
 * title that opens the same list in place.
 *
 * Built from the page's own pieces: the quiet group (`ListPanel` + the section header, like Stamps' "Gem shop"), a row
 * per cheat with what it does first and its command under it (`RowTitles`), the one on/off switch (`StateSwitch`), and
 * a cheat's settings in the row it opens (`row-opener`, `row-detail`) as the shared value rows (`EditableNumberRow`).
 * A switch runs the cheat the way the Cheats area does (`store.executeCheat`); a setting saves to the config file.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { fetchConfig, saveConfigPart } from "../services/api.js";
import { parseFunction, generateFunctionString, FUNCTION_TYPES } from "../utils/functionParser.js";
import { AccountRow, RowTitles } from "./views/account/components/AccountRow.js";
import { StateSwitch } from "./views/account/components/StateSwitch.js";
import { EditableNumberRow } from "./views/account/EditableNumberRow.js";

const { aside, button, div, span } = van.tags;

const x = FUNCTION_TYPES.MULTIPLY;
const per = FUNCTION_TYPES.DIVIDE;

/**
 * Which cheats belong to which system, by "<world>:<system>" (an automation page is never one of them).
 * ponytail: hand-mapped for the concept's pages; the real build puts a `system` on each defineCheat row instead.
 * `does` is the row's main line, `settings` its config: `path` under cheatConfig, `label`, and `op` (× or ÷).
 */
const SYSTEM_CHEATS = {
    "1:Stamps": [
        {
            command: "w1 stampcost",
            does: "Cheaper stamp upgrades",
            settings: [{ path: ["w1", "stampcost"], label: "Cost", op: per }],
        },
    ],
    "1:Star Signs": [{ command: "wide star", does: "Star signs need no star points" }],
    "2:Alchemy": [
        {
            command: "w2 alchemy",
            does: "Alchemy boosts",
            settings: [
                { path: ["w2", "alchemy", "BubbleBonus"], label: "Bubble effects", op: x },
                { path: ["w2", "alchemy", "CauldronCosts"], label: "Bubble costs", op: x },
                { path: ["w2", "alchemy", "ResearchSpeed"], label: "Brewing speed", op: x },
                { path: ["w2", "alchemy", "PctChanceNewBubble"], label: "New bubble chance", op: x },
                { path: ["w2", "alchemy", "CauldronLvsBrewREQ"], label: "Cauldron level needs", op: per },
                { path: ["w2", "alchemy", "VialCosts"], label: "Vial costs", op: per },
                { path: ["w2", "alchemy", "VialBonus"], label: "Vial effects", op: x },
                { path: ["w2", "alchemy", "LiquidCap"], label: "Liquid cap", op: x },
                { path: ["w2", "alchemy", "LiquidHRrate"], label: "Liquid speed", op: x },
            ],
        },
        { command: "w2 vialrng", does: "Any vial roll unlocks it" },
        { command: "w2 vialattempt", does: "Unlimited vial attempts" },
        {
            command: "w2 sigilspeed",
            does: "Faster sigil research",
            settings: [{ path: ["w2", "alchemy", "sigilspeed"], label: "Speed", op: x }],
        },
    ],
    "4:Breeding": [
        { command: "w4 eggcap", does: "All egg slots" },
        { command: "w4 fenceyard", does: "All fence yard slots" },
        { command: "w4 battleslots", does: "All 6 battle slots" },
        {
            command: "w4 fasteggs",
            does: "Faster incubation",
            settings: [{ path: ["w4", "fasteggs"], label: "Time", op: per }],
        },
        {
            command: "w4 petchance",
            does: "Better new pet chance",
            settings: [{ path: ["w4", "petchance"], label: "Chance", op: x }],
        },
        {
            command: "w4 petupgrades",
            does: "Cheaper pet upgrades",
            settings: [{ path: ["w4", "petupgrades"], label: "Cost", op: per }],
        },
        { command: "w4 genes", does: "Free gene upgrades" },
        { command: "w4 petrng", does: "Strongest pets for their level" },
        {
            command: "w4 superpets",
            does: "Stronger arena pets",
            settings: [
                { path: ["w4", "superpets", "BlockChance"], label: "Block chance", op: x },
                { path: ["w4", "superpets", "TotalDMG"], label: "Damage", op: x },
            ],
        },
        { command: "w4 arena", does: "Unlimited arena entries" },
    ],
};

export const cheatsOfPage = (page) => SYSTEM_CHEATS[`${page.world}:${page.system}`] ?? null;

const SIGN = { [x]: "×", [per]: "÷" };
const at = (config, path) => path.reduce((node, key) => node?.[key], config.cheatConfig);
const nest = (path, value) => path.reduceRight((inner, key) => ({ [key]: inner }), value);

/** One setting of a cheat: its number after × or ÷, saved to the config file on Enter or on leaving the field. */
const SettingRow = (setting, valueState) =>
    EditableNumberRow({
        valueState,
        inputMode: "float",
        normalize: (raw) => {
            const n = Number(raw);
            if (!Number.isFinite(n)) return null;
            if (n <= 0) throw new Error("Above 0");
            return n;
        },
        write: async (next) => {
            const fn = generateFunctionString(setting.op, next);
            const { config } = await saveConfigPart(() => ({ cheatConfig: nest(setting.path, fn) }));
            return parseFunction(at(config, setting.path)).value ?? 1;
        },
        renderInfo: () => span({ class: "account-row__name" }, setting.label),
        renderBadge: () => SIGN[setting.op],
        rowClass: "system-cheats__setting",
    });

const isOn = (command) => store.getActiveCheats().includes(command);

/** A cheat: what it does and its command, its switch, and (when it has settings) its name opens them under it. */
const CheatRow = (cheat, { openId, values }) => {
    const titles = RowTitles({ bonus: cheat.does, name: cheat.command });
    const isOpen = () => openId.val === cheat.command;
    const row = AccountRow({
        rowClass: () => `system-cheats__row${isOpen() ? " is-open" : ""}`,
        info: cheat.settings
            ? button(
                  {
                      type: "button",
                      class: "row-opener",
                      "aria-expanded": () => String(isOpen()),
                      onclick: () => (openId.val = isOpen() ? null : cheat.command),
                  },
                  titles
              )
            : titles,
        controls: StateSwitch({
            checked: () => isOn(cheat.command),
            words: ["On", ""],
            name: cheat.does,
            ownStatus: true,
            onFlip: async (next) => {
                const result = await store.executeCheat(cheat.command, next);
                return result.ok ? { ok: true } : { ok: false, error: new Error(result.message) };
            },
        }),
    });
    if (cheat.settings)
        row.append(
            div(
                { class: "row-detail", hidden: () => !isOpen() },
                ...cheat.settings.map((setting) => SettingRow(setting, values.get(setting)))
            )
        );
    return row;
};

/**
 * The panel for one page. It sits beside the page when the page leaves room for it, else under the page's title as one
 * line that opens it. Returns null for a page whose system has no cheats.
 */
export const SystemCheats = (page, content) => {
    const cheats = cheatsOfPage(page);
    if (!cheats) return null;

    const side = van.state(false);
    const open = van.state(false);
    const openId = van.state(null);
    // Every setting's stored number, read once from the config; the rows read their saves back themselves.
    const values = new Map(cheats.flatMap((cheat) => (cheat.settings ?? []).map((s) => [s, van.state("")])));
    fetchConfig()
        .then((config) => {
            for (const [setting, state] of values)
                state.val = String(parseFunction(at(config, setting.path)).value ?? 1);
        })
        .catch(() => {});

    const onCount = () => cheats.filter((cheat) => isOn(cheat.command)).length;
    const headWords = () => [
        span({ class: "account-section__title" }, "Cheats"),
        span({ class: "account-section__note" }, "while the injector runs"),
        span({ class: "account-section__meta system-cheats__count" }, () => (onCount() ? `${onCount()} on` : "")),
    ];
    const rows = div(
        { class: "tabbed-list__body system-cheats__rows", hidden: () => !side.val && !open.val },
        ...cheats.map((cheat) => CheatRow(cheat, { openId, values }))
    );
    const panel = aside(
        {
            class: () =>
                `system-cheats tabbed-list no-tabs ${side.val ? "is-side" : "is-folded"}${open.val ? " is-open" : ""}`,
            "aria-label": `${page.system} cheats`,
            onkeydown: (e) => {
                if (e.key !== "Escape" || side.val || !open.val) return;
                open.val = false;
                panel.querySelector(".system-cheats__toggle")?.focus();
            },
        },
        div(
            { class: "account-section" },
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

    // Beside the page when the room right of it holds the panel, else under its title. Measured, not a media query: a
    // table page (60rem) needs more room than a list page (48rem), and the sidebar may be open or folded.
    const GAP = 32;
    const MIN = 288;
    const place = () => {
        const pane = content.parentElement;
        const header = content.querySelector(".account-tab-header");
        if (!pane || !header || !pane.clientWidth) return false;
        const room = pane.clientWidth - header.offsetWidth - GAP;
        side.val = room >= MIN;
        if (side.val) {
            if (panel.parentElement !== pane) pane.append(panel);
            panel.style.setProperty("--cheats-left", `${header.offsetWidth + GAP}px`);
            // Its top on the title's line, where the page's own words start.
            panel.style.setProperty(
                "--cheats-top",
                `${header.offsetTop + parseFloat(getComputedStyle(header).paddingTop)}px`
            );
            panel.style.setProperty("--cheats-width", `${Math.min(room, 336)}px`);
        } else if (panel.previousElementSibling !== header) header.after(panel);
        return true;
    };
    // The page's header may come a frame or two after the page itself.
    const watch = () => {
        if (!content.parentElement) return requestAnimationFrame(watch);
        new ResizeObserver(place).observe(content.parentElement);
        const tryPlace = () => place() || requestAnimationFrame(tryPlace);
        tryPlace();
    };
    requestAnimationFrame(watch);
    return panel;
};
