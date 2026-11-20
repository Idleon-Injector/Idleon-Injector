/**
 * W1 - Statues Tab
 *
 * Data sources:
 *   cList.StatueInfo[i]  -> [name, bonusDesc, ...]
 *   gga.StatueLevels[i]  -> [level, deposited]
 *   gga.StatueG[i]       -> tier: 0=Stone, 1=Gold, 2=Onyx, 3=Zenith
 *   gga.RoyalG[22][i]   -> Statue Flair level: 0..4
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableFieldsRow, StackedNumberField } from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    resolveFormattedIntInput,
    toInt,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span, select, option, button } = van.tags;

const TIERS = [
    { value: 0, label: "Stone" },
    { value: 1, label: "Gold" },
    { value: 2, label: "Onyx" },
    { value: 3, label: "Zenith" },
];

const TIER_ROW_CLASSES = ["", "tier--gold", "tier--onyx", "tier--zenith"];
const TIER_BADGE_CLASSES = ["stone", "gold", "onyx", "zenith"];
const FLAIR_MAX_LEVEL = 4;
const FLAIR_UNLOCK_PATH = "RoyalG[2][78]";

const statueValues = (levels, tier, flair) => ({
    level: toInt(levels?.[0]),
    deposited: toInt(levels?.[1]),
    tier: Math.min(TIERS.length - 1, toInt(tier, { min: 0 })),
    flair: toInt(flair, { min: 0 }),
});

const StatueRow = ({ index, nameState, levelState, depositedState, tierState, flairState }) =>
    EditableFieldsRow({
        fields: [
            {
                key: "level",
                label: "Level",
                valueState: levelState,
                rootClass: "statue-control-row",
                labelClass: "statue-control-label",
            },
            {
                key: "deposited",
                label: "Deposited",
                valueState: depositedState,
                formatted: true,
                rootClass: "statue-control-row",
                labelClass: "statue-control-label",
            },
            { key: "tier", valueState: tierState, toDraft: (value) => toInt(value, { min: 0 }) },
            { key: "flair", valueState: flairState },
        ],
        normalize: ({ level, deposited, tier, flair }) => {
            const rawLevel = Number(level);
            const rawFlair = Number(flair);
            const nextDeposited =
                String(deposited).trim() === largeFormatter(depositedState.val)
                    ? depositedState.val
                    : resolveFormattedIntInput(deposited, null, { min: 0 });
            if (Number.isNaN(rawLevel) || nextDeposited === null || !Number.isFinite(rawFlair)) return null;

            return {
                level: toInt(rawLevel, { min: 0 }),
                deposited: nextDeposited,
                tier: Math.min(TIERS.length - 1, toInt(tier, { min: 0 })),
                flair: Math.min(FLAIR_MAX_LEVEL, toInt(rawFlair, { min: 0 })),
            };
        },
        // Only the fields the player changed are written, so what the game gained since the page read it (deposits,
        // a tier) stays; the row then shows what the game holds.
        write: async (next) => {
            const stored = { level: levelState, deposited: depositedState, tier: tierState, flair: flairState };
            const paths = {
                level: `StatueLevels[${index}][0]`,
                deposited: `StatueLevels[${index}][1]`,
                tier: `StatueG[${index}]`,
                flair: `RoyalG[22][${index}]`,
            };
            const read = async () =>
                statueValues(
                    ...(await Promise.all([gga(`StatueLevels[${index}]`), gga(paths.tier), gga(paths.flair)]))
                );
            try {
                await writeManyVerified(
                    Object.keys(paths)
                        .filter((key) => next[key] !== stored[key].val)
                        .map((key) => ({ path: paths[key], value: next[key] }))
                );
            } catch (error) {
                const now = await read().catch(() => null);
                if (now) Object.keys(stored).forEach((key) => (stored[key].val = now[key]));
                throw error;
            }
            return read();
        },
        rowClass: () => `account-row--wide-controls statue-row ${TIER_ROW_CLASSES[tierState.val] ?? ""}`,
        info: [
            span({ class: "account-row__name" }, () => nameState.val),
            span(
                {
                    class: () => `statue-tier-badge tier--${TIER_BADGE_CLASSES[tierState.val] ?? "stone"}`,
                },
                () => TIERS[tierState.val]?.label ?? "Stone"
            ),
        ],
        badge: () => `LV ${levelState.val} · FLAIR ${flairState.val} / ${FLAIR_MAX_LEVEL}`,
        renderControls: ({ draftStates, getDraftValue, resetDraft, setFieldFocused }) =>
            div(
                { class: "account-row__controls--stack" },
                StackedNumberField({
                    field: {
                        key: "level",
                        label: "Level",
                        rootClass: "statue-control-row",
                        labelClass: "statue-control-label",
                    },
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                StackedNumberField({
                    field: {
                        key: "deposited",
                        label: "Deposited",
                        formatted: true,
                        rootClass: "statue-control-row",
                        labelClass: "statue-control-label",
                    },
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                div(
                    { class: "statue-control-row" },
                    span({ class: "statue-control-label" }, "Tier"),
                    select(
                        {
                            class: "statue-tier-select select-base",
                            onchange: (e) => (draftStates.tier.val = Number(e.target.value)),
                        },
                        ...TIERS.map((tier) =>
                            option(
                                {
                                    value: tier.value,
                                    selected: () => draftStates.tier.val === tier.value,
                                },
                                tier.label
                            )
                        )
                    )
                ),
                StackedNumberField({
                    field: {
                        key: "flair",
                        label: "Flair",
                        min: 0,
                        max: FLAIR_MAX_LEVEL,
                        rootClass: "statue-control-row",
                        labelClass: "statue-control-label",
                        inputProps: { "aria-label": `Statue #${index} flair level` },
                    },
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                })
            ),
    });

const StatuesTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Statues" });

    const nameStates = new Map();
    const levelStates = new Map();
    const depositedStates = new Map();
    const tierStates = new Map();
    const flairStates = new Map();
    const flairUnlocked = van.state(false);
    const flairToggleError = van.state("");
    const { status: flairToggleStatus, run: runFlairToggle } = useWriteStatus();

    const listNode = div({ class: "account-list" });
    const reconcileStatueRows = createStaticRowReconciler(listNode);

    const reconcileRows = (info) => {
        const statues = (info ?? [])
            .map((entry, index) => ({ index, name: entry?.[0] }))
            .filter((statue) => statue.name && statue.name.trim().length > 0);

        reconcileStatueRows(statues.map((statue) => statue.index).join(","), () => {
            return statues.map((statue) =>
                StatueRow({
                    index: statue.index,
                    nameState: getOrCreateState(nameStates, statue.index, statue.name),
                    levelState: getOrCreateState(levelStates, statue.index),
                    depositedState: getOrCreateState(depositedStates, statue.index),
                    tierState: getOrCreateState(tierStates, statue.index),
                    flairState: getOrCreateState(flairStates, statue.index),
                })
            );
        });
    };

    const load = async () =>
        run(async () => {
            const [rawInfo, rawLevels, rawTiers, rawFlair, rawFlairUnlock] = await Promise.all([
                readCList("StatueInfo"),
                gga("StatueLevels"),
                gga("StatueG"),
                gga("RoyalG[22]"),
                gga(FLAIR_UNLOCK_PATH),
            ]);
            const info = toIndexedArray(rawInfo);
            const levels = toIndexedArray(rawLevels);
            const tiers = toIndexedArray(rawTiers);
            const flair = toIndexedArray(rawFlair);
            flairUnlocked.val = Number(rawFlairUnlock) >= 1;

            info.forEach((entry, i) => {
                if (!entry?.[0] || !entry[0].trim()) return;

                const values = statueValues(levels?.[i], tiers?.[i], flair[i]);
                getOrCreateState(nameStates, i, entry[0]).val = entry[0];
                getOrCreateState(levelStates, i).val = values.level;
                getOrCreateState(depositedStates, i).val = values.deposited;
                getOrCreateState(tierStates, i).val = values.tier;
                getOrCreateState(flairStates, i).val = values.flair;
            });

            reconcileRows(info);
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container statues-tab",
        title: "STATUES",
        description: "Set statue levels, deposited amounts, tiers, and Statue Flair levels.",
        actions: [
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm",
                    "aria-label": "Toggle Statue Flair unlock",
                    "aria-pressed": () => String(flairUnlocked.val),
                    disabled: () => loading.val || flairToggleStatus.val === "loading",
                    onclick: () => {
                        if (flairToggleStatus.val === "loading") return;
                        const nextLevel = flairUnlocked.val ? 0 : 1;
                        flairToggleError.val = "";
                        void runFlairToggle(
                            async () => {
                                await writeVerified(FLAIR_UNLOCK_PATH, nextLevel);
                                flairUnlocked.val = nextLevel === 1;
                                await deleteGga("DNSM.h.rArmoryTotLV");
                            },
                            { onError: (error) => (flairToggleError.val = error.message) }
                        );
                    },
                },
                () => `Flair: ${flairUnlocked.val ? "on" : "off"}`
            ),
            RefreshButton({
                onRefresh: load,
                tooltip: "Re-read statue data from game memory",
                disabled: () => loading.val || flairToggleStatus.val === "loading",
            }),
        ],
        topNotices: WarningBanner(
            div(
                div(
                    " Tier upgrades require specific tools: ",
                    span({ class: "warning-highlight-accent" }, "Guilding Tools"),
                    " for Gold, ",
                    span({ class: "warning-highlight-onyx" }, "Onyx Tools"),
                    " for Onyx, ",
                    span({ class: "warning-highlight-zenith" }, "Zenith Tools"),
                    " for Zenith. Note that this is only visual to the StatueMan in W1; when set to any rarity it will give their full bonus"
                ),
                div(() =>
                    flairUnlocked.val
                        ? `Statue Flair is unlocked. Flair levels range from 0 to ${FLAIR_MAX_LEVEL}.`
                        : "Statue Flair is locked. Use the Flair toggle to unlock the in-game menu."
                ),
                div("Turning Flair off keeps saved Flair levels and their bonuses."),
                div({ role: "alert" }, () => flairToggleError.val)
            )
        ),
        state: { loading, error },
        loadingText: "READING STATUES",
        errorTitle: "STATUES READ FAILED",
        initialWrapperClass: "account-list",
        body: listNode,
    });
};

export default definePage({
    id: "w1.statues",
    world: 1,
    system: "Statues",
    description: "Statue levels, deposits, tiers and Statue Flair.",
    keywords: ["Statue Flair", "Tiers"],
    component: StatuesTab,
});
