/**
 * Account - Clickers: Bubba
 *
 * Reads/writes gga.Bubba: [0] the run's values, [1] upgrade levels, [2] free upgrade levels, [3] Charisma attributes,
 * [4] dice, [5] smoked meats. The game's places are tabs: Upgrades (a table, the level and the free levels on one line,
 * the game's own line first), Meat (the run's meat, its smoked meats and spare coins), Charisma, Gifts and Dice. A pick
 * out of the game's list (an attribute, a gift) opens in place under its row. Every write runs in turn; an upgrade's
 * write clears the game's cached level total (DNSM.h.Bubba_LVzAll), or it keeps the old sum.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formattedStep } from "../../../utils/numberFormat.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import {
    bonusText,
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    largeParser,
    realMax,
    resolveNumberInput,
    runBulkSet,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { TabbedList, toolsPerTab } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

// Upgrades that never get free levels, and the ones whose level outlasts a reset.
const NO_FREE_LEVELS = new Set([3, 8, 9, 10, 12, 14, 15, 16]);
const PERMANENT = new Set([3, 8, 9]);
const TABS = [
    { id: "upgrades", label: "Upgrades" },
    { id: "meat", label: "Meat" },
    { id: "charisma", label: "Charisma" },
    { id: "gifts", label: "Gifts" },
    { id: "dice", label: "Dice" },
];
const UPGRADE_COLUMNS = [
    { value: "level", label: "Level" },
    { value: "free", label: "Free levels" },
];
// An upgrade's line in the game's words: its first sentence (the rest are how to use it), without the numbers' marks.
const bubbaLine = (text) => {
    const first = String(text ?? "")
        .split("_@_")[0]
        .split(/(?<=[.!?])_/)[0];
    return bonusText(first).replace(/\s%(?=\s)/g, "");
};
const words = (name) => String(name).replace(/_/g, " ");

/** The page's numbers and picks, by tab and group, from the game's lists. */
const createBubbaParts = (upgrades, traits, gifts, smokeBonuses) => {
    if (
        upgrades.length !== 28 ||
        traits.length !== 6 ||
        gifts.length !== 6 ||
        smokeBonuses.length !== 5 ||
        upgrades.some((entry) => !entry[0] || !Number.isFinite(Number(entry[4])) || Number(entry[4]) < 0)
    ) {
        throw new Error("The game's Bubba lists changed. Refresh after an update.");
    }
    const field = (group, index, name, options = {}) => ({
        path: `Bubba[${group}][${index}]`,
        group,
        index,
        name,
        min: 0,
        max: Infinity,
        ...options,
    });
    const choices = (names) => [
        { id: "0", label: "None" },
        ...names.map((name, i) => ({ id: String(i + 1), label: words(name) })),
    ];
    return {
        upgrades: upgrades.map((entry, index) => ({
            index,
            name: words(entry[0]),
            bonus: bubbaLine(entry[7]),
            // 999 is the game's "no max" for a purchase.
            max: realMax(entry[4]),
            free: !NO_FREE_LEVELS.has(index),
            permanent: PERMANENT.has(index),
        })),
        meat: [
            {
                title: "This run",
                fields: [
                    field(0, 0, "Meat Slices", { formatted: true, float: true }),
                    field(0, 1, "Happiness", { formatted: true, float: true }),
                    field(0, 4, "Meat produced this run", { formatted: true, float: true }),
                    field(0, 5, "Pats used this hour", { min: -50, note: "Down to −50 after a Megaflesh milestone" }),
                ],
            },
            {
                title: "Smoked Meat",
                fields: [
                    ...smokeBonuses.map((bonus, index) =>
                        field(5, index, `Smoked Meat ${index + 1}`, { formatted: true, note: `+${bonus}% per meat` })
                    ),
                    field(0, 14, "Smoker age in seconds", { formatted: true, float: true }),
                ],
            },
            {
                title: "Spare Coins",
                fields: ["Pennies", "Nickels", "Quarters", "Dollars"].map((name, index) =>
                    field(0, index + 9, name, { formatted: true })
                ),
            },
        ],
        charisma: [
            {
                title: "Attributes",
                fields: [
                    ...traits.map((name, index) => field(3, index, words(name), { max: 120 })),
                    field(0, 8, "Charisma progress", { formatted: true, float: true }),
                ],
                picks: [
                    field(0, 6, "Selected attribute", { choices: choices(traits) }),
                    field(0, 15, "Emulsified attribute", { choices: choices(traits) }),
                ],
            },
        ],
        gifts: [
            {
                title: "Gifts",
                picks: [2, 3].map((index) =>
                    field(0, index, `Gift slot ${index - 1}`, { choices: choices(gifts), gift: true })
                ),
            },
        ],
        dice: [
            { title: "Dice", fields: Array.from({ length: 8 }, (_, i) => field(4, i, `Die ${i + 1}`, { max: 20 })) },
        ],
    };
};

// What each tab's group says once, under its heading: what opens it in the game.
const NOTES = {
    Attributes: "Opens with the Charisma upgrade. Emulsifying needs 6 Megaflesh.",
    Gifts: "Opens with Fun Gifts. The second slot needs 3 Megaflesh.",
    Dice: "Opens with Dice Roll. A die at 0 isn't rolled.",
    "Smoked Meat": "Opens with the Smoker.",
    "Spare Coins": "Opens with Spare Coins.",
};

const BubbaTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Bubba" });
    const states = new Map();
    const stateOf = (path) => getOrCreateState(states, path, undefined);
    // Every write waits for the one before it: a gift's check and an upgrade's cache clear see the game as it is.
    let writes = Promise.resolve();
    const inTurn = (task) => {
        const next = writes.then(task, task);
        writes = next.catch(() => {});
        return next;
    };
    const clearLevelTotal = () => deleteGga("DNSM.h.Bubba_LVzAll");
    const setAllColumn = van.state("level");
    const noFreeLevels = new WeakSet();
    const activeTab = van.state(TABS[0].id);

    // The tab's lines Max all fills (the ones with a max the top bar's search shows), and its rows' count.
    const capped = new Map(TABS.map((tab) => [tab.id, []]));
    const rowsOf = new Map(TABS.map((tab) => [tab.id, []]));
    const panes = new Map(TABS.map((tab) => [tab.id, div({ class: `account-page-pane bubba-${tab.id}` })]));
    const reconcilers = new Map(TABS.map((tab) => [tab.id, createStaticRowReconciler(panes.get(tab.id))]));

    const numberRow = (tabId, field) => {
        const valueState = stateOf(field.path);
        const normalize = (raw) =>
            resolveNumberInput(raw, {
                formatted: field.formatted,
                float: field.float,
                min: field.min,
                max: field.max,
                fallback: null,
                strict: true,
            });
        const row = EditableNumberRow({
            valueState,
            normalize,
            disabled: () => loading.val || Boolean(error.val),
            write: (value) =>
                inTurn(async () => {
                    await writeVerified(field.path, value);
                    return value;
                }),
            renderInfo: () => RowTitles({ name: field.name, note: field.note }),
            cap: Number.isFinite(field.max) ? field.max : null,
            inputMode: field.float ? "float" : "int",
            inputProps: field.formatted ? { formatter: largeFormatter, parser: largeParser } : {},
            adjustInput: (raw, delta) => {
                const value = resolveNumberInput(raw, { formatted: field.formatted, float: field.float }) ?? 0;
                const step = field.formatted ? formattedStep(value) : field.float ? 0.1 : 1;
                return Math.max(field.min, Math.min(field.max, value + delta * step));
            },
            setAll: { min: field.min },
        });
        rowsOf.get(tabId).push(row);
        if (Number.isFinite(field.max)) capped.get(tabId).push({ row, valueState, max: field.max, path: field.path });
        return row;
    };

    // A pick out of the game's list, opened under its row like a chip slot's: the row's title shows the pick.
    const pickRow = (tabId, field) => {
        const valueState = stateOf(field.path);
        let draft = 0;
        const write = useAutoSave({
            capture: () => draft,
            prepare: (next = draft) =>
                next === valueState.val
                    ? { unchanged: true }
                    : {
                          write: () =>
                              inTurn(async () => {
                                  // The game's two gift slots never hold the same gift.
                                  if (field.gift && next !== 0) {
                                      const other = await gga(`Bubba[0][${field.index === 2 ? 3 : 2}]`);
                                      if (Number(other) === next)
                                          throw new Error("The other slot has it. Pick another.");
                                  }
                                  await writeVerified(field.path, next);
                                  valueState.val = next;
                                  return next;
                              }),
                      },
        });
        const picked = () => field.choices.find((choice) => choice.id === String(valueState.val))?.label ?? "None";
        const pick = PickInPlace({
            name: field.name,
            look: "row",
            label: picked,
            opener: RowTitles({ bonus: picked, name: field.name }),
            options: () => field.choices,
            picked: () => String(valueState.val),
            onPick: (id) => {
                draft = Number(id);
                void write.save();
            },
            disabled: () => loading.val || Boolean(error.val),
            panelClass: "row-detail",
        });
        const row = AccountRow({
            rowClass: () => saveStateClass(write.status.val, write.undo),
            rowProps: write.handlers,
            info: pick.opener,
            controls: SaveState(write),
        });
        row.append(pick.panel);
        rowsOf.get(tabId).push(row);
        return row;
    };

    // An upgrade's line: its level up to the game's max, and its free levels where it gets them.
    const upgradeRow = (upgrade) => {
        const level = stateOf(`Bubba[1][${upgrade.index}]`);
        const free = stateOf(`Bubba[2][${upgrade.index}]`);
        const row = ValueTableRow({
            name: upgrade.name,
            info: RowTitles({
                bonus: upgrade.bonus,
                name: upgrade.name,
                note: upgrade.permanent ? "Setting it doesn't reset the run" : null,
            }),
            fields: [
                {
                    key: "level",
                    label: "Level",
                    valueState: level,
                    paths: [`Bubba[1][${upgrade.index}]`],
                    max: upgrade.max ?? undefined,
                },
                upgrade.free
                    ? { key: "free", label: "Free levels", valueState: free, paths: [`Bubba[2][${upgrade.index}]`] }
                    : { key: "free", blank: true },
            ],
            read: async () => {
                const data = toIndexedArray(await gga("Bubba")).map(toIndexedArray);
                return { level: Number(data[1][upgrade.index]), free: Number(data[2][upgrade.index]) };
            },
            // Its cache clear runs in the save's turn (not as afterWrite, so Set all writes the lines in one write).
            runWrite: (task) =>
                inTurn(async () => {
                    const saved = await task();
                    await clearLevelTotal();
                    return saved;
                }),
            setAll: setAllColumn,
        });
        rowsOf.get("upgrades").push(row);
        if (!upgrade.free) noFreeLevels.add(row);
        if (upgrade.max !== null)
            capped
                .get("upgrades")
                .push({ row, valueState: level, max: upgrade.max, path: `Bubba[1][${upgrade.index}]` });
        return row;
    };

    const groups = (tabId, list) =>
        list.map((group) =>
            AccountSection({
                title: group.title,
                note: NOTES[group.title] ?? null,
                body: [
                    ...(group.fields ?? []).map((field) => numberRow(tabId, field)),
                    ...(group.picks ?? []).map((field) => pickRow(tabId, field)),
                ],
            })
        );

    const load = () =>
        run(async () => {
            await writes;
            const [raw, rawUpgrades, rawTraits, rawGifts, rawSmoke] = await Promise.all([
                gga("Bubba"),
                readCList("BubbaUpg"),
                readCList("Spelunky[36]"),
                readCList("Spelunky[39]"),
                readCList("Spelunky[34]"),
            ]);
            const data = toIndexedArray(raw).map(toIndexedArray);
            const lengths = [20, 28, 28, 6, 8, 5];
            if (data.length !== lengths.length || data.some((values, index) => values.length !== lengths[index])) {
                throw new Error("Bubba's save isn't in the shape this page knows. Refresh after an update.");
            }
            const parts = createBubbaParts(
                toIndexedArray(rawUpgrades).map(toIndexedArray),
                toIndexedArray(rawTraits),
                toIndexedArray(rawGifts),
                toIndexedArray(rawSmoke)
            );
            const paths = [
                ...parts.upgrades.flatMap((u) => [`Bubba[1][${u.index}]`, `Bubba[2][${u.index}]`]),
                ...["meat", "charisma", "gifts", "dice"].flatMap((tab) =>
                    parts[tab].flatMap((group) => [...(group.fields ?? []), ...(group.picks ?? [])].map((f) => f.path))
                ),
            ];
            for (const path of paths) {
                const [, group, index] = path.match(/\[(\d+)\]\[(\d+)\]/);
                const value = Number(data[group][index]);
                if (!Number.isFinite(value))
                    throw new Error("Bubba's save holds a value that isn't a number. Refresh.");
                stateOf(path).val = value;
            }
            const signature = JSON.stringify(parts);
            for (const tab of TABS)
                reconcilers.get(tab.id)(signature, () => {
                    rowsOf.set(tab.id, []);
                    capped.set(tab.id, []);
                    if (tab.id !== "upgrades") return groups(tab.id, parts[tab.id]);
                    return [
                        ValueTableHead({ name: "Upgrade", columns: ["Level", "Free levels"] }),
                        ...parts.upgrades.map(upgradeRow),
                    ];
                });
        });

    // Max all, per tab: the lines with a max the search shows, each to its max (one above it comes down to it).
    const bulk = useWriteStatus();
    const shownCapped = (tabId) => (loading.val, capped.get(tabId)).filter(({ row }) => shownBySearch(row));
    const maxAll = (tabId) => () =>
        div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Max all",
                status: bulk.status,
                disabled: () =>
                    loading.val || !shownCapped(tabId).some(({ valueState, max }) => Number(valueState.val) !== max),
                onClick: (e) => {
                    e.preventDefault();
                    return bulk.run(() =>
                        inTurn(async () => {
                            await runBulkSet({
                                entries: shownCapped(tabId),
                                getTargetValue: ({ max }) => max,
                                getValueState: ({ valueState }) => valueState,
                                getPath: ({ path }) => path,
                            });
                            if (tabId === "upgrades") await clearLevelTotal();
                        })
                    );
                },
            })
        );
    const WORDS = { upgrades: ["upgrade", "upgrades"], dice: ["die", "dice"] };
    const lineWord = (tabId, n) => (WORDS[tabId] ?? ["line", "lines"])[n === 1 ? 0 : 1];
    // On the upgrades, the ones with the column Set all sets: free levels leave out the upgrades that never get them.
    const toolsLabel = (activeId) => {
        const freeOnly = activeId.val === "upgrades" && setAllColumn.val === "free";
        const n = (loading.val, rowsOf.get(activeId.val)).filter(
            (row) => shownBySearch(row) && !(freeOnly && noFreeLevels.has(row))
        ).length;
        return isSearching() ? `${n} matching ${lineWord(activeId.val, n)}` : `All ${n} ${lineWord(activeId.val, n)}`;
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Bubba",
        automation: { page: "automation.clickers", tab: "bubba" },
        description:
            "Bubba's meat, upgrades, charisma, gifts and dice. Nothing here buys or resets; reopen Bubba to see it.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading Bubba",
        errorTitle: "Couldn't read Bubba",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Bubba",
                activeId: activeTab,
                busy: () => bulk.status.val === "loading",
                setAll: {
                    word: (n, tabId) => lineWord(tabId, n),
                    placeholder: "Value",
                    // The upgrades' Set all sets the picked column: their levels or their free levels.
                    columns: (tabId) => (tabId === "upgrades" ? UPGRADE_COLUMNS : null),
                    column: setAllColumn,
                    onDone: (result) => {
                        if (result.ok && activeTab.val === "upgrades") void clearLevelTotal();
                    },
                },
                tabs: TABS.map((tab) => ({ ...tab, content: panes.get(tab.id) })),
                tools: toolsPerTab({
                    upgrades: maxAll("upgrades"),
                    charisma: maxAll("charisma"),
                    dice: maxAll("dice"),
                }),
                toolsOn: (tabId) => ["upgrades", "charisma", "dice"].includes(tabId),
                toolsLabel,
            })
        ),
    });
};

export default definePage({
    id: "account.bubba",
    world: "account",
    system: "Clickers",
    tab: "Bubba",
    description: "Bubba's meat, upgrades, charisma, gifts, dice and smoked meat.",
    keywords: ["Bubba", "Clicker", "Charisma", "Gifts", "Dice", "Smoked Meat", "Spare Coins"],
    component: BubbaTab,
});
