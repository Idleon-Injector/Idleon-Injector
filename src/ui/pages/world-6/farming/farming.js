/**
 * W6 - Farming
 *
 * One page, the game's farming screens as its tabs: Plots, Crop Depot, Market, Exotic Market, Land Rank, Stickers. One
 * read of the game fills every tab.
 *
 * Data sources:
 *   gga.FarmRank[0][p], [1][p]   - plot p's rank and rank EXP (36 plots, the farm's rows bottom-left first)
 *   gga.FarmRank[2][n]           - Land Rank Database upgrade n's level (cList.NinjaInfo[34] names, [35] bonuses); its
 *                                  5th column is capped at _customBlock_FarmingStuffs("LandRank5thColumnMaxLV")
 *   gga.FarmCrop.h[c]            - how many of crop c the depot holds; cList.SeedInfo: [name, ?, first crop, last crop]
 *   gga.FarmUpg[2..9], [10..17]  - the Day Market's and Night Market's levels (cList.MarketInfo 0-7, 8-15), capped at
 *                                  _customBlock_FarmingStuffs("MarketMaxLV", day 0 / night 1, n)
 *   gga.FarmUpg[20 + n]          - Exotic Market upgrade n's level (cList.MarketExoticInfo; NAME_MAGNI rows are the
 *                                  game's placeholders)
 *   gga.Spelunk[50]              - the Exotic Market upgrades with an Organic Label, by n
 *   gga.Research[9][s]           - how many of sticker s (cList.Research[23]; "Nonexistent_Sticker" is a placeholder)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList, loadParts } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    createIndexedStateGetter,
    createStaticRowReconciler,
    normalCase,
    oneAtATime,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";

const { div, span } = van.tags;

// The game's capitals in normal case, keeping its short words (EVOLUTION_GMO: "Evolution GMO", OG_FERTILIZER).
const farmName = (raw) =>
    normalCase(raw)
        .replace(/\bGmo\b/g, "GMO")
        .replace(/\bOg\b/g, "OG");

// ---- Plots -------------------------------------------------------------------------------------------------------

const PLOT_COUNT = 36;
const PLOT_FIELDS = [
    { key: "rank", label: "Rank", index: 0 },
    { key: "exp", label: "Rank EXP", index: 1, formatted: true, quiet: true },
];

const PlotsPart = () => {
    const states = new Map();
    const stateOf = (plot) => {
        if (!states.has(plot))
            states.set(plot, Object.fromEntries(PLOT_FIELDS.map((field) => [field.key, van.state(0)])));
        return states.get(plot);
    };
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const at = (plot, field) => `FarmRank[${field.index}][${plot}]`;
    const valueOf = (field, raw) => (field.formatted ? toNum(raw, 0) : toInt(raw, { min: 0 }));

    const PlotRow = (plot) => {
        const name = `Plot ${plot + 1}`;
        return ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: PLOT_FIELDS.map((field) => ({
                ...field,
                valueState: stateOf(plot)[field.key],
                paths: [at(plot, field)],
            })),
            read: async () => {
                const values = await Promise.all(PLOT_FIELDS.map((field) => gga(at(plot, field))));
                return Object.fromEntries(PLOT_FIELDS.map((field, i) => [field.key, valueOf(field, values[i])]));
            },
        });
    };

    return {
        content: div(ValueTableHead({ name: "Plot", columns: PLOT_FIELDS.map((field) => field.label) }), listNode),
        load: async () => {
            const farmRank = toIndexedArray((await gga("FarmRank")) ?? []).map((raw) => toIndexedArray(raw ?? []));
            reconcileRows(String(PLOT_COUNT), () => Array.from({ length: PLOT_COUNT }, (_, plot) => PlotRow(plot)));
            for (let plot = 0; plot < PLOT_COUNT; plot++)
                PLOT_FIELDS.forEach(
                    (field) => (stateOf(plot)[field.key].val = valueOf(field, farmRank[field.index]?.[plot]))
                );
        },
    };
};

// ---- Crop Depot --------------------------------------------------------------------------------------------------

const CropDepotPart = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const [rawCrops, rawSeeds] = await Promise.all([gga("FarmCrop.h"), readCList("SeedInfo")]);
            const crops = rawCrops ?? {};
            list.show(
                toIndexedArray(rawSeeds ?? []).flatMap((raw) => {
                    const seed = toIndexedArray(raw ?? []);
                    const name = normalCase(seed[0] ?? "Seed");
                    const [first, last] = [toInt(seed[2], { min: 0 }), toInt(seed[3], { min: 0 })];
                    return Array.from({ length: Math.max(0, last - first + 1) }, (_, n) => ({
                        key: String(first + n),
                        name: `${name} ${n + 1}`,
                        path: `FarmCrop.h[${first + n}]`,
                        value: toNum(crops[first + n], 0),
                        float: true,
                        section: name,
                    }));
                })
            );
        },
    };
};

// ---- Market ------------------------------------------------------------------------------------------------------

const MARKET_SIZE = 8;
const MARKETS = [
    { name: "Day Market", mode: 0, first: 2 },
    { name: "Night Market", mode: 1, first: 10 },
];

const MarketPart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const nodes = MARKETS.map(() => div());
    const reconcilers = nodes.map(createStaticRowReconciler);

    const UpgradeRow = (upgrade) =>
        ClampedLevelRow({
            valueState: getLevelState(upgrade.path),
            writePath: `FarmUpg[${upgrade.path}]`,
            max: upgrade.max,
            integerMode: "round",
            name: upgrade.name,
            renderInfo: () => RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
            maxAction: true,
        });

    return {
        content: div(
            { class: "field-columns" },
            ...MARKETS.map((market, m) => AccountSection({ title: market.name, body: nodes[m] }))
        ),
        load: async () => {
            const [rawLevels, rawInfo, ...maxes] = await Promise.all([
                gga("FarmUpg"),
                readCList("MarketInfo"),
                ...MARKETS.map((market) =>
                    readComputedMany(
                        "farming",
                        "MarketMaxLV",
                        Array.from({ length: MARKET_SIZE }, (_, n) => [market.mode, n])
                    )
                ),
            ]);
            const levels = toIndexedArray(rawLevels ?? []);
            const info = toIndexedArray(rawInfo ?? []);
            MARKETS.forEach((market, m) => {
                const upgrades = Array.from({ length: MARKET_SIZE }, (_, n) => {
                    const result = maxes[m][n];
                    if (!result?.ok) throw new Error(result?.error || `Couldn't read the ${market.name}'s max levels`);
                    const def = toIndexedArray(info[market.mode * MARKET_SIZE + n] ?? []);
                    return {
                        path: market.first + n,
                        name: farmName(def[0] ?? `Upgrade ${n + 1}`),
                        bonus: bonusText(def[1]),
                        max: toInt(result.value, { min: 0 }),
                    };
                });
                reconcilers[m](upgrades.map((upgrade) => `${upgrade.name}:${upgrade.max}`).join("|"), () =>
                    upgrades.map(UpgradeRow)
                );
                upgrades.forEach(
                    (upgrade) => (getLevelState(upgrade.path).val = toInt(levels[upgrade.path], { min: 0 }))
                );
            });
        },
    };
};

// ---- Exotic Market -----------------------------------------------------------------------------------------------

const EXOTIC_FIRST = 20;
const LABELS_PATH = "Spelunk[50]";

const ExoticPart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const labelled = van.state([]);
    const owned = van.state(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    // The labels are one list in the game: a press saves after the one before it, from the list the game holds now.
    const inTurn = oneAtATime();

    const readLabels = async () => {
        const [indices, count] = await Promise.all([
            gga(LABELS_PATH),
            readComputed("menagerie", "OrganicLabelOwned", [0, 0]),
        ]);
        if (!Array.isArray(indices) || indices.some((n) => !Number.isSafeInteger(n) || n < 0))
            throw new Error("Couldn't read the Organic Labels");
        labelled.val = indices;
        owned.val = toInt(count, { min: 0 });
    };

    // An Organic Label: on or off with one press, saved at once. The game counts the labels you own; here a label
    // can go on any upgrade.
    const OrganicButton = (upgrade) => {
        const { status, run } = useWriteStatus();
        const failure = van.state("");
        const isOn = () => labelled.val.includes(upgrade.n);
        return span(
            { class: "row-toggle" },
            span({ class: "row-toggle__failure", role: "status" }, () => failure.val),
            ActionButton({
                label: "Organic",
                status,
                className: "row-toggle__button",
                keepEnabled: true,
                buttonProps: { "aria-pressed": () => String(isOn()), "aria-label": `${upgrade.name} organic` },
                onClick: () => {
                    const on = !isOn();
                    failure.val = "";
                    return run(
                        () =>
                            inTurn(async () => {
                                await readLabels();
                                if (labelled.val.includes(upgrade.n) === on) return { cancelled: true };
                                const next = on
                                    ? [...labelled.val, upgrade.n]
                                    : labelled.val.filter((n) => n !== upgrade.n);
                                await writeVerified(LABELS_PATH, next);
                                labelled.val = next;
                                // The game works its exotic bonuses out again from the labels.
                                await readComputed("farming", "ExoticBonusQTY", [-1, 0]).catch(() => {});
                            }),
                        { onError: (error) => (failure.val = saveFailureReason(error)) }
                    );
                },
            })
        );
    };

    const UpgradeRow = (upgrade) =>
        SimpleNumberRow({
            entry: {
                name: upgrade.name,
                path: `FarmUpg[${EXOTIC_FIRST + upgrade.n}]`,
                formatted: false,
                info: RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
            },
            valueState: getLevelState(upgrade.n),
            renderExtraActions: () => OrganicButton(upgrade),
        });

    return {
        content: div(
            { class: "field-columns" },
            AccountSection({
                title: "Upgrades",
                meta: span(() =>
                    owned.val || labelled.val.length ? `${labelled.val.length} of ${owned.val} Organic Labels used` : ""
                ),
                body: listNode,
            })
        ),
        load: async () => {
            const [rawLevels, rawInfo] = await Promise.all([gga("FarmUpg"), readCList("MarketExoticInfo")]);
            await readLabels();
            const levels = toIndexedArray(rawLevels ?? []);
            const upgrades = toIndexedArray(rawInfo ?? [])
                .map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    return { n, raw: String(def[0] ?? ""), name: farmName(def[0] ?? ""), bonus: bonusText(def[1]) };
                })
                // The game's placeholders for upgrades still to come.
                .filter((upgrade) => upgrade.raw && upgrade.raw !== "NAME_MAGNI");
            reconcileRows(upgrades.map((upgrade) => upgrade.raw).join("|"), () => upgrades.map(UpgradeRow));
            upgrades.forEach(
                (upgrade) => (getLevelState(upgrade.n).val = toInt(levels[EXOTIC_FIRST + upgrade.n], { min: 0 }))
            );
        },
    };
};

// ---- Land Rank ---------------------------------------------------------------------------------------------------

const RANK_PATH = "FarmRank[2]";
const RANK_COUNT = 20;
// The database is five columns wide; only the 5th column has a max level. No row has a Max button, so the values
// line up down the list (+ stops at the max).
const isFifthColumn = (n) => n % 5 === 4;

const LandRankPart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const UpgradeRow = (upgrade) => {
        const info = RowTitles({ bonus: upgrade.bonus, name: upgrade.name });
        if (upgrade.max === null)
            return SimpleNumberRow({
                entry: { name: upgrade.name, path: `${RANK_PATH}[${upgrade.n}]`, formatted: false, info },
                valueState: getLevelState(upgrade.n),
            });
        return ClampedLevelRow({
            valueState: getLevelState(upgrade.n),
            writePath: `${RANK_PATH}[${upgrade.n}]`,
            max: upgrade.max,
            integerMode: "round",
            name: upgrade.name,
            renderInfo: () => info,
        });
    };

    return {
        content: div({ class: "field-columns" }, listNode),
        load: async () => {
            const [rawLevels, rawNames, rawBonuses, rawMax] = await Promise.all([
                gga(RANK_PATH),
                readCList("NinjaInfo[34]"),
                readCList("NinjaInfo[35]"),
                readComputed("farming", "LandRank5thColumnMaxLV", [0, 0]),
            ]);
            const levels = toIndexedArray(rawLevels ?? []);
            const names = toIndexedArray(rawNames ?? []);
            const bonuses = toIndexedArray(rawBonuses ?? []);
            const max = toInt(rawMax, { min: 0 });
            const upgrades = Array.from({ length: RANK_COUNT }, (_, n) => ({
                n,
                name: normalCase(names[n] ?? `Upgrade ${n + 1}`),
                bonus: bonusText(bonuses[n]),
                max: isFifthColumn(n) ? max : null,
            }));
            reconcileRows(upgrades.map((upgrade) => `${upgrade.name}:${upgrade.max}`).join("|"), () =>
                upgrades.map(UpgradeRow)
            );
            upgrades.forEach((upgrade) => (getLevelState(upgrade.n).val = toInt(levels[upgrade.n], { min: 0 })));
        },
    };
};

// ---- Stickers ----------------------------------------------------------------------------------------------------

const StickersPart = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const [rawAmounts, rawNames] = await Promise.all([gga("Research[9]"), readCList("Research[23]")]);
            const amounts = toIndexedArray(rawAmounts ?? []);
            list.show(
                toIndexedArray(rawNames ?? [])
                    .map((raw, n) => ({ n, raw: String(raw ?? "") }))
                    // The game's placeholders for stickers still to come.
                    .filter((sticker) => sticker.raw && sticker.raw !== "Nonexistent_Sticker")
                    .map((sticker) => ({
                        key: String(sticker.n),
                        name: normalCase(sticker.raw),
                        path: `Research[9][${sticker.n}]`,
                        value: toInt(amounts[sticker.n], { min: 0 }),
                        formatted: false,
                    }))
            );
        },
    };
};

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "plots", label: "Plots", part: PlotsPart, keywords: ["Plot", "Land Plots", "Rank EXP"] },
    { id: "depot", label: "Crop Depot", part: CropDepotPart, keywords: ["Depo", "Crops", "Seeds"] },
    {
        id: "market",
        label: "Market",
        part: MarketPart,
        keywords: ["Markets", "Day Market", "Night Market", "Market Upgrades"],
    },
    { id: "exotic", label: "Exotic Market", part: ExoticPart, keywords: ["Exotic", "Organic Labels", "Organic"] },
    { id: "rank", label: "Land Rank", part: LandRankPart, keywords: ["Rank", "Land Rank Database"] },
    { id: "stickers", label: "Stickers", part: StickersPart, keywords: ["Sticker"] },
];

const FarmingTab = () => {
    const parts = new Map();
    const { loading, error, run } = useAccountLoad({ label: "Farming" });
    const load = () => run(() => loadParts(parts));
    for (const tab of TABS) parts.set(tab.id, tab.part());

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container farming-tab",
        title: "Farming",
        description: "Plots, crops, the markets, Land Rank and stickers.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading farming",
        errorTitle: "Couldn't read farming",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Farming",
                page: "w6.farming",
                // Six tabs: on a phone they take two rows instead of running off the side.
                wrap: true,
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: parts.get(tab.id).content })),
            })
        ),
    });
};

export default definePage({
    id: "w6.farming",
    world: 6,
    system: "Farming",
    description: "Plots, crops, the markets, Land Rank and stickers.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: FarmingTab,
});
