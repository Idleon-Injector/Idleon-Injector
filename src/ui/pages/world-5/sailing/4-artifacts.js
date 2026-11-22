/**
 * W5 - Sailing › Artifacts
 *
 * Data sources:
 *   gga.Sailing[3][n]        - artifact n's tier: 0 not found, 1 found, then Ancient up to Verisimilitude (7)
 *   cList.ArtifactInfo[n][0] - its name; [4] its bonus in the game's words
 *
 * One list in the game's order, each artifact's bonus first and its tier as a plain word before the field. Max all and
 * Reset all sit in the tray and act on the artifacts the top bar's search shows; Reset asks there first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    runBulkSet,
    toInt,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const PATH = "Sailing[3]";
// The game's tiers, in order (its patch note: "Ancient, Eldritch, Sovereign, Omnipotent, Transcendent, then
// Verisimilitude").
const TIERS = ["", "Found", "Ancient", "Eldritch", "Sovereign", "Omnipotent", "Transcendent", "Verisimilitude"];
const MAX_TIER = TIERS.length - 1;

const ArtifactsTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Artifacts", busy: () => bulk.status.val === "loading" });
    const getTierState = createIndexedStateGetter(0);
    const artifacts = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const readPending = () => loading.val || Boolean(error.val);

    const ArtifactRow = (artifact) =>
        ClampedLevelRow({
            valueState: getTierState(artifact.index),
            writePath: `${PATH}[${artifact.index}]`,
            max: MAX_TIER,
            integerMode: "trunc",
            name: artifact.name,
            renderInfo: () => RowTitles({ bonus: artifact.bonus, name: artifact.name }),
            renderBadge: (tier) => TIERS[tier] ?? "",
        });

    const load = async () =>
        run(async () => {
            const [rawTiers, rawInfo] = await Promise.all([gga(PATH), readCList("ArtifactInfo")]);
            const tiers = toIndexedArray(rawTiers ?? []);
            const next = toIndexedArray(rawInfo ?? []).map((raw, index) => {
                const info = toIndexedArray(raw ?? []);
                return {
                    index,
                    name: cleanName(info[0], `Artifact ${index + 1}`),
                    bonus: bonusText(info[4]),
                };
            });
            reconcileRows(next.map((artifact) => artifact.name).join("|"), () =>
                next.map((artifact) => {
                    const row = ArtifactRow(artifact);
                    rowOf.set(artifact.index, row);
                    return row;
                })
            );
            // The tier the game holds, above the max too: Max all brings it down.
            next.forEach((artifact) => (getTierState(artifact.index).val = toInt(tiers[artifact.index], { min: 0 })));
            artifacts.val = next;
        });

    const shown = () => artifacts.val.filter((artifact) => shownBySearch(rowOf.get(artifact.index)));
    const artifactWord = (n) => `artifact${n === 1 ? "" : "s"}`;

    const setTiers = async (entries, tier) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => tier,
                getValueState: (artifact) => getTierState(artifact.index),
                getPath: (artifact) => `${PATH}[${artifact.index}]`,
            })
        );
        if (!result.ok && !result.cancelled) await load();
    };

    const tools = (_activeId, ask) => {
        const resetAll = ActionButton({
            label: "Reset all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown().length,
            onClick: (e) => {
                e.preventDefault();
                const entries = shown();
                const n = entries.length;
                ask({
                    question: `Reset ${n} ${artifactWord(n)} to not found?`,
                    confirmLabel: n === 1 ? "Reset it" : "Reset them",
                    from: resetAll,
                    onConfirm: () => setTiers(entries, 0),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Max all",
                status: bulk.status,
                disabled: () => readPending() || !shown().length,
                onClick: (e) => {
                    e.preventDefault();
                    return setTiers(shown(), MAX_TIER);
                },
            }),
            resetAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Artifacts",
        description: "Each artifact's tier, from found up to Verisimilitude.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the artifacts",
        errorTitle: "Couldn't read the artifacts",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: listNode,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${artifactWord(n)}` : `All ${n} ${artifactWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w5.sailing.artifacts",
    world: 5,
    system: "Sailing",
    tab: "Artifacts",
    description: "Sailing artifact tiers.",
    keywords: ["Ancient", "Eldritch", "Sovereign", "Omnipotent", "Transcendent", "Verisimilitude"],
    component: ArtifactsTab,
});
