/**
 * Account - Task Board
 *
 * The game's three screens as tabs (Tasks, Achievements, Merit Shop), for the world picked on the line under the title,
 * like a character on other pages. Tasks: gga.Tasks[0][world] progress and Tasks[1][world] stages done, each up to its
 * stage count (cList.TaskDescriptions). Achievements: gga.AchieveReg, progress or -1 once complete (cList.RegAchieves,
 * in AchieveOrderingz's order). Merit Shop: gga.Tasks[2] purchases, each up to its max (cList.TaskShopDesc).
 */
import van from "../../../vendor/van-1.6.0.js";
import { WORLDS as MENU_WORLDS, definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    cleanNameEffect,
    createStaticRowReconciler,
    getOrCreateState,
    runBulkSet,
    toInt,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { TabbedList, toolsPerTab } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

const WORLDS = MENU_WORLDS.filter((world) => typeof world.id === "number").map((world, index) => ({
    id: String(index),
    label: world.label,
    note: world.name,
}));
const TABS = [
    { id: "tasks", label: "Tasks" },
    { id: "achievements", label: "Achievements" },
    { id: "merit-shop", label: "Merit Shop" },
];
const TASK_LIMIT_PER_WORLD = 8;
const ACHIEVEMENTS_PER_WORLD = 70;
const COMPLETE = -1;
const count = (n) => Number(n ?? 0).toLocaleString("en-US");

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

// A task: its stages done, up to how many it has; how far it is toward the next stage, muted under its name.
// The targets come from a state each read sets, so a kept row shows the game's targets after a Refresh.
const TaskRow = ({ entry, valueState, progressState, targetsState }) =>
    ClampedLevelRow({
        valueState,
        writePath: entry.path,
        max: entry.maxStages,
        renderInfo: () =>
            RowTitles({
                name: entry.name,
                note: () => {
                    const target = targetsState.val[Math.min(toInt(valueState.val, { min: 0 }), entry.maxStages - 1)];
                    return target === undefined ? null : `${count(progressState.val)} of ${count(target)}`;
                },
            }),
        maxAction: true,
    });

// An achievement: its progress, or "Complete" (the game's -1), which Done gives it at once.
const AchievementRow = ({ entry, valueState }) =>
    ClampedLevelRow({
        valueState,
        writePath: entry.path,
        max: Infinity,
        min: COMPLETE,
        unset: COMPLETE,
        renderInfo: () => RowTitles({ name: entry.name }),
        renderBadge: (value) => (Number(value) === COMPLETE ? "Complete" : ""),
        renderExtraActions: ({ applyValue }) =>
            ActionButton({
                label: "Done",
                disabled: () => Number(valueState.val) === COMPLETE,
                onClick: (e) => {
                    e.preventDefault();
                    void applyValue(COMPLETE);
                },
            }),
    });

const MeritShopRow = ({ entry, valueState }) =>
    ClampedLevelRow({
        valueState,
        writePath: entry.path,
        max: entry.maxPurchases,
        integerMode: "round",
        renderInfo: () => RowTitles({ name: entry.name }),
        maxAction: true,
    });

const TaskBoardTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Task Board" });
    const world = van.state("0");
    const bulk = useWriteStatus();
    const states = new Map();
    const progress = new Map();
    const targets = new Map();
    // Each tab's rows for the picked world: built again when another world is picked, kept across a refresh.
    const lists = new Map(
        TABS.map((tab) => {
            const node = div({ class: "account-page-pane" });
            return [tab.id, { node, reconcile: createStaticRowReconciler(node), entries: [] }];
        })
    );
    const read = van.state(null);

    const show = () => {
        const data = read.val;
        if (!data) return;
        const w = Number(world.val);
        const parts = {
            tasks: buildTaskEntries(w, data.progress[w], data.completions[w], data.taskDescriptions[w]).map(
                (entry) => ({
                    entry,
                    key: entry.path,
                    value: entry.completed,
                    max: entry.maxStages,
                    Row: TaskRow,
                })
            ),
            achievements: buildAchievementEntries(w, data.achieveReg, data.achievements, data.ordering).map(
                (entry) => ({
                    entry,
                    key: entry.path,
                    value: entry.value,
                    max: null,
                    Row: AchievementRow,
                })
            ),
            "merit-shop": buildMeritShopEntries(w, data.purchases, data.shopDescriptions).map((entry) => ({
                entry,
                key: entry.path,
                value: entry.value,
                max: entry.maxPurchases,
                Row: MeritShopRow,
            })),
        };
        for (const tab of TABS) {
            const list = lists.get(tab.id);
            const items = parts[tab.id];
            for (const item of items) {
                getOrCreateState(states, item.key).val = item.value;
                // A task's progress follows a refresh; its row is kept.
                getOrCreateState(progress, item.key).val = item.entry.progress ?? 0;
                getOrCreateState(targets, item.key).val = item.entry.stageTargets ?? [];
            }
            list.reconcile(JSON.stringify([w, items.map((item) => [item.key, item.entry.name, item.max])]), () => {
                list.entries = items.map((item) => ({
                    ...item,
                    row: item.Row({
                        entry: item.entry,
                        valueState: getOrCreateState(states, item.key),
                        progressState: getOrCreateState(progress, item.key),
                        targetsState: getOrCreateState(targets, item.key),
                    }),
                }));
                return list.entries.map(({ row }) => row);
            });
        }
    };

    const load = () =>
        run(async () => {
            const [
                progress,
                completions,
                purchases,
                achieveReg,
                taskDescriptions,
                shopDescriptions,
                achievements,
                ordering,
            ] = await Promise.all([
                gga("Tasks[0]"),
                gga("Tasks[1]"),
                gga("Tasks[2]"),
                gga("AchieveReg"),
                readCList("TaskDescriptions"),
                readCList("TaskShopDesc"),
                readCList("RegAchieves"),
                readCList("AchieveOrderingz"),
            ]);
            read.val = {
                progress: toIndexedArray(progress ?? []),
                completions: toIndexedArray(completions ?? []),
                purchases,
                achieveReg,
                taskDescriptions: toIndexedArray(taskDescriptions ?? []),
                shopDescriptions,
                achievements,
                ordering,
            };
            show();
        });

    const shown = (tabId) => (read.val, world.val, lists.get(tabId).entries).filter(({ row }) => shownBySearch(row));
    // Max all only raises (and brings a value above its max down to it); Complete all only completes: one press each.
    const fill = (tabId, label, target) => () =>
        div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label,
                status: bulk.status,
                disabled: () => loading.val || shown(tabId).every((item) => Number(stateOf(item).val) === target(item)),
                onClick: (e) => {
                    e.preventDefault();
                    return bulk.run(() =>
                        runBulkSet({
                            entries: shown(tabId),
                            getTargetValue: target,
                            getValueState: stateOf,
                            getPath: (item) => item.key,
                        })
                    );
                },
            })
        );
    const stateOf = (item) => getOrCreateState(states, item.key);
    const WORDS = { tasks: "task", achievements: "achievement", "merit-shop": "merit upgrade" };
    const word = (tabId, n) => `${WORDS[tabId]}${n === 1 ? "" : "s"}`;
    const worldName = () => WORLDS[Number(world.val)].label;

    // The world, picked on the line under the title like a character: its name and the world's own under it.
    const pick = PickInPlace({
        name: "World",
        opener: worldName,
        options: () => WORLDS,
        picked: () => world.val,
        // The world's rows at once, then the game read again: a value saved since the last read shows what landed.
        onPick: (id) => {
            world.val = id;
            show();
            void load();
        },
        disabled: () => loading.val,
        openerClass: "character-picker__opener",
        panelClass: "character-picker__list",
    });
    pick.panel.tabIndex = -1;
    const worldPicker = div(
        {
            class: "character-picker",
            onfocusout: (e) => {
                if (pick.isOpen() && !worldPicker.contains(e.relatedTarget)) pick.close();
            },
        },
        div(
            { class: "character-picker__line" },
            span({ class: "character-picker__label" }, "World"),
            pick.opener,
            span({ class: "character-picker__info" }, () => WORLDS[Number(world.val)].note)
        ),
        pick.panel
    );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Task Board",
        description: "Each world's tasks, achievements and merit shop.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        toolbar: worldPicker,
        state: { loading, error },
        loadingText: "Reading the task board",
        errorTitle: "Couldn't read the task board",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Task Board",
                page: "account.taskboard",
                busy: () => bulk.status.val === "loading",
                // A question asked for one world asks again once another is picked.
                setAll: { word: (n, tabId) => word(tabId, n), placeholder: "Progress", askedFor: () => world.val },
                tabs: TABS.map((tab) => ({ ...tab, content: lists.get(tab.id).node })),
                tools: toolsPerTab({
                    tasks: fill("tasks", "Max all", (item) => item.max),
                    achievements: fill("achievements", "Complete all", () => COMPLETE),
                    "merit-shop": fill("merit-shop", "Max all", (item) => item.max),
                }),
                // The tools act on what isn't done yet: a complete achievement keeps its -1 (Set all leaves it).
                toolsLabel: (activeId) => {
                    const tab = activeId.val;
                    const items = shown(tab).filter(
                        (item) => tab !== "achievements" || Number(stateOf(item).val) !== COMPLETE
                    );
                    const n = items.length;
                    const what = tab === "achievements" ? `unfinished ${word(tab, n)}` : word(tab, n);
                    return `${isSearching() ? `${n} matching ${what}` : `All ${n} ${what}`} in ${worldName()}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "account.taskboard",
    world: "account",
    system: "Task Board",
    description: "Each world's tasks, achievements and merit shop purchases.",
    keywords: ["Tasks", "Achievements", "Merits", "Merit Shop"],
    tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label })),
    component: TaskBoardTab,
});
