/**
 * W2 - Sigils Tab (Alchemy)
 *
 * Data paths (within CauldronP2W[4]):
 *   [4][2*i + 1] -> tier for sigil i (-1=Locked .. 4=Eclectic)
 *   [4][2*i]     -> EXP for sigil i (not displayed; tier-only UI)
 *
 * Sigil names come from cList.SigilDesc[i][0], their bonus in the game's words from [6] ("Boosts_base_STR_by_+{").
 * One list in the game's order; a sigil's tier is a step picker, and "Tier for all" in the tray sets the sigils the top
 * bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    normalCase,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";

const { div, span } = van.tags;

// A tier names a thing, so each lights in its own colour (sigils.css).
const SIGIL_TIERS = [
    { value: -1, label: "Locked", tone: "off" },
    { value: 0, label: "Unlocked", tone: "sigil-unlocked" },
    { value: 1, label: "Boosted", tone: "sigil-boosted" },
    { value: 2, label: "Ionized", tone: "sigil-ionized" },
    { value: 3, label: "Ethereal", tone: "sigil-ethereal" },
    { value: 4, label: "Eclectic", tone: "sigil-eclectic" },
];

const SIGIL_COUNT = 24;

const tierLabel = (value) => (SIGIL_TIERS.find((tier) => tier.value === Number(value)) ?? SIGIL_TIERS[0]).label;

const SigilRow = ({ index, tierState, nameState, bonusState }) => {
    const pickedTier = van.state(tierState.val);
    // Picking a tier saves it.
    const { status, reason, save, handlers, undo } = useAutoSave({
        prepare: () => {
            const tier = pickedTier.val;
            if (tier === Number(tierState.val)) return { unchanged: true };
            return {
                write: async () => {
                    await writeVerified(`CauldronP2W[4][${2 * index + 1}]`, tier);
                    tierState.val = tier;
                },
            };
        },
        revert: () => (pickedTier.val = Number(tierState.val)),
    });

    // A pick saves as it's made, so there is no draft to keep: show the game's tier.
    van.derive(() => (pickedTier.val = Number(tierState.val)));

    return AccountRow({
        rowClass: () => saveStateClass(status.val, undo),
        rowProps: handlers,
        info: [
            span({ class: "account-row__index" }, `#${index}`),
            RowTitles({ bonus: () => bonusState.val, name: () => nameState.val }),
        ],
        controls: [
            SaveState({ status, reason, undo }),
            StepPicker({
                name: () => `${nameState.val} tier`,
                className: "sigil-tiers",
                steps: SIGIL_TIERS,
                picked: () => pickedTier.val,
                onPick: (tier) => {
                    pickedTier.val = tier;
                    void save();
                },
            }),
        ],
    });
};

const SigilTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Sigils" });
    const sigilTier = Array.from({ length: SIGIL_COUNT }, () => van.state(-1));
    const sigilName = Array.from({ length: SIGIL_COUNT }, (_, index) => van.state(`Sigil ${index}`));
    const sigilBonus = Array.from({ length: SIGIL_COUNT }, () => van.state(""));
    const bulk = useWriteStatus();

    const load = async () =>
        run(async () => {
            const sigils = await readLevelDefinitions({
                levelsPath: "CauldronP2W",
                definitionsPath: "SigilDesc",
                selectLevels: (_, levels) => levels[4],
                mapEntry: ({ definition, levels, index }) => ({
                    tier: toNum(levels[2 * index + 1], -1),
                    name: normalCase(definition[0] ?? `Sigil ${index}`),
                    bonus: bonusText(definition[6]),
                }),
            });

            for (let index = 0; index < SIGIL_COUNT; index++) {
                sigilTier[index].val = sigils[index]?.tier ?? -1;
                sigilName[index].val = sigils[index]?.name ?? `Sigil ${index}`;
                sigilBonus[index].val = sigils[index]?.bonus ?? "";
            }
        });

    const rows = sigilTier.map((tierState, index) =>
        SigilRow({ index, tierState, nameState: sigilName[index], bonusState: sigilBonus[index] })
    );
    // The sigils the tools act on: every one, or the ones the top bar's search shows.
    const shownIndices = () => rows.map((_, index) => index).filter((index) => shownBySearch(rows[index]));
    const sigilWord = (n) => `sigil${n === 1 ? "" : "s"}`;

    const tools = (_activeId, ask) => {
        const writeTier = (indices, tier) =>
            bulk.run(() =>
                runBulkSet({
                    entries: indices,
                    getTargetValue: () => tier,
                    getValueState: (index) => sigilTier[index],
                    getPath: (index) => `CauldronP2W[4][${2 * index + 1}]`,
                })
            );
        const tierButtons = SIGIL_TIERS.map((tier) => {
            const tierButton = ActionButton({
                label: tier.label,
                status: bulk.status,
                disabled: () => {
                    const indices = shownIndices();
                    return !indices.length || indices.every((index) => Number(sigilTier[index].val) === tier.value);
                },
                onClick: (e) => {
                    e.preventDefault();
                    const indices = shownIndices();
                    // Lowering (locking included) takes tiers away, so it asks first; raising runs on one press.
                    const lowered = indices.filter((index) => Number(sigilTier[index].val) > tier.value).length;
                    if (!lowered) return void writeTier(indices, tier.value);
                    ask({
                        question:
                            tier.value < 0
                                ? `Lock ${lowered} ${sigilWord(lowered)}?`
                                : `Lower ${lowered} ${sigilWord(lowered)} to ${tierLabel(tier.value)}?`,
                        confirmLabel:
                            tier.value < 0
                                ? lowered === 1
                                    ? "Lock it"
                                    : "Lock them"
                                : lowered === 1
                                  ? "Lower it"
                                  : "Lower them",
                        from: tierButton,
                        onConfirm: () => writeTier(indices, tier.value),
                    });
                },
            });
            return tierButton;
        });
        return div(
            { class: "tabbed-list__tool-group" },
            span(
                { class: "tabbed-list__tool-label" },
                "Tier",
                span({ class: "tabbed-list__tool-label-more" }, " for all")
            ),
            ...tierButtons
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container sigils-tab",
        title: "Sigils",
        description: "Each sigil's tier, from locked to eclectic.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading sigils",
        errorTitle: "Couldn't read sigils",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: rows,
                tools,
                toolsLabel: () => {
                    const n = shownIndices().length;
                    return isSearching() ? `${n} matching ${sigilWord(n)}` : `All ${n} ${sigilWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w2.sigils",
    world: 2,
    system: "Sigils",
    description: "Each sigil's tier, from locked to eclectic.",
    keywords: ["Alchemy", "Unlocked", "Boosted", "Ionized", "Ethereal", "Eclectic"],
    component: SigilTab,
});
