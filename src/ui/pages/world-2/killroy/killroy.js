/**
 * W2 - Killroy Tab
 *
 * OptionsListAccount fields used:
 *   [105]              -> Killroy skulls currency
 *   [106..111]         -> shop upgrade levels
 *   [112]              -> total finished runs
 *   [115]              -> airhorn reset toggle (0/1)
 *   [204]              -> highest killroy score on warrior
 *   [205]              -> highest killroy score on archer
 *   [206]              -> highest killroy score on mage
 *   [227]              -> 3rd weekly fight unlocked (0/1)
 *   [228..230]         -> times each Skull Shop boost was bought
 *   [467..470]         -> times each Skull Shop item was bought
 *
 * Tome label rows (name/label only):
 *   cList.Tome[27] -> warrior label row
 *   cList.Tome[28] -> archer label row
 *   cList.Tome[29] -> mage label row
 *
 * Best scores:
 *   KRbest.h[mobId] -> best kills for that mob
 *
 * Allowed mobs:
 *   cList.DeathNoteMobs -> arrays of mob ids; Killroy renders one row per mob id
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readGgaEntries, readCList } from "../../../services/api.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    normalCase,
    resolveValue,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div, span } = van.tags;

const CURRENCY_FIELDS = [{ index: 105, label: "Killroy skulls" }];

const SHOP_FIELDS = [
    { index: 106, label: "Timer level" },
    { index: 107, label: "Talent drops level" },
    { index: 108, label: "Bonus skulls level" },
    { index: 109, label: "Respawn level" },
    { index: 110, label: "Dungeon drops level" },
    { index: 111, label: "Pearl drops level" },
];

// The Skull Shop: how many times each boost and item was bought. [227] is a flag, so it's a switch.
const THIRD_FIGHT_INDEX = 227;
const SKULL_SHOP_FIELDS = [
    { index: 228, label: "Artifact find times bought" },
    { index: 229, label: "Crop evolution times bought" },
    { index: 230, label: "Jade gain times bought" },
    { index: 467, label: "Gallery items got" },
    { index: 468, label: "Masterclass times bought" },
    { index: 469, label: "W7 skill EXP times bought" },
    { index: 470, label: "W7 daily coral times bought" },
];

const RECORD_FIELDS = [{ index: 112, label: "Finished runs" }];

const PB_TOME_FIELDS = [
    { key: "melee", label: "Highest Killroy score on a warrior", scoreIndex: 204, tomeIndex: 27 },
    { key: "ranged", label: "Highest Killroy score on an archer", scoreIndex: 205, tomeIndex: 28 },
    { key: "magic", label: "Highest Killroy score on a mage", scoreIndex: 206, tomeIndex: 29 },
];

const AIRHORN_INDEX = 115;
const ALL_FIELD_DEFS = [
    ...CURRENCY_FIELDS,
    ...SHOP_FIELDS,
    { index: THIRD_FIGHT_INDEX },
    ...SKULL_SHOP_FIELDS,
    ...RECORD_FIELDS,
    { index: AIRHORN_INDEX },
];
const FIELD_INDEXES = Array.from(new Set(ALL_FIELD_DEFS.map((f) => f.index)));

const KillroyNumRow = ({ field, valueState, writePath }) => {
    const normalize = (raw) => {
        const trimmed = typeof raw === "string" ? raw.trim() : raw;
        if (trimmed === "" || trimmed === null || trimmed === undefined) return null;
        const parsed = Math.round(Number(trimmed));
        if (!Number.isFinite(parsed)) return null;
        if (field.allowNegative) return parsed;
        return Math.max(0, parsed);
    };
    const labelText = () => resolveValue(field?.label) ?? "";

    return EditableNumberRow({
        valueState,
        normalize,
        write: async (nextValue) => writeVerified(writePath, nextValue),
        renderInfo: () => span({ class: "account-row__name" }, labelText),
        adjustInput: (rawValue, delta, currentValue) => {
            const next = toNum(rawValue, toNum(currentValue, 0)) + delta;
            return field.allowNegative ? next : Math.max(0, next);
        },
    });
};

// An on/off value of OptionsListAccount (the airhorn reset, the 3rd weekly fight): one switch that saves on flip.
const KillroySwitchRow = ({ index, label, words, valueState }) => {
    const { status, run } = useWriteStatus();

    const doToggle = async (on) => {
        const next = on ? 1 : 0;
        return run(async () => {
            const path = `OptionsListAccount[${index}]`;
            await writeVerified(path, next);
            valueState.val = next;
        });
    };

    return AccountRow({
        status,
        info: span({ class: "account-row__name" }, label),
        controls: StateSwitch({
            checked: () => toNum(valueState.val, 0) !== 0,
            words,
            name: label,
            status, // nothing else on the row reads out saving and saved
            onFlip: doToggle,
        }),
    });
};

const KillroyTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Killroy" });
    const bestMobRowsNode = div({ class: "account-page-pane" });

    const valueStates = new Map(FIELD_INDEXES.map((idx) => [idx, van.state(0)]));
    const pbScoreStates = new Map(PB_TOME_FIELDS.map((f) => [f.key, van.state(0)]));
    const pbLabelStates = new Map(PB_TOME_FIELDS.map((f) => [f.key, van.state(f.label)]));
    const bestMobStates = new Map();
    const reconcileBestMobRows = createStaticRowReconciler(bestMobRowsNode);

    const getState = (index) => valueStates.get(index);
    const getPbState = (key) => pbScoreStates.get(key);
    const getPbLabelState = (key) => pbLabelStates.get(key);
    const getBestMobState = (mobId) => {
        if (!bestMobStates.has(mobId)) bestMobStates.set(mobId, van.state(0));
        return bestMobStates.get(mobId);
    };

    const load = async () =>
        run(async () => {
            const optionKeys = Array.from(
                new Set([...FIELD_INDEXES, ...PB_TOME_FIELDS.map((f) => f.scoreIndex)].map((idx) => String(idx)))
            );

            const [rawOptionValues, rawTome, rawBestByMob] = await Promise.all([
                readGgaEntries("OptionsListAccount", optionKeys),
                readCList("Tome"),
                gga("KRbest.h"),
            ]);
            const tomeRows = toIndexedArray(rawTome);
            const nextFieldValues = new Map(
                FIELD_INDEXES.map((idx) => [idx, toNum(rawOptionValues?.[String(idx)], 0)])
            );
            const nextPbScores = new Map(
                PB_TOME_FIELDS.map((f) => [f.key, toNum(rawOptionValues?.[String(f.scoreIndex)], 0)])
            );
            const nextPbLabels = new Map(
                PB_TOME_FIELDS.map((f) => {
                    const row = tomeRows[f.tomeIndex];
                    const arr = Array.isArray(row) ? row : Object.values(row ?? {});
                    const labelRaw = arr.find((x) => typeof x === "string" && x.trim().length > 0);
                    const label =
                        typeof labelRaw === "string" && labelRaw.trim().length > 0 ? normalCase(labelRaw) : f.label;
                    return [f.key, label];
                })
            );

            const rawBestByMobMap = new Map(
                Object.entries(rawBestByMob ?? {})
                    .filter(([mobKey]) => mobKey && mobKey !== "__proto__")
                    .map(([mobKey, kills]) => [mobKey, toNum(kills, 0)])
            );

            const rawDeathNoteMobs = await readCList("DeathNoteMobs");
            const seenMobIds = new Set();
            const allowedMobIds = [];
            for (const mobGroup of toIndexedArray(rawDeathNoteMobs)) {
                for (const mobId of toIndexedArray(mobGroup)) {
                    if (typeof mobId !== "string" || mobId.trim().length === 0) continue;
                    if (seenMobIds.has(mobId)) continue;
                    seenMobIds.add(mobId);
                    allowedMobIds.push(mobId);
                }
            }

            const allowedMobDefs =
                allowedMobIds.length > 0
                    ? await readGgaEntries("MonsterDefinitionsGET.h", allowedMobIds, ["Name"])
                    : {};
            const nextAllowedMobs = allowedMobIds.map((mobId) => {
                const rawName = allowedMobDefs?.[mobId]?.Name;
                return {
                    mobId,
                    mobName: typeof rawName === "string" && rawName.length > 0 ? cleanName(rawName) : mobId,
                };
            });

            for (const idx of FIELD_INDEXES) {
                const st = getState(idx);
                if (st) st.val = nextFieldValues.get(idx) ?? 0;
            }
            for (const f of PB_TOME_FIELDS) {
                const scoreState = getPbState(f.key);
                if (scoreState) scoreState.val = nextPbScores.get(f.key) ?? 0;
                const labelState = getPbLabelState(f.key);
                if (labelState) labelState.val = nextPbLabels.get(f.key) ?? f.label;
            }

            for (const mob of nextAllowedMobs) {
                getBestMobState(mob.mobId).val = rawBestByMobMap.get(mob.mobId) ?? 0;
            }

            reconcileBestMobRows(nextAllowedMobs.map((mob) => `${mob.mobId}:${mob.mobName}`).join("|"), () => {
                return nextAllowedMobs.map((mob) =>
                    KillroyNumRow({
                        field: { label: mob.mobName },
                        valueState: getBestMobState(mob.mobId),
                        writePath: `KRbest.h[${mob.mobId}]`,
                    })
                );
            });
        });

    load();
    const numRows = (fields) =>
        fields.map((field) =>
            KillroyNumRow({ field, valueState: getState(field.index), writePath: `OptionsListAccount[${field.index}]` })
        );
    // The game's parts are tabs: the shop and its skulls, the Skull Shop, the records, and the best kills by mob.
    const tabs = [
        {
            id: "shop",
            label: "Shop",
            content: div(
                { class: "account-page-pane" },
                ...numRows(CURRENCY_FIELDS),
                KillroySwitchRow({
                    index: AIRHORN_INDEX,
                    label: "Airhorn reset",
                    words: ["On", ""],
                    valueState: getState(AIRHORN_INDEX),
                }),
                ...numRows(SHOP_FIELDS)
            ),
        },
        {
            id: "skull-shop",
            label: "Skull Shop",
            content: div(
                { class: "account-page-pane" },
                KillroySwitchRow({
                    index: THIRD_FIGHT_INDEX,
                    label: "3rd weekly fight",
                    words: ["Unlocked", ""],
                    valueState: getState(THIRD_FIGHT_INDEX),
                }),
                ...numRows(SKULL_SHOP_FIELDS)
            ),
        },
        {
            id: "records",
            label: "Records",
            content: div(
                { class: "account-page-pane" },
                ...numRows(RECORD_FIELDS),
                ...PB_TOME_FIELDS.map((field) =>
                    KillroyNumRow({
                        field: { ...field, label: getPbLabelState(field.key) },
                        valueState: getPbState(field.key),
                        writePath: `OptionsListAccount[${field.scoreIndex}]`,
                    })
                )
            ),
        },
        { id: "best-kills", label: "Best kills", content: bestMobRowsNode },
    ];

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Killroy",
        description: "Killroy's skulls, shop, records and best kills.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading Killroy",
        errorTitle: "Couldn't read Killroy",
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, TabbedList({ name: "Killroy", tabs })),
    });
};

export default definePage({
    id: "w2.killroy",
    world: 2,
    system: "Killroy",
    description: "Killroy skulls, shop upgrades, best scores and bonuses.",
    keywords: ["Skulls", "Skull Shop", "Best kills", "Airhorn"],
    component: KillroyTab,
});
