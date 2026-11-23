/**
 * World 2 › Alchemy › Cauldrons: one page, a tab per brewing cauldron the way Bubbles has them (Power, Quicc, High-IQ,
 * Kazam: their Pay 2 Win upgrades), then Liquids (each liquid's amount and cauldron upgrades, their Pay 2 Win upgrades
 * and the Draconic count) and Vials and player (the Pay 2 Win upgrades that belong to no cauldron). Each tab's tray has
 * Max all for its upgrades.
 *
 * Liquid names are hardcoded - they couldn't be easily sourced from game data at runtime and were taken from the IdleOn
 * wiki / in-game descriptions:
 *   Liquid 1 (unlocked Alchemy Lv  1): Water Droplets
 *   Liquid 2 (unlocked Alchemy Lv 20): Liquid Nitrogen
 *   Liquid 3 (unlocked Alchemy Lv 35): Trench Seawater
 *   Liquid 4 (unlocked Alchemy Lv 80): Toxic Mercury
 *
 * Data paths:
 *   CauldronInfo[6][i]         -> current liquid amount   (i = 0..3)
 *   CauldronInfo[8][4+i][2][1] -> cap upgrade level       (i = 0..3), copied in OptionsListAccount[371 + 2i]
 *   CauldronInfo[8][4+i][3][1] -> rate upgrade level      (i = 0..3), copied in OptionsListAccount[372 + 2i]
 *   CauldronP2W[0][f + 3*e]    -> Brewing cauldrons
 *   CauldronP2W[1][f + 2*e]    -> Liquid cauldrons
 *   CauldronP2W[2][e]          -> Vial upgrades
 *   CauldronP2W[3][e]          -> Player boosts
 *   OptionsListAccount[123]    -> Draconic cauldron count
 *
 * Max levels are read via readComputedMany("alchemy", "CauldronLvMAX", ...).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readComputedMany, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList, toolsPerTab } from "../../../components/views/account/tabShared.js";
import { runBulkSet, useWriteStatus, writeVerified } from "../../../components/views/account/accountShared.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";

const { div, span } = van.tags;

const LIQUIDS = [
    { id: "water-droplets", label: "Water Droplets", index: 0, upgradeIndex: 4 },
    { id: "liquid-nitrogen", label: "Liquid Nitrogen", index: 1, upgradeIndex: 5 },
    { id: "trench-seawater", label: "Trench Seawater", index: 2, upgradeIndex: 6 },
    { id: "toxic-mercury", label: "Toxic Mercury", index: 3, upgradeIndex: 7 },
];

// Each liquid's Cap and Rate upgrades again, kept by the game in OptionsListAccount.
const capCopy = (liquid) => String(371 + 2 * liquid.index);
const rateCopy = (liquid) => String(372 + 2 * liquid.index);
const COPIES = LIQUIDS.flatMap((liquid) => [capCopy(liquid), rateCopy(liquid)]);

// The game's CauldronInfo and the second copies of the upgrades.
const readLiquids = async () => {
    const [raw, copies] = await Promise.all([gga("CauldronInfo"), readGgaEntries("OptionsListAccount", COPIES)]);
    return { raw, copies };
};

// A liquid's three values as the game holds them. An upgrade whose two copies differ (the game took one and refused
// the other) keeps the copy the line showed, the one the save didn't change, so saving the new value again writes
// both; a line that showed neither shows CauldronInfo's.
const liquidValues = ({ raw, copies }, liquid, states) => {
    const upgrades = toIndexedArray(toIndexedArray(raw?.[8] ?? [])[liquid.upgradeIndex] ?? []);
    const upgrade = (at, copy, state) => {
        const value = Number(toIndexedArray(upgrades[at] ?? [])[1] ?? 0);
        const other = Number(copies?.[copy] ?? value);
        return other !== value && Number(state.val) === other ? other : value;
    };
    return {
        amount: Math.max(0, Math.round(Number(toIndexedArray(raw?.[6] ?? [])[liquid.index] ?? 0))),
        cap: upgrade(2, capCopy(liquid), states.cap),
        rate: upgrade(3, rateCopy(liquid), states.rate),
    };
};

// One liquid per line: Amount, Cap upgrade and Rate upgrade in the list's columns. Both copies of an upgrade go in one
// request, so a dropped connection can't leave them split. The game still writes them one by one: if it refuses one,
// the other stays written (History lists it, and the row says why), and the line keeps the old value so the same
// save can be tried again. ponytail: an all-or-nothing write needs the game's writePaths to put the first back.
const LiquidRow = ({ liquid, states }) =>
    ValueTableRow({
        name: liquid.label,
        info: span({ class: `account-row__name liquid-name liquid-name--${liquid.id}` }, liquid.label),
        fields: [
            { key: "amount", label: "Amount", valueState: states.amount, paths: [`CauldronInfo[6][${liquid.index}]`] },
            {
                key: "cap",
                label: "Cap upgrade",
                valueState: states.cap,
                paths: [
                    `CauldronInfo[8][${liquid.upgradeIndex}][2][1]`,
                    `OptionsListAccount[${371 + 2 * liquid.index}]`,
                ],
            },
            {
                key: "rate",
                label: "Rate upgrade",
                valueState: states.rate,
                paths: [
                    `CauldronInfo[8][${liquid.upgradeIndex}][3][1]`,
                    `OptionsListAccount[${372 + 2 * liquid.index}]`,
                ],
            },
        ],
        read: async () => liquidValues(await readLiquids(), liquid, states),
    });

// Kept while the menu runs, not per opening: a line whose save split an upgrade's copies still shows the copy the save
// didn't change when the page opens again, so saving the new value writes both.
// ponytail: lost when the injector restarts; a split found then shows CauldronInfo's copy.
const liquidStates = LIQUIDS.map(() => ({
    amount: van.state(0),
    cap: van.state(0),
    rate: van.state(0),
}));
// Each opening loads in its own turn, so a load from an earlier opening can end after a newer one: only the newest
// load shows its values. A load keeps its number when it reads again after a save, so that read can't hide a newer one.
let liquidLoads = 0;

// Pay 2 Win's groups. A brewing cauldron's three upgrades sit at column + 3 × cauldron in bucket 0, a liquid's two at
// column + 2 × liquid in bucket 1; vials and player are lists of their own.
const BREWING = { bucket: 0, stride: 3, columns: ["Speed", "New bubble", "Boost req"] };
const LIQUID_P2W = { bucket: 1, stride: 2, columns: ["Regen", "Capacity"] };
const VIALS = { bucket: 2, rows: ["Attempts", "RNG"] };
const PLAYER = { bucket: 3, rows: ["Alchemy speed", "Extra EXP"] };
const P2W_GROUPS = [BREWING, LIQUID_P2W, VIALS, PLAYER];
const slotsOf = (group) => (group.rows ? group.rows.length : 4 * group.stride);

// The four brewing cauldrons, in the game's order (Bubbles' Orange, Green, Purple, Yellow).
const CAULDRONS = [
    { id: "power", label: "Power", colour: "Orange" },
    { id: "quicc", label: "Quicc", colour: "Green" },
    { id: "high-iq", label: "High-IQ", colour: "Purple" },
    { id: "kazam", label: "Kazam", colour: "Yellow" },
];
const TABS = [
    ...CAULDRONS.map(({ id, label, colour }) => ({
        id,
        label,
        keywords: [`${label} Cauldron`, colour, "Pay 2 Win", ...BREWING.columns],
    })),
    {
        id: "liquids",
        label: "Liquids",
        keywords: ["Liquid", ...LIQUIDS.map((liquid) => liquid.label), "Draconic", "Regen", "Capacity"],
    },
    { id: "vials-player", label: "Vials and player", keywords: ["Vials", ...VIALS.rows, ...PLAYER.rows] },
];
const DRACONIC = { label: "Draconic cauldrons", max: 4, writePath: "OptionsListAccount[123]" };

const P2WRow = ({ label, valueState, maxState, writePath }) =>
    EditableNumberRow({
        valueState,
        // A value pulled into range is refused with the bound (useFieldEditor), so nothing past the max is written.
        normalize: (rawValue) => {
            const parsed = Math.max(0, Math.round(Number(rawValue)));
            const max = Number(maxState.val);
            if (Number.isNaN(parsed)) return null;
            // A count the game holds above the max may come down step by step (Lower); nothing goes up past the max.
            if (max > 0 && parsed > max && parsed < Number(valueState.val ?? 0)) return parsed;
            return max > 0 ? Math.min(max, parsed) : parsed;
        },
        write: async (nextValue) => writeVerified(writePath, nextValue),
        renderInfo: () => span({ class: "account-row__name" }, label),
        // The max level, where −/+ stop; none until it's read.
        cap: () => (maxState.val > 0 ? maxState.val : null),
        adjustInput: (rawValue, delta, currentValue) => {
            const base = Number(rawValue);
            const next = Number.isFinite(base) ? base : Number(currentValue ?? 0);
            const max = Number(maxState.val);
            const updated = Math.max(0, next + delta);
            // A count the game holds past the max: Raise leaves it, Lower takes one off and saves it.
            if (max > 0 && next > max) return delta > 0 ? next : updated;
            return max > 0 ? Math.min(max, updated) : updated;
        },
        inputMode: "int",
    });

const CauldronsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cauldrons" });
    // Each Pay 2 Win upgrade's level and max, at its place in its group's bucket.
    const valueStates = P2W_GROUPS.map((group) => Array.from({ length: slotsOf(group) }, () => van.state(0)));
    const maxStates = P2W_GROUPS.map((group) => Array.from({ length: slotsOf(group) }, () => van.state(0)));
    const draconic = { value: van.state(0), max: van.state(DRACONIC.max) };

    const load = async () => {
        const id = ++liquidLoads;
        return run(async () => {
            const [liquids, rawP2W, rawDraconic] = await Promise.all([
                readLiquids(),
                gga("CauldronP2W"),
                gga("OptionsListAccount[123]"),
            ]);
            const p2w = toIndexedArray(rawP2W ?? []);
            const maxTargets = [];
            const levels = [];
            P2W_GROUPS.forEach((group, g) => {
                const bucket = toIndexedArray(p2w[group.bucket] ?? []);
                valueStates[g].forEach((_, at) => {
                    levels.push([g, at, Number(bucket[at] ?? 0)]);
                    // The game asks for a max by group, line and column ("0" for a list's row).
                    maxTargets.push({
                        args: group.rows
                            ? [group.bucket, at, "0"]
                            : [group.bucket, Math.floor(at / group.stride), String(at % group.stride)],
                        apply: (value) => (maxStates[g][at].val = Number(value ?? 0)),
                    });
                });
            });
            const maxResults = await readComputedMany(
                "alchemy",
                "CauldronLvMAX",
                maxTargets.map((entry) => entry.args)
            );
            maxTargets.forEach((entry, index) => {
                if (!maxResults[index]?.ok) {
                    throw new Error(
                        `CauldronLvMAX failed for target ${index} (args=${JSON.stringify(entry.args)}): ${maxResults[index]?.error ?? "unknown"}`
                    );
                }
            });
            if (id !== liquidLoads) return;
            LIQUIDS.forEach((liquid, i) => {
                const values = liquidValues(liquids, liquid, liquidStates[i]);
                Object.keys(values).forEach((key) => (liquidStates[i][key].val = values[key]));
            });
            levels.forEach(([g, at, level]) => (valueStates[g][at].val = level));
            maxTargets.forEach((entry, index) => entry.apply(maxResults[index].value));
            // What the game holds, even past the max, so the row never hides it.
            const count = Number(rawDraconic ?? 0);
            draconic.value.val = Number.isFinite(count) ? count : 0;
        });
    };

    // Max all, per tab: its upgrades the top bar's search shows, each to its max (one above it comes down to it).
    const bulk = useWriteStatus();
    const upgradesOf = new Map(TABS.map((tab) => [tab.id, []])); // tab id -> [{ row, valueState, maxState, path }]
    const upgrade = (tabId, { row, valueState, maxState, path }) => {
        upgradesOf.get(tabId).push({ row, valueState, maxState, path });
        return row;
    };
    const shownUpgrades = (tabId) => upgradesOf.get(tabId).filter(({ row }) => shownBySearch(row));
    const maxAll = (tabId) =>
        div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Max all",
                status: bulk.status,
                disabled: () =>
                    loading.val ||
                    !shownUpgrades(tabId).some(
                        ({ valueState, maxState }) =>
                            maxState.val > 0 && Number(valueState.val) !== Number(maxState.val)
                    ),
                onClick: (e) => {
                    e.preventDefault();
                    return bulk.run(() =>
                        runBulkSet({
                            entries: shownUpgrades(tabId).filter(({ maxState }) => maxState.val > 0),
                            getTargetValue: ({ maxState }) => Number(maxState.val),
                            getValueState: ({ valueState }) => valueState,
                            getPath: ({ path }) => path,
                        })
                    );
                },
            })
        );
    const upgradeWord = (tabId, n) => {
        const cauldron = CAULDRONS.find((c) => c.id === tabId);
        return `${cauldron ? `${cauldron.label} ` : ""}upgrade${n === 1 ? "" : "s"}`;
    };
    const toolsLabel = (activeId) => {
        const n = shownUpgrades(activeId.val).length;
        return isSearching()
            ? `${n} matching ${upgradeWord(activeId.val, n)}`
            : `All ${n} ${upgradeWord(activeId.val, n)}`;
    };

    // A list's Pay 2 Win rows, each an upgrade of `tabId`.
    const listRows = (tabId, g, labels, at = (row) => row) =>
        labels.map((label, i) => {
            const slot = at(i);
            const path = `CauldronP2W[${P2W_GROUPS[g].bucket}][${slot}]`;
            const valueState = valueStates[g][slot];
            const maxState = maxStates[g][slot];
            return upgrade(tabId, {
                row: P2WRow({ label, valueState, maxState, writePath: path }),
                valueState,
                maxState,
                path,
            });
        });

    const cauldronPane = (cauldron, c) =>
        div(
            { class: "account-page-pane" },
            AccountSection({
                title: "Pay 2 Win",
                body: listRows(cauldron.id, 0, BREWING.columns, (column) => column + BREWING.stride * c),
            })
        );

    // The liquids: each one's amount and its cauldron's two upgrades, then their Pay 2 Win upgrades and the Draconic
    // count, which is the liquid cauldrons' own.
    const liquidPane = () => {
        const p2wLine = (liquid, l) => {
            const at = (column) => column + LIQUID_P2W.stride * l;
            const row = ValueTableRow({
                name: liquid.label,
                info: span({ class: `account-row__name liquid-name liquid-name--${liquid.id}` }, liquid.label),
                fields: LIQUID_P2W.columns.map((label, column) => ({
                    key: String(column),
                    label,
                    valueState: valueStates[1][at(column)],
                    max: () => maxStates[1][at(column)].val,
                    paths: [`CauldronP2W[${LIQUID_P2W.bucket}][${at(column)}]`],
                })),
                read: async () => {
                    const bucket = toIndexedArray((await gga(`CauldronP2W[${LIQUID_P2W.bucket}]`)) ?? []);
                    return Object.fromEntries(
                        LIQUID_P2W.columns.map((_, column) => [String(column), Number(bucket[at(column)] ?? 0)])
                    );
                },
            });
            LIQUID_P2W.columns.forEach((_, column) =>
                upgradesOf.get("liquids").push({
                    row,
                    valueState: valueStates[1][at(column)],
                    maxState: maxStates[1][at(column)],
                    path: `CauldronP2W[${LIQUID_P2W.bucket}][${at(column)}]`,
                })
            );
            return row;
        };
        return div(
            { class: "account-page-pane" },
            ValueTableHead({ name: "Liquid", columns: ["Amount", "Cap upgrade", "Rate upgrade"] }),
            ...LIQUIDS.map((liquid, i) => LiquidRow({ liquid, states: liquidStates[i] })),
            AccountSection({
                title: "Pay 2 Win",
                body: [
                    ValueTableHead({ name: "Liquid", columns: LIQUID_P2W.columns }),
                    ...LIQUIDS.map(p2wLine),
                    upgrade("liquids", {
                        row: P2WRow({
                            label: DRACONIC.label,
                            valueState: draconic.value,
                            maxState: draconic.max,
                            writePath: DRACONIC.writePath,
                        }),
                        valueState: draconic.value,
                        maxState: draconic.max,
                        path: DRACONIC.writePath,
                    }),
                ],
            })
        );
    };

    const vialsPlayerPane = () =>
        div(
            { class: "account-page-pane" },
            AccountSection({ title: "Vials", body: listRows("vials-player", 2, VIALS.rows) }),
            AccountSection({ title: "Player", body: listRows("vials-player", 3, PLAYER.rows) })
        );

    const content = {
        ...Object.fromEntries(CAULDRONS.map((cauldron, c) => [cauldron.id, cauldronPane(cauldron, c)])),
        liquids: liquidPane(),
        "vials-player": vialsPlayerPane(),
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Cauldrons",
        description: "Each cauldron's Pay 2 Win upgrades, the liquids, and the vial and player upgrades.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading cauldrons",
        errorTitle: "Couldn't read cauldrons",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Cauldrons",
                page: "w2.cauldrons",
                // Six tabs: on a phone they take two rows instead of running off the side.
                wrap: true,
                busy: () => bulk.status.val === "loading",
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: content[tab.id] })),
                tools: toolsPerTab(Object.fromEntries(TABS.map((tab) => [tab.id, () => maxAll(tab.id)]))),
                toolsLabel,
            })
        ),
    });
};

export default definePage({
    id: "w2.cauldrons",
    world: 2,
    system: "Alchemy",
    tab: "Cauldrons",
    description: "Each cauldron's Pay 2 Win upgrades, the liquids, and the vial and player upgrades.",
    keywords: ["Cauldrons", "Liquid", "Liquids", "Pay 2 Win", "P2W", "Draconic", "Brewing"],
    // Each tab is found by its own name and words, and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: CauldronsTab,
});
