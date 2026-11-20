import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { gga, readCList } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { toIndexedArray } from "../../../utils/index.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { InlineEditableNumberField } from "../../../components/views/account/components/InlineEditableNumberField.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    createStaticRowReconciler,
    getOrCreateState,
    resolveNumberInput,
    toInt,
    toNum,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { button, div, span } = van.tags;

const WORLD_COUNT = 4;
const NODES_PER_WORLD = 20;

const nodeWorld = (nodeIndex) => Math.floor(nodeIndex / NODES_PER_WORLD) + 1;
const localNode = (nodeIndex) => nodeIndex % NODES_PER_WORLD;

const nodeMax = (nodeIndex, baseAmount, grade) =>
    5 * baseAmount * Math.pow(1.5, Math.max(0, grade)) * Math.pow(5, Math.floor(nodeIndex / NODES_PER_WORLD));

const formatAmount = (value) => formatNumber(Math.max(0, Math.floor(toNum(value, 0))));

const readNodes = async () => {
    const [rawNodes, rawCollected, rawGrades] = await Promise.all([
        readCList("RoyalResources"),
        gga("RoyalG[4]"),
        gga("RoyalG[5]"),
    ]);
    const collected = toIndexedArray(rawCollected ?? []);
    const grades = toIndexedArray(rawGrades ?? []);

    return toIndexedArray(rawNodes ?? [])
        .map((node, nodeIndex) => {
            const row = toIndexedArray(node ?? []);
            const resourceType = toInt(row[3], { min: 0, fallback: -1 });
            if (!Array.isArray(node) || resourceType < 0) return null;

            const x = toNum(row[0], 0);
            const y = toNum(row[1], 0);
            const baseAmount = toNum(row[2], 0);
            if (baseAmount === 0 && x === 0 && y === 0) return null;

            const grade = toInt(grades[nodeIndex], { min: 0 });
            const depleted = toNum(collected[nodeIndex], 0);
            const max = nodeMax(nodeIndex, baseAmount, grade);

            return {
                nodeIndex,
                world: nodeWorld(nodeIndex),
                localNode: localNode(nodeIndex),
                x,
                y,
                baseAmount,
                resourceType,
                grade,
                depleted,
                max,
            };
        })
        .filter(Boolean);
};

const nodeBadge = (node, depleted, grade) => {
    const max = nodeMax(node.nodeIndex, node.baseAmount, grade);
    if (depleted < 0) return "Depleted";
    if (depleted === 0) return `Full at ${formatAmount(max)}`;
    return `${formatAmount(max - depleted)} left`;
};

const NodeInfo = ({ node, gradeState }) => [
    span({ class: "account-row__index" }, `N${node.localNode}`),
    span({ class: "masterclass-currency__badge resource-node-row__icon" }, `R${node.resourceType}`),
    div(
        { class: "resource-node-row__text" },
        span({ class: "account-row__name" }, `Node ${node.nodeIndex} / RGres${node.resourceType}`),
        span({ class: "resource-node-row__meta" }, () => {
            const grade = toInt(gradeState.val, { min: 0 });
            const max = nodeMax(node.nodeIndex, node.baseAmount, grade);
            return `Base ${formatAmount(node.baseAmount)} | Max ${formatAmount(max)} | X ${node.x}, Y ${node.y}`;
        })
    ),
];

const NodeRow = ({ node, gradeState, depletedState }) => {
    const quickStatus = useWriteStatus();

    const writeDepleted = async (value) => {
        const result = await quickStatus.run(async () => {
            await writeVerified(`RoyalG[4][${node.nodeIndex}]`, value);
            depletedState.val = value;
        });
        return result.ok;
    };

    return AccountRow({
        status: quickStatus.status,
        rowClass: "resource-node-row",
        badgeClass: "resource-node-row__badge",
        controlsClass: "resource-node-row__controls",
        info: NodeInfo({ node, gradeState }),
        badge: () => nodeBadge(node, toNum(depletedState.val, 0), toInt(gradeState.val, { min: 0 })),
        controls: [
            InlineEditableNumberField({
                label: "GRADE",
                valueState: gradeState,
                path: `RoyalG[5][${node.nodeIndex}]`,
                normalize: (raw) => resolveNumberInput(raw, { formatted: true, min: 0, fallback: null }),
                rootClass: "resource-node-row__field",
                labelClass: "resource-node-row__field-label",
            }),
            InlineEditableNumberField({
                label: "COLLECTED",
                valueState: depletedState,
                path: `RoyalG[4][${node.nodeIndex}]`,
                inputMode: "float",
                normalize: (raw) => resolveNumberInput(raw, { formatted: true, float: true, min: -1, fallback: null }),
                rootClass: "resource-node-row__field",
                labelClass: "resource-node-row__field-label",
            }),
            ActionButton({
                label: "Fresh",
                status: quickStatus.status,
                tooltip: "Set collected/depleted amount to 0.",
                onClick: (e) => {
                    e.preventDefault();
                    void writeDepleted(0);
                },
            }),
            ActionButton({
                label: "Deplete",
                status: quickStatus.status,
                variant: "danger",
                tooltip: "Set collected/depleted amount to -1.",
                onClick: (e) => {
                    e.preventDefault();
                    void writeDepleted(-1);
                },
            }),
        ],
    });
};

const ResourceNodesTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Resource Nodes" });
    const activeWorld = van.state(1);
    const bulkStatus = useWriteStatus();
    const bulkMessage = van.state("");
    const nodes = van.state([]);
    const gradeStates = new Map();
    const depletedStates = new Map();
    const rowNodes = new Map();
    const rowList = div({ class: "account-item-stack account-item-stack--dense resource-node-list" });
    const reconcileRows = createStaticRowReconciler(rowList);
    const noNodes = EmptyState({
        title: "NO RESOURCE NODES",
        subtitle: "No RoyalResources rows were returned for this world.",
    });

    const renderRows = () => {
        const visible = nodes.val.filter((node) => node.world === activeWorld.val);
        // A reload that shows the same rows leaves them in place: taking a row out, even to put it back, drops the
        // focus and saves what is half typed in it.
        reconcileRows(
            visible.map((node) => node.nodeIndex).join(","),
            visible.map((node) => rowNodes.get(node.nodeIndex))
        );
        return visible.length ? rowList : noNodes;
    };

    const bodyContent = div();

    van.derive(() => {
        activeWorld.val;
        nodes.val;
        const next = renderRows();
        if (bodyContent.firstChild !== next) bodyContent.replaceChildren(next);
    });

    const load = () =>
        runLoad(async () => {
            const nextNodes = await readNodes();

            nextNodes.forEach((node) => {
                const gradeState = getOrCreateState(gradeStates, node.nodeIndex);
                const depletedState = getOrCreateState(depletedStates, node.nodeIndex);
                gradeState.val = node.grade;
                depletedState.val = node.depleted;

                if (!rowNodes.has(node.nodeIndex)) {
                    rowNodes.set(
                        node.nodeIndex,
                        NodeRow({
                            node,
                            gradeState,
                            depletedState,
                        })
                    );
                }
            });

            nodes.val = nextNodes;
        });

    const writeWorldDepleted = async (value) => {
        if (loading.val || bulkStatus.status.val === "loading") return;
        const world = activeWorld.val;
        const targets = nodes.val.filter((node) => node.world === world);
        if (!targets.length) return;

        bulkMessage.val = "";
        await bulkStatus.run(
            async () => {
                await writeManyVerified(targets.map((node) => ({ path: `RoyalG[4][${node.nodeIndex}]`, value })));
                targets.forEach((node) => {
                    depletedStates.get(node.nodeIndex).val = value;
                });
                bulkMessage.val = `W${world}: ${targets.length} nodes ${value === 0 ? "refreshed" : "depleted"}.`;
            },
            {
                onError: (error) => {
                    bulkMessage.val = `W${world} bulk action failed: ${error.message}. Re-reading node state.`;
                    void load();
                },
            }
        );
    };

    const bulkDisabled = () => loading.val || !nodes.val.some((node) => node.world === activeWorld.val);

    load();

    return PersistentAccountListPage({
        title: "RESOURCE NODES",
        description: "Manage Royal Guard resource node grades and depleted state.",
        wrapActions: false,
        actions: BulkActionBar({
            refresh: {
                onClick: load,
                tooltip: "Re-read Royal resource nodes from the running game.",
                disabled: () => loading.val || bulkStatus.status.val === "loading",
            },
        }),
        state: { loading, error },
        loadingText: "READING RESOURCE NODES",
        errorTitle: "RESOURCE NODES READ FAILED",
        initialWrapperClass: "masterclass-upgrade-scroll",
        body: div(
            { class: "masterclass-upgrade-scroll scrollable-panel" },
            AccountSection({
                title: "NODE WORLDS",
                body: [
                    div(
                        { class: "masterclass-category-tabs resource-node-toolbar" },
                        ...Array.from({ length: WORLD_COUNT }, (_, index) => {
                            const world = index + 1;
                            return button(
                                {
                                    type: "button",
                                    class: () =>
                                        `masterclass-category-tabs__button${
                                            activeWorld.val === world ? " is-active" : ""
                                        }`,
                                    disabled: () => bulkStatus.status.val === "loading",
                                    onclick: () => {
                                        activeWorld.val = world;
                                    },
                                },
                                `W${world}`
                            );
                        }),
                        div(
                            { class: "resource-node-toolbar__actions" },
                            ActionButton({
                                label: "Refresh all",
                                status: bulkStatus.status,
                                disabled: bulkDisabled,
                                tooltip: "Set every node in the selected world to fresh (collected = 0).",
                                onClick: () => void writeWorldDepleted(0),
                            }),
                            ActionButton({
                                label: "Deplete all",
                                status: bulkStatus.status,
                                disabled: bulkDisabled,
                                variant: "danger",
                                tooltip: "Deplete every node in the selected world (collected = -1).",
                                confirm: "deplete every node in this world.",
                                // The world the question was about: another one picked meanwhile asks again.
                                confirmTargets: activeWorld,
                                onClick: () => void writeWorldDepleted(-1),
                            })
                        )
                    ),
                    div({ role: "status", "aria-live": "polite" }, () => bulkMessage.val),
                    bodyContent,
                ],
            })
        ),
    });
};

export default definePage({
    id: "classes.royalarmory.resources",
    world: "classes",
    system: "Royal Armory",
    tab: "Resources",
    description: "Resource node grades and depleted state.",
    keywords: ["Resource Nodes"],
    component: ResourceNodesTab,
});
