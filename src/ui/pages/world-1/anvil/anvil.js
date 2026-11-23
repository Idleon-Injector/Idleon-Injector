/**
 * W1 - Anvil Tab
 *
 * AnvilPAstats layout:
 *   [0] = points left  (the game works it out only while the Anvil's Produce tab is open; the page works it out
 *                       itself with anvilPointsLeft and shows it beside the title)
 *   [1] = Points bought with money        (max 600)
 *   [2] = Points bought with monster parts (max 700)
 *   [3] = Bonus Exp  (allocated)
 *   [4] = Speed/hr   (allocated)
 *   [5] = Capacity   (allocated)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readComputed } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AmountLeft, RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { NO_CHARACTER, readCharacterInPlay, writeVerified } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const CATEGORIES = [
    { label: "Money Points", index: 1, max: 600 },
    { label: "Monster Part Points", index: 2, max: 700 },
    { label: "Bonus Exp", index: 3, max: null },
    { label: "Speed/hr", index: 4, max: null },
    { label: "Capacity", index: 5, max: null },
];

const asNumber = (value) =>
    typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;

/**
 * Points left, the way the game works them out (ActorEvents_124, while the Anvil's Produce tab is open):
 * Smithing level + SkillLevels[281] + talent 281's number × floor(Smithing level / 10) + [1] + [2] − ([3] + [4] + [5]).
 * The game never stops overspending, so the result can be below zero. Null when an input isn't a number.
 */
export const anvilPointsLeft = ({ smithingLevel, talentLevel, talentNumber, stats = [] }) => {
    const values = [smithingLevel, talentLevel, talentNumber, ...[1, 2, 3, 4, 5].map((i) => stats[i])].map(asNumber);
    if (!values.every(Number.isFinite)) return null;
    const [level, talent, perTen, money, parts, exp, speed, capacity] = values;
    return level + talent + perTen * Math.floor(level / 10) + money + parts - (exp + speed + capacity);
};

const clampCategoryValue = (category, value) => Math.max(0, Math.min(category.max ?? Infinity, value));

const AnvilRow = ({ category, valueState, getCharacter, onWriteApplied }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => {
            const raw = Number(rawValue);
            if (Number.isNaN(raw)) return null;
            return clampCategoryValue(category, raw);
        },
        write: async (nextValue) => {
            const path = `AnvilPAstats[${category.index}]`;
            // AnvilPAstats is the character in play's own: the game writes it only while that is still the one read.
            const verified = await writeVerified(path, nextValue, { character: getCharacter() });
            await onWriteApplied();
            return verified;
        },
        renderInfo: () => [span({ class: "account-row__name" }, category.label)],
        cap: category.max,
        adjustInput: (rawValue, delta, currentValue) => {
            const base = Number(rawValue);
            const next = Number.isFinite(base) ? base : Number(currentValue ?? 0);
            return clampCategoryValue(category, next + delta);
        },
        maxAction: category.max !== null ? { value: category.max } : null,
        resetAction: category.max === null ? {} : null,
    });

const AnvilTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Anvil" });
    const statStates = Array.from({ length: 6 }, () => van.state(0));
    // The character the page read: its saves go to it only while it is in play, and none go before a read.
    let character;
    const getCharacter = () => {
        if (character === undefined) throw new Error(NO_CHARACTER);
        return character;
    };
    // The formula's other inputs, read with the stats; null until read, or when one couldn't be.
    const formulaInputs = van.state(null);

    const readFormulaInputs = async () => {
        const [level, talent, perTen] = await Promise.allSettled([
            gga("Lv0[2]"),
            gga("SkillLevels[281]"),
            // "1" is the game's own first argument: GetTalentNumber(1, 281).
            readComputed("talent", "1", [281]),
        ]);
        const read = (result) => (result.status === "fulfilled" ? result.value : null);
        return { smithingLevel: read(level), talentLevel: read(talent), talentNumber: read(perTen) };
    };

    const load = async () =>
        run(async () => {
            const loadedCharacter = await readCharacterInPlay();
            const [raw, inputs] = await Promise.all([gga("AnvilPAstats"), readFormulaInputs()]);
            const arr = toIndexedArray(raw);
            // Still the same character once the reads are in, so an edit saves for the one whose values it shows.
            await readCharacterInPlay(loadedCharacter);
            character = loadedCharacter;
            for (let i = 0; i < statStates.length; i++) {
                statStates[i].val = Number(arr[i] ?? 0);
            }
            formulaInputs.val = inputs;
        });

    // Worked out from the page's own values, so it follows every change at once; the game's [0] when it can't be.
    const pointsLeft = () =>
        (formulaInputs.val && anvilPointsLeft({ ...formulaInputs.val, stats: statStates.map((state) => state.val) })) ??
        statStates[0].val;

    const refreshRemainingPoints = async () => {
        try {
            const remainingRaw = await gga("AnvilPAstats[0]");
            const remaining = Number(remainingRaw);
            if (Number.isFinite(remaining)) statStates[0].val = remaining;
        } catch (err) {
            console.warn("[AnvilTab] refreshRemainingPoints failed", err);
        }
    };

    load();

    const rows = (capped) =>
        CATEGORIES.filter((cat) => (cat.max !== null) === capped).map((cat) =>
            AnvilRow({
                category: cat,
                valueState: statStates[cat.index],
                getCharacter,
                onWriteApplied: refreshRemainingPoints,
            })
        );

    // One panel like every list, its two groups under quiet headings. Fields with and without a cap share it, so it
    // keeps their values and − / + in columns.
    const body = div(
        { class: "account-list account-list--tabbed" },
        ListPanel({
            className: "field-columns",
            body: [
                AccountSection({ title: "Points", body: rows(true) }),
                AccountSection({ title: "Spent on", body: rows(false) }),
            ],
        })
    );

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Anvil",
        description: "Spend your anvil points.",
        total: AmountLeft({ value: pointsLeft }),
        actions: RefreshButton({
            onRefresh: load,
            tooltip: "Re-read anvil stats from game memory",
        }),
        state: { loading, error },
        loadingText: "Reading the anvil",
        errorTitle: "Couldn't read the anvil",
        initialWrapperClass: "account-list",
        body,
    });
};

export default definePage({
    id: "w1.anvil",
    world: 1,
    system: "Anvil",
    description: "How the Anvil's points are spent on Bonus Exp, Speed and Capacity.",
    keywords: ["Smithing", "Production", "Points"],
    component: AnvilTab,
});
