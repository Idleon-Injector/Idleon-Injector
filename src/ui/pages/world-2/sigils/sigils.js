/**
 * W2 - Sigils Tab (Alchemy)
 *
 * Data paths (within CauldronP2W[4]):
 *   [4][2*i + 1] -> tier for sigil i (-1=Locked .. 4=Eclectic)
 *   [4][2*i]     -> EXP for sigil i (not displayed; tier-only UI)
 *
 * Sigil names come from cList.SigilDesc[i][0].
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { BulkActionBar, SetAllSelectControl } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanName,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";

const { div, span, select, option } = van.tags;

const SIGIL_TIERS = [
    { value: -1, label: "LOCKED", cls: "locked" },
    { value: 0, label: "UNLOCKED", cls: "unlocked" },
    { value: 1, label: "BOOSTED", cls: "boosted" },
    { value: 2, label: "IONIZED", cls: "ionized" },
    { value: 3, label: "ETHEREAL", cls: "ethereal" },
    { value: 4, label: "ECLECTIC", cls: "eclectic" },
];

const SIGIL_COUNT = 24;

const getTierInfo = (value) => SIGIL_TIERS.find((tier) => tier.value === Number(value)) ?? SIGIL_TIERS[0];

const SigilCard = ({ index, tierState, nameState }) => {
    const tierInput = van.state(String(tierState.val));
    // Picking a tier saves it.
    const { status, reason, save, handlers, undo } = useAutoSave({
        prepare: () => {
            const tier = Math.min(4, Math.max(-1, Math.round(Number(tierInput.val))));
            if (tier === Number(tierState.val)) return { unchanged: true };
            return {
                write: async () => {
                    await writeVerified(`CauldronP2W[4][${2 * index + 1}]`, tier);
                    tierState.val = tier;
                },
            };
        },
        revert: () => (tierInput.val = String(tierState.val)),
    });

    // A choice saves as it's picked, so there is no draft to keep: show the game's tier, with focus too.
    van.derive(() => (tierInput.val = String(tierState.val)));

    return div(
        {
            class: () => {
                const tier = getTierInfo(tierState.val);
                return ["tier-card", `sigil-card--${tier.cls}`, saveStateClass(status.val, undo)]
                    .filter(Boolean)
                    .join(" ");
            },
        },
        div(
            { class: "tier-card__header" },
            div(
                { class: "tier-card__identity" },
                span({ class: "tier-card__index" }, `#${index}`),
                span({ class: "tier-card__name" }, () => nameState.val)
            ),
            SaveState({ status, reason, undo }),
            span(
                { class: () => `tier-card__badge sigil-tier-badge--${getTierInfo(tierState.val).cls}` },
                () => getTierInfo(tierState.val).label
            )
        ),
        select(
            {
                class: "tier-card__select select-base",
                onkeydown: handlers.onkeydown,
                onchange: (e) => {
                    tierInput.val = e.target.value;
                    void save();
                },
            },
            ...SIGIL_TIERS.map((tier) =>
                option({ value: tier.value, selected: () => Number(tierInput.val) === tier.value }, tier.label)
            )
        )
    );
};

const SigilTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Sigils" });
    const sigilTier = Array.from({ length: SIGIL_COUNT }, () => van.state(-1));
    const sigilName = Array.from({ length: SIGIL_COUNT }, (_, index) => van.state(`#${index}`));
    const setAllTier = van.state("-1");
    const { status: setAllStatus, run: runSetAll } = useWriteStatus();

    const load = async () =>
        run(async () => {
            const sigils = await readLevelDefinitions({
                levelsPath: "CauldronP2W",
                definitionsPath: "SigilDesc",
                selectLevels: (_, levels) => levels[4],
                mapEntry: ({ definition, levels, index }) => ({
                    tier: toNum(levels[2 * index + 1], -1),
                    name: cleanName(definition[0], `#${index}`).toUpperCase(),
                }),
            });

            for (let index = 0; index < SIGIL_COUNT; index++) {
                sigilTier[index].val = sigils[index]?.tier ?? -1;
                sigilName[index].val = sigils[index]?.name ?? `#${index}`;
            }
        });

    const doSetAll = async () => {
        const tier = Math.min(4, Math.max(-1, Math.round(Number(setAllTier.val))));
        if (Number.isNaN(tier)) return;

        await runSetAll(async () => {
            await runBulkSet({
                entries: sigilTier,
                getTargetValue: () => tier,
                getValueState: (tierState) => tierState,
                getPath: (_, index) => `CauldronP2W[4][${2 * index + 1}]`,
            });
        });
    };

    load();

    const grid = div(
        { class: "tier-grid sigils-grid" },
        ...Array.from({ length: SIGIL_COUNT }, (_, index) =>
            SigilCard({ index, tierState: sigilTier[index], nameState: sigilName[index] })
        )
    );

    return PersistentAccountListPage({
        title: "ALCHEMY - SIGILS",
        description: "Manage tier and unlock status for all 24 alchemy sigils.",
        wrapActions: false,
        actions: BulkActionBar({
            leading: SetAllSelectControl({
                label: "SET ALL TIERS TO",
                value: setAllTier,
                options: SIGIL_TIERS,
                status: setAllStatus,
                onApply: doSetAll,
            }),
            refresh: { onClick: load },
        }),
        state: { loading, error },
        body: div({ class: "tier-scroll scrollable-panel" }, grid),
    });
};

export default definePage({
    id: "w2.sigils",
    world: 2,
    system: "Sigils",
    description: "Each sigil's tier, from locked to eclectic.",
    keywords: ["Alchemy"],
    component: SigilTab,
});
