import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    cleanNameEffect,
    createStaticRowReconciler,
    getOrCreateState,
    toInt,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { pageSection, renderLazyPanes } from "../../../components/views/account/tabShared.js";

const { div, span, label, select, option } = van.tags;

const WORLD_COUNT = 7;

// The board's three parts are the page's sections (the sidebar lists them); the world is a pick on each part's top.
const SECTIONS = [
    { id: "tasks", label: "Tasks", component: (props) => TasksWorldTasksTab(props) },
    { id: "achievements", label: "Achievements", component: (props) => TasksWorldAchievementsTab(props) },
    { id: "merit-shop", label: "Merit Shop", component: (props) => TasksWorldMeritShopTab(props) },
];

/** The world pick on the line under a part's title; every part shares the one world. */
const WorldPick = (world) =>
    div(
        { class: "account-setall-row" },
        label({ class: "account-setall-row__label" }, "World"),
        select(
            {
                class: "select-base",
                "aria-label": "World",
                value: world,
                onchange: (e) => (world.val = Number(e.target.value)),
            },
            ...Array.from({ length: WORLD_COUNT }, (_, index) =>
                option({ value: index, selected: index === world.val }, `World ${index + 1}`)
            )
        )
    );

const TASK_LIMIT_PER_WORLD = 8;
const ACHIEVEMENTS_PER_WORLD = 70;

const joinDescription = (first, second) =>
    [first, second]
        .map((part) => String(part ?? "").trim())
        .filter(Boolean)
        .join(" ");

const buildTaskEntries = (worldIndex, rawProgress, rawCompletions, rawDescriptions) => {
    const progress = toIndexedArray(rawProgress ?? []);
    const completions = toIndexedArray(rawCompletions ?? []);

    return toIndexedArray(rawDescriptions ?? [])
        .slice(0, TASK_LIMIT_PER_WORLD)
        .map((rawDefinition, index) => {
            const definition = toIndexedArray(rawDefinition ?? []);
            const rawName = String(definition[0] ?? "").trim();
            const stageTargets = definition
                .slice(5)
                .filter((target) => target !== null && target !== undefined && String(target).trim() !== "");
            return {
                index,
                rawName: rawName || `Task ${index + 1}`,
                name: cleanNameEffect(rawName, `Task ${index + 1}`),
                path: `Tasks[1][${worldIndex}][${index}]`,
                completed: toInt(completions[index], { min: 0 }),
                maxStages: stageTargets.length,
                progress: progress[index],
                stageTargets,
            };
        });
};

// entryState follows every load (a Refresh keeps the row); Target follows the saved stages done.
const TaskRow = ({ entry, entryState, valueState }) =>
    SimpleNumberRow({
        entry: {
            index: entry.index + 1,
            name: entry.name,
            path: entry.path,
            formatted: false,
            min: 0,
            max: entry.maxStages,
            subLabel: () => {
                const { progress, stageTargets } = entryState.val;
                const nextTarget = stageTargets[Math.min(toInt(valueState.val, { min: 0 }), stageTargets.length - 1)];
                const parts = [`Progress ${progress ?? 0}`];
                if (nextTarget !== undefined) parts.push(`Target ${nextTarget}`);
                // A slash means a cap, so the two facts sit apart with a dot.
                return parts.join(" · ");
            },
            cap: entry.maxStages,
            maxAction: {
                value: entry.maxStages,
                tooltip: `Set completed stages to ${entry.maxStages}`,
            },
            resetAction: true,
        },
        valueState,
    });

const TasksWorldTasksTab = ({ worldIndex, toolbar }) => {
    const worldLabel = `W${worldIndex + 1}`;
    const { loading, error, run } = useAccountLoad({ label: `${worldLabel} Tasks` });
    const entries = van.state([]);
    const valueStates = new Map();
    const entryStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawProgress, rawCompletions, rawDescriptions] = await Promise.all([
                gga(`Tasks[0][${worldIndex}]`),
                gga(`Tasks[1][${worldIndex}]`),
                readCList(`TaskDescriptions[${worldIndex}]`),
            ]);

            entries.val = buildTaskEntries(worldIndex, rawProgress, rawCompletions, rawDescriptions);
            for (const entry of entries.val) getOrCreateState(entryStates, entry.index, entry).val = entry;
            reconcileRows(entries.val.map((entry) => entry.rawName).join("|"), () =>
                entries.val.map((entry) =>
                    TaskRow({
                        entry,
                        entryState: getOrCreateState(entryStates, entry.index),
                        valueState: getOrCreateState(valueStates, entry.index),
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(valueStates, entry.index).val = entry.completed;
            }
        });

    load();

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "Tasks",
            note: () => `${entries.val.length} tasks from Tasks[1][${worldIndex}]`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: `${worldLabel} tasks`,
        description: "Edit completed task stages. Stage caps come from TaskDescriptions.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        toolbar,
        state: { loading, error },
        loadingText: `Reading ${worldLabel} tasks`,
        errorTitle: `${worldLabel} tasks read failed`,
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

const resolveAchievementIndexes = (worldIndex, rawOrdering, rawAchievements) => {
    const achievements = toIndexedArray(rawAchievements ?? []);
    const orderingByWorld = toIndexedArray(rawOrdering ?? []);
    const ordered = toIndexedArray(orderingByWorld[worldIndex] ?? []);
    const worldOffset = worldIndex * ACHIEVEMENTS_PER_WORLD;
    const worldEnd = worldOffset + ACHIEVEMENTS_PER_WORLD;

    if (ordered.length) {
        return ordered
            .map((rawIndex) => {
                const orderedIndex = Number(rawIndex);
                if (!Number.isFinite(orderedIndex)) return null;
                if (orderedIndex >= worldOffset && orderedIndex < worldEnd) return orderedIndex;
                if (orderedIndex >= 0 && orderedIndex < ACHIEVEMENTS_PER_WORLD) return worldOffset + orderedIndex;
                return null;
            })
            .filter((globalIndex) => globalIndex !== null && achievements[globalIndex]);
    }

    return achievements.slice(worldOffset, worldEnd).map((_, localIndex) => worldOffset + localIndex);
};

const buildAchievementEntries = (worldIndex, rawValues, rawAchievements, rawOrdering) => {
    const values = toIndexedArray(rawValues ?? []);
    const achievements = toIndexedArray(rawAchievements ?? []);

    return resolveAchievementIndexes(worldIndex, rawOrdering, rawAchievements)
        .map((globalIndex) => {
            const definition = toIndexedArray(achievements[globalIndex] ?? []);
            const rawName = String(definition[0] ?? "").trim();
            if (!rawName || rawName === "FILLERZZZ_ACH") return null;

            return {
                index: globalIndex,
                rawName,
                name: cleanName(rawName, `Achievement ${globalIndex + 1}`),
                path: `AchieveReg[${globalIndex}]`,
                value: toInt(values[globalIndex], { fallback: 0 }),
            };
        })
        .filter(Boolean);
};

const AchievementRow = ({ entry, valueState }) =>
    SimpleNumberRow({
        entry: {
            index: entry.index,
            name: entry.name,
            path: entry.path,
            formatted: false,
            min: -1,
            badge: (currentValue) => (Number(currentValue) === -1 ? "Complete" : ""),
            maxAction: {
                label: "Done",
                value: -1,
                tooltip: "Set achievement status to complete (-1)",
            },
            resetAction: true,
        },
        valueState,
    });

const TasksWorldAchievementsTab = ({ worldIndex, toolbar }) => {
    const worldLabel = `W${worldIndex + 1}`;
    const { loading, error, run } = useAccountLoad({ label: `${worldLabel} Achievements` });
    const entries = van.state([]);
    const valueStates = new Map();
    const listNode = div({ class: "account-item-stack account-item-stack--dense" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawValues, rawAchievements, rawOrdering] = await Promise.all([
                gga("AchieveReg"),
                readCList("RegAchieves"),
                readCList("AchieveOrderingz"),
            ]);

            entries.val = buildAchievementEntries(worldIndex, rawValues, rawAchievements, rawOrdering);
            reconcileRows(entries.val.map((entry) => `${entry.index}:${entry.rawName}`).join("|"), () =>
                entries.val.map((entry) =>
                    AchievementRow({
                        entry,
                        valueState: getOrCreateState(valueStates, entry.index),
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(valueStates, entry.index).val = entry.value;
            }
        });

    load();

    const completedCount = van.derive(
        () => entries.val.filter((entry) => getOrCreateState(valueStates, entry.index).val === -1).length
    );

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "Achievements",
            note: () => `${completedCount.val} / ${entries.val.length} COMPLETE`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: `${worldLabel} achievements`,
        description: "Edit achievement progress from AchieveReg. A value of -1 marks an achievement complete.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        toolbar,
        state: { loading, error },
        loadingText: `Reading ${worldLabel} achievements`,
        errorTitle: `${worldLabel} achievements read failed`,
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

const getShopDefinitionsForWorld = (rawDefinitions, worldIndex) => {
    const definitionWorlds = toIndexedArray(rawDefinitions ?? []);
    const worldDefinitions = toIndexedArray(definitionWorlds[worldIndex] ?? []);
    const offset = definitionWorlds
        .slice(0, worldIndex)
        .reduce((total, rawWorldDefinitions) => total + toIndexedArray(rawWorldDefinitions ?? []).length, 0);

    return { worldDefinitions, offset };
};

const resolveShopLevel = (rawPurchases, worldIndex, localIndex, globalIndex) => {
    const purchases = toIndexedArray(rawPurchases ?? []);
    const worldPurchases = toIndexedArray(purchases[worldIndex] ?? []);

    if (worldPurchases.length) {
        return {
            path: `Tasks[2][${worldIndex}][${localIndex}]`,
            value: toInt(worldPurchases[localIndex], { min: 0 }),
        };
    }

    return {
        path: `Tasks[2][${globalIndex}]`,
        value: toInt(purchases[globalIndex], { min: 0 }),
    };
};

const buildMeritShopEntries = (worldIndex, rawPurchases, rawDefinitions) => {
    const { worldDefinitions, offset } = getShopDefinitionsForWorld(rawDefinitions, worldIndex);

    return worldDefinitions
        .map((rawDefinition, localIndex) => {
            const definition = toIndexedArray(rawDefinition ?? []);
            const description = joinDescription(definition[0], definition[1]);
            if (!description) return null;

            const globalIndex = offset + localIndex;
            const level = resolveShopLevel(rawPurchases, worldIndex, localIndex, globalIndex);

            return {
                localIndex,
                globalIndex,
                rawName: description,
                name: cleanNameEffect(description, `Merit ${localIndex + 1}`),
                path: level.path,
                value: level.value,
                maxPurchases: toInt(definition[5], { min: 0 }),
            };
        })
        .filter(Boolean);
};

const MeritShopRow = ({ entry, valueState }) =>
    ClampedLevelRow({
        valueState,
        writePath: entry.path,
        max: entry.maxPurchases,
        integerMode: "round",
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${entry.localIndex + 1}`),
            div({ class: "account-row__name-group" }, span({ class: "account-row__name" }, entry.name)),
        ],
        rowClass: "account-row--wide-controls",
        controlsClass: "account-row__controls--xl",
        maxAction: true,
    });

const TasksWorldMeritShopTab = ({ worldIndex, toolbar }) => {
    const worldLabel = `W${worldIndex + 1}`;
    const { loading, error, run } = useAccountLoad({ label: `${worldLabel} Merit Shop` });
    const entries = van.state([]);
    const valueStates = new Map();
    const listNode = div({ class: "account-item-stack" });
    const reconcileRows = createStaticRowReconciler(listNode);

    const load = async () =>
        run(async () => {
            const [rawPurchases, rawDefinitions] = await Promise.all([gga("Tasks[2]"), readCList("TaskShopDesc")]);
            entries.val = buildMeritShopEntries(worldIndex, rawPurchases, rawDefinitions);
            reconcileRows(entries.val.map((entry) => `${entry.globalIndex}:${entry.rawName}`).join("|"), () =>
                entries.val.map((entry) =>
                    MeritShopRow({
                        entry,
                        valueState: getOrCreateState(valueStates, entry.globalIndex),
                    })
                )
            );

            for (const entry of entries.val) {
                getOrCreateState(valueStates, entry.globalIndex).val = Math.min(entry.maxPurchases, entry.value);
            }
        });

    load();

    const cappedCount = van.derive(
        () =>
            entries.val.filter((entry) => getOrCreateState(valueStates, entry.globalIndex).val >= entry.maxPurchases)
                .length
    );

    const body = div(
        { class: "scrollable-panel content-stack" },
        AccountSection({
            title: "Merit Shop",
            note: () => `${cappedCount.val} / ${entries.val.length} CAPPED`,
            body: listNode,
        })
    );

    return PersistentAccountListPage({
        title: `${worldLabel} Merit Shop`,
        description: "Edit merit shop purchases from Tasks[2]. Max purchases come from TaskShopDesc.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        toolbar,
        state: { loading, error },
        loadingText: `Reading ${worldLabel} Merit Shop`,
        errorTitle: `${worldLabel} Merit Shop read failed`,
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

const TasksTab = () => {
    const section = pageSection("account.taskboard", SECTIONS[0].id);
    const world = van.state(0);
    // One pane per part and world, each built the first time it shows.
    const panes = SECTIONS.flatMap((part) =>
        Array.from({ length: WORLD_COUNT }, (_, worldIndex) => ({ id: `${part.id}:${worldIndex}`, part, worldIndex }))
    );
    return div(
        { class: "world-tab" },
        div(
            { class: "world-sub-content" },
            ...renderLazyPanes({
                tabs: panes,
                activeId: van.derive(() => `${section.val}:${world.val}`),
                paneClass: "world-sub-pane",
                dataAttr: "data-tasks-pane",
                renderContent: ({ part, worldIndex }) => part.component({ worldIndex, toolbar: WorldPick(world) }),
            })
        )
    );
};

export default definePage({
    id: "account.taskboard",
    world: "account",
    system: "Task Board",
    description: "Tasks, achievements and merit shop purchases, for each world.",
    keywords: ["Tasks", "Achievements", "Merits", "Merit Shop"],
    sections: SECTIONS.map(({ id, label: name }) => ({ id, label: name })),
    sectionMode: "switch",
    component: TasksTab,
});
