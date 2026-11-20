/**
 * W1 - Forge Tab
 *
 * FurnaceLevels layout (indices 0-5, index 6 = XP progress, ignored):
 *   Page 1:
 *     [0] New Forge Slot      - max 16
 *     [1] Ore Capacity Boost  - max 50
 *     [2] Forge Speed         - max 90
 *   Page 2:
 *     [3] Forge EXP Gain      - max 85
 *     [4] Bar Bonanza         - max 75
 *     [5] Puff Puff Go        - max 60
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { runBulkSet, useWriteStatus } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const SECTIONS = [
    {
        label: "Page 1",
        upgrades: [
            { label: "New Forge Slot", index: 0, max: 16 },
            { label: "Ore Capacity Boost", index: 1, max: 50 },
            { label: "Forge Speed", index: 2, max: 90 },
        ],
    },
    {
        label: "Page 2",
        upgrades: [
            { label: "Forge EXP Gain", index: 3, max: 85 },
            { label: "Bar Bonanza", index: 4, max: 75 },
            { label: "Puff Puff Go", index: 5, max: 60 },
        ],
    },
];
const FORGE_UPGRADES = SECTIONS.flatMap((section) => section.upgrades);

const ForgeRow = ({ upgrade, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `FurnaceLevels[${upgrade.index}]`,
        max: upgrade.max,
        name: upgrade.label,
        maxAction: true,
    });

const ForgeTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Forge" });
    const { status: maxAllStatus, run: runMaxAll } = useWriteStatus();
    const levelStates = Array.from({ length: 6 }, () => van.state(0));

    const load = async () =>
        run(async () => {
            const raw = await gga("FurnaceLevels");
            const levels = toIndexedArray(raw);
            for (let i = 0; i < levelStates.length; i++) {
                levelStates[i].val = Number(levels[i] ?? 0);
            }
        });

    const doMaxAll = async () => {
        await runMaxAll(async () => {
            await runBulkSet({
                entries: FORGE_UPGRADES,
                getTargetValue: (upgrade) => upgrade.max,
                getValueState: (upgrade) => levelStates[upgrade.index],
                getPath: (upgrade) => `FurnaceLevels[${upgrade.index}]`,
            });
        });
    };

    load();

    const body = div(
        { class: "account-list" },
        ...SECTIONS.map((section) =>
            AccountSection({
                title: section.label,
                rootClass: "forge-upgrades-list",
                body: section.upgrades.map((upgrade) =>
                    ForgeRow({
                        upgrade,
                        levelState: levelStates[upgrade.index],
                    })
                ),
            })
        )
    );
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Forge",
        description: "Set forge upgrade levels — each upgrade has a hard maximum",
        wrapActions: false,
        actions: BulkActionBar({
            actions: [
                {
                    label: "Max all",
                    status: maxAllStatus,
                    tooltip: "Set all forge upgrades to their max levels",
                    onClick: doMaxAll,
                },
            ],
            refresh: {
                onClick: load,
                tooltip: "Re-read forge levels from game memory",
            },
        }),
        state: { loading, error },
        loadingText: "Reading forge",
        errorTitle: "Forge read failed",
        initialWrapperClass: "account-list",
        body,
    });
};

export default definePage({
    id: "w1.forge",
    world: 1,
    system: "Forge",
    description: "Forge upgrade levels.",
    keywords: ["Furnace", "Upgrades"],
    component: ForgeTab,
});
