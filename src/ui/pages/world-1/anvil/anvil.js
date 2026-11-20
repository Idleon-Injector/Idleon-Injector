/**
 * W1 - Anvil Tab
 *
 * AnvilPAstats layout:
 *   [0] = points remaining  (read from game after every change)
 *   [1] = Points bought with money        (max 600)
 *   [2] = Points bought with monster parts (max 700)
 *   [3] = Bonus Exp  (allocated)
 *   [4] = Speed/hr   (allocated)
 *   [5] = Capacity   (allocated)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
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
        maxAction: category.max !== null ? { value: category.max, tooltip: `Set to maximum (${category.max})` } : null,
        resetAction: category.max === null ? { tooltip: `Reset ${category.label} to 0` } : null,
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

    const load = async () =>
        run(async () => {
            character = await readCharacterInPlay();
            const raw = await gga("AnvilPAstats");
            const arr = toIndexedArray(raw);
            for (let i = 0; i < statStates.length; i++) {
                statStates[i].val = Number(arr[i] ?? 0);
            }
        });

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

    const body = div(
        { class: "account-list" },
        div(
            { class: "account-row account-row--info" },
            span({ class: "account-row__name" }, "Points Remaining"),
            span({ class: "account-row__badge account-row__badge--highlight" }, () => `${statStates[0].val ?? 0} pts`)
        ),
        ...CATEGORIES.map((cat) =>
            AnvilRow({
                category: cat,
                valueState: statStates[cat.index],
                getCharacter,
                onWriteApplied: refreshRemainingPoints,
            })
        )
    );

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "ANVIL",
        description: "Manage point allocation for Bonus Exp, Speed/hr, and Capacity",
        actions: RefreshButton({
            onRefresh: load,
            tooltip: "Re-read anvil stats from game memory",
        }),
        topNotices: WarningBanner(
            " You must have a character selected in-game for point changes to take effect. ",
            "Open the Anvil in-game or points won't update properly."
        ),
        state: { loading, error },
        loadingText: "READING ANVIL",
        errorTitle: "ANVIL READ FAILED",
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
