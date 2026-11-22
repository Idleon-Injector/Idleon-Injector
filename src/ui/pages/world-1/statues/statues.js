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
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableFieldsRow, StackedNumberField } from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { SetAllNumberControl, refuseSetAll } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    NO_CHARACTER,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    readCharacterInPlay,
    resolveFormattedIntInput,
    resolveNumberInput,
    runBulkSet,
    toInt,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// A tier names a thing, so the picked one shows in its own colour (`tone`).
const TIERS = [
    { value: 0, label: "Stone", tone: "stone" },
    { value: 1, label: "Gold", tone: "gold" },
    { value: 2, label: "Onyx", tone: "onyx" },
    { value: 3, label: "Zenith", tone: "zenith" },
];
const FLAIR_MAX_LEVEL = 4;
const FLAIR_UNLOCK_PATH = "RoyalG[2][78]";

// The game writes statue names and bonuses in capitals (THICC_SKIN, %@MOVE_SPEED); the page shows them in normal case
// ("Thicc Skin"), keeping EXP in capitals as the game writes it everywhere else.
const normalCase = (text) =>
    text
        .toLowerCase()
        .replace(/(^|\s)\S/g, (start) => start.toUpperCase())
        .replace(/\bExp\b/g, "EXP");
const statueName = (raw) => normalCase(cleanName(raw));

// A statue's bonus in the game's words: "%@MOVE_SPEED" -> "Move Speed %", "@BASE_DAMAGE" -> "Base Damage". The number
// is the game's (levels, tiers and more), so only the words show.
const statueBonus = (pattern = "") => {
    const words = normalCase(pattern.replace(/[%@]/g, "").replace(/_/g, " ").trim());
    return words && pattern.startsWith("%") ? `${words} %` : words;
};

const statueValues = (levels, tier, flair) => ({
    level: toInt(levels?.[0]),
    deposited: toInt(levels?.[1]),
    tier: Math.min(TIERS.length - 1, toInt(tier, { min: 0 })),
    flair: toInt(flair, { min: 0 }),
});

// One statue per line: the name, then Level, Deposited, Tier and Flair in the list's columns. The column head says each
// name once, so the fields carry their names for screen readers only (and show them on a phone, where there's no head).
const StatueRow = ({ index, nameState, bonus, levelState, depositedState, tierState, flairState, getCharacter }) => {
    const name = nameState.val;
    const cell = (key, label, extra = {}) => ({
        key,
        label,
        rootClass: "statue-cell",
        labelClass: "statue-cell__label",
        ...extra,
        inputProps: { "aria-label": `${name} ${label.toLowerCase()}`, ...(extra.inputProps ?? {}) },
    });
    return EditableFieldsRow({
        fields: [
            { key: "level", valueState: levelState },
            { key: "deposited", valueState: depositedState, formatted: true },
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
                // StatueLevels is the character in play's own: the game writes only while that is still the one read.
                await writeManyVerified(
                    Object.keys(paths)
                        .filter((key) => next[key] !== stored[key].val)
                        .map((key) => ({ path: paths[key], value: next[key] })),
                    { character: getCharacter() }
                );
            } catch (error) {
                // What the game holds now, only while the row's character is still the one in play: another one's
                // values (a save refused because the character changed) stay out of these rows.
                const now = await readCharacterInPlay(getCharacter())
                    .then(async () => {
                        const values = await read();
                        await readCharacterInPlay(getCharacter());
                        return values;
                    })
                    .catch(() => null);
                if (now) Object.keys(stored).forEach((key) => (stored[key].val = now[key]));
                throw error;
            }
            return read();
        },
        rowClass: "statue-row",
        info: [RowTitles({ bonus, name: () => nameState.val })],
        renderControls: ({ draftStates, getDraftValue, resetDraft, setFieldFocused, applyValue }) =>
            div(
                { class: "statue-cells" },
                StackedNumberField({
                    field: cell("level", "Level"),
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                StackedNumberField({
                    field: cell("deposited", "Deposited", {
                        formatted: true,
                        rootClass: "statue-cell statue-cell--quiet",
                    }),
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                // A tier saves on the press, like − / +.
                div(
                    { class: "statue-cell" },
                    span({ class: "statue-cell__label" }, "Tier"),
                    StepPicker({
                        name: `${name} tier`,
                        steps: TIERS,
                        picked: () => toInt(draftStates.tier.val, { min: 0 }),
                        onPick: (tier) => void applyValue({ tier }),
                    })
                ),
                StackedNumberField({
                    field: cell("flair", "Flair", {
                        min: 0,
                        max: FLAIR_MAX_LEVEL,
                        inputProps: { cap: FLAIR_MAX_LEVEL },
                    }),
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                })
            ),
    });
};

const StatuesTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Statues" });
    // The character the page read: its saves go to it only while it is in play, and none go before a read.
    let character;
    const getCharacter = () => {
        if (character === undefined) throw new Error(NO_CHARACTER);
        return character;
    };

    const nameStates = new Map();
    const levelStates = new Map();
    const depositedStates = new Map();
    const tierStates = new Map();
    const flairStates = new Map();
    const flairUnlocked = van.state(false);
    // The statues the game lists, by index, and each one's row. The tray's tools act on the ones the top bar's search
    // shows (all of them without a search).
    const statueIndices = van.state([]);
    const rowOf = new Map();
    const shownIndices = () => statueIndices.val.filter((index) => shownBySearch(rowOf.get(index)));

    const rowsNode = div({ class: "statue-rows" });
    const reconcileStatueRows = createStaticRowReconciler(rowsNode);

    const reconcileRows = (info) => {
        const statues = (info ?? [])
            .map((entry, index) => ({ index, name: entry?.[0], bonus: statueBonus(entry?.[1]) }))
            .filter((statue) => statue.name && statue.name.trim().length > 0);
        statueIndices.val = statues.map((statue) => statue.index);

        reconcileStatueRows(statues.map((statue) => statue.index).join(","), () => {
            return statues.map((statue) => {
                const row = StatueRow({
                    index: statue.index,
                    bonus: statue.bonus,
                    nameState: getOrCreateState(nameStates, statue.index, statueName(statue.name)),
                    levelState: getOrCreateState(levelStates, statue.index),
                    depositedState: getOrCreateState(depositedStates, statue.index),
                    tierState: getOrCreateState(tierStates, statue.index),
                    flairState: getOrCreateState(flairStates, statue.index),
                    getCharacter,
                });
                rowOf.set(statue.index, row);
                return row;
            });
        });
    };

    const load = async () =>
        run(async () => {
            const loadedCharacter = await readCharacterInPlay();
            const [rawInfo, rawLevels, rawTiers, rawFlair, rawFlairUnlock] = await Promise.all([
                readCList("StatueInfo"),
                gga("StatueLevels"),
                gga("StatueG"),
                gga("RoyalG[22]"),
                gga(FLAIR_UNLOCK_PATH),
            ]);
            // Still the same character once the reads are in, so an edit saves for the one whose values it shows.
            await readCharacterInPlay(loadedCharacter);
            character = loadedCharacter;
            const info = toIndexedArray(rawInfo);
            const levels = toIndexedArray(rawLevels);
            const tiers = toIndexedArray(rawTiers);
            const flair = toIndexedArray(rawFlair);
            flairUnlocked.val = Number(rawFlairUnlock) >= 1;

            info.forEach((entry, i) => {
                if (!entry?.[0] || !entry[0].trim()) return;

                const values = statueValues(levels?.[i], tiers?.[i], flair[i]);
                getOrCreateState(nameStates, i).val = statueName(entry[0]);
                getOrCreateState(levelStates, i).val = values.level;
                getOrCreateState(depositedStates, i).val = values.deposited;
                getOrCreateState(tierStates, i).val = values.tier;
                getOrCreateState(flairStates, i).val = values.flair;
            });

            reconcileRows(info);
        });

    // Statue Flair is unlocked in the game by one value; off keeps the saved Flair levels and their bonuses.
    const flairSwitch = StateSwitch({
        checked: flairUnlocked,
        words: ["", ""],
        name: "Statue Flair unlocked",
        ownStatus: true,
        disabled: () => loading.val,
        onFlip: async (on) => {
            await writeVerified(FLAIR_UNLOCK_PATH, on ? 1 : 0);
            flairUnlocked.val = on;
            await deleteGga("DNSM.h.rArmoryTotLV");
            return { ok: true };
        },
    });

    // The column head stays at the top of the list while it scrolls; the Flair switch sits in its column.
    const columnHead = div(
        { class: "account-row account-row--head statue-head" },
        div({ class: "account-row__info" }, span({ class: "statue-head__label" }, "Statue")),
        div(
            { class: "account-row__controls" },
            div(
                { class: "statue-cells" },
                span({ class: "statue-head__label" }, "Level"),
                span({ class: "statue-head__label" }, "Deposited"),
                span({ class: "statue-head__label" }, "Tier"),
                div({ class: "statue-head__label statue-head__flair" }, span("Flair"), flairSwitch)
            )
        )
    );

    // The tray's tools act on the statues shown. They share one status, so a bulk write runs alone; lowering asks first.
    const bulk = useWriteStatus();
    const setAllInput = van.state("");
    const statueWord = (n) => `statue${n === 1 ? "" : "s"}`;
    const writeAll = (pathOf, states, target) =>
        bulk.run(() =>
            runBulkSet({
                // StatueLevels is the character in play's own, as in a row's save.
                character: getCharacter(),
                entries: shownIndices(),
                getTargetValue: () => target,
                getValueState: (index) => states.get(index),
                getPath: (index) => pathOf(index),
            })
        );
    const countAbove = (states, target) => shownIndices().filter((index) => states.get(index).val > target).length;
    const allAt = (states, target) => shownIndices().every((index) => states.get(index).val === target);

    const tools = (_activeId, ask) => {
        const askOrRun = ({ lowered, question, from, change }) => {
            if (!lowered) return void change();
            ask({ question, confirmLabel: lowered === 1 ? "Lower it" : "Lower them", from, onConfirm: change });
        };

        const levelControl = SetAllNumberControl({
            label: "",
            placeholder: "Level",
            value: setAllInput,
            status: bulk.status,
            onApply: () => {
                const level = resolveNumberInput(setAllInput.val, { min: 0, fallback: null });
                if (level === null) return refuseSetAll(setAllInput);
                const lowered = countAbove(levelStates, level);
                return askOrRun({
                    lowered,
                    question: `Lower ${lowered} ${statueWord(lowered)} to level ${level}?`,
                    from: levelControl.querySelector(".account-btn"),
                    change: () => writeAll((index) => `StatueLevels[${index}][0]`, levelStates, level),
                });
            },
        });

        const tierButtons = TIERS.map((tier) => {
            const tierButton = ActionButton({
                label: tier.label,
                status: bulk.status,
                className: `statue-tier-all--${tier.tone}`,
                disabled: () => !shownIndices().length || allAt(tierStates, tier.value),
                onClick: (e) => {
                    e.preventDefault();
                    const lowered = countAbove(tierStates, tier.value);
                    askOrRun({
                        lowered,
                        question: `Lower ${lowered} ${statueWord(lowered)} to ${tier.label}?`,
                        from: tierButton,
                        change: () => writeAll((index) => `StatueG[${index}]`, tierStates, tier.value),
                    });
                },
            });
            return tierButton;
        });

        return [
            levelControl,
            div(
                { class: "tabbed-list__tool-group" },
                span(
                    { class: "tabbed-list__tool-label" },
                    "Tier",
                    span({ class: "tabbed-list__tool-label-more" }, " for all")
                ),
                ...tierButtons
            ),
            div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Max Flair",
                    status: bulk.status,
                    disabled: () => !shownIndices().length || allAt(flairStates, FLAIR_MAX_LEVEL),
                    onClick: (e) => {
                        e.preventDefault();
                        void writeAll((index) => `RoyalG[22][${index}]`, flairStates, FLAIR_MAX_LEVEL);
                    },
                })
            ),
        ];
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container statues-tab page--wide",
        title: "Statues",
        description: "Levels, deposits, tiers and Flair. A tier set here gives its full bonus, no tools needed.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading statues",
        errorTitle: "Statues read failed",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "statue-table",
                body: [columnHead, rowsNode],
                tools,
                toolsLabel: () => {
                    const n = shownIndices().length;
                    return isSearching() ? `${n} matching ${statueWord(n)}` : `All ${n} ${statueWord(n)}`;
                },
            })
        ),
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
