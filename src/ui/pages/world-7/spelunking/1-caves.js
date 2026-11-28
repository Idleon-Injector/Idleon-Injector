/**
 * W7 - Spelunking: Caves
 *
 * One list: each cave's records on one line (a table: Deepest, Manic deepest, Biggest haul, Grand discoveries), then
 * every object the caves hold, by cave, each with a Discovered switch (the Hat Rack's way), then any stored object the
 * game's list doesn't know. Add all sits in the tray and discovers the objects the top bar's search shows.
 *
 * Data sources:
 *   gga.Spelunk[1][c], [47][c], [2][c], [44][c] - cave c's deepest layer, manic deepest layer, biggest haul, grand
 *                                                discoveries (up to 10)
 *   gga.Spelunk[6]                              - the destroyed objects discovered, by id ("Rock_0_1")
 *   cList.Spelunky[6], [14], SpelunkRocks       - the caves' names and descriptions, each cave's objects
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    oneAtATime,
    resolveNumberInput,
    toInt,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const DISCOVERED_OBJECTS_PATH = "Spelunk[6]";

// A cave's records, each in its column; Grand discoveries go up to 10.
const CAVE_METRICS = [
    { key: "deepest", label: "Deepest", path: "Spelunk[1]" },
    { key: "manicDeepest", label: "Manic deepest", path: "Spelunk[47]" },
    { key: "haul", label: "Biggest haul", path: "Spelunk[2]", formatted: true, float: true },
    { key: "discoveries", label: "Grand discoveries", path: "Spelunk[44]", max: 10 },
];
const readMetric = (metric, raw) =>
    metric.key === "haul"
        ? resolveNumberInput(raw ?? 0, { formatted: true, float: true, min: 0, fallback: 0 })
        : metric.key === "discoveries"
          ? Math.min(10, toInt(raw, { min: 0 }))
          : toInt(raw, { min: 0 });

const normalizeStoredNames = (raw) =>
    toIndexedArray(raw ?? [])
        .map((entry) => String(entry ?? ""))
        .filter((entry) => entry.length > 0);

const normalizeCaveText = (raw) => toIndexedArray(raw ?? []).map((entry) => String(entry ?? "").trim());

const isMeaningfulCaveDefinition = (rawName, rawDescription) => {
    const name = String(rawName ?? "").trim();
    const description = String(rawDescription ?? "").trim();
    return Boolean(name) && !/^Name\d+$/i.test(name) && Boolean(description) && !/^\d+$/.test(description);
};

const buildObjectCatalog = (rawRocksByCave, caveNames) =>
    toIndexedArray(rawRocksByCave ?? []).flatMap((rawCaveObjects, caveIndex) =>
        toIndexedArray(rawCaveObjects ?? [])
            .slice(0, -1)
            .map((rawObject, objectIndex) => {
                const definition = toIndexedArray(rawObject ?? []);
                const objectId = String(definition[0] ?? "");
                if (!objectId) return null;

                return {
                    objectId,
                    objectIndex,
                    caveIndex,
                    caveName: cleanName(caveNames[caveIndex], `Cave ${caveIndex + 1}`),
                    name: cleanName(objectId, objectId),
                };
            })
            .filter(Boolean)
    );

const CaveRow = ({ row, metricStates }) =>
    ValueTableRow({
        name: row.name,
        info: span({ class: "account-row__name" }, row.name),
        fields: CAVE_METRICS.map((metric) => ({
            ...metric,
            valueState: getOrCreateState(metricStates[metric.key], row.index),
            paths: [`${metric.path}[${row.index}]`],
        })),
        read: async () => {
            const values = await Promise.all(CAVE_METRICS.map((metric) => gga(`${metric.path}[${row.index}]`)));
            return Object.fromEntries(CAVE_METRICS.map((metric, i) => [metric.key, readMetric(metric, values[i])]));
        },
        // Set all sets a cave's deepest layer.
        setAll: "deepest",
    });

// One object: its name, and a Discovered switch. A stored object the game's list doesn't know says so.
const ObjectRow = ({ object, isOn, onFlip }) =>
    AccountRow({
        info: span({ class: "account-row__name" }, object.name),
        badge: object.known ? null : "Not a known object",
        controls: StateSwitch({
            checked: isOn,
            words: ["Discovered", ""],
            name: `${object.name} discovered`,
            ownStatus: true,
            onFlip,
        }),
    });

function SpelunkingCavesTab() {
    const { loading, error, run } = useAccountLoad({ label: "Spelunking Caves" });
    const metricStates = Object.fromEntries(CAVE_METRICS.map((metric) => [metric.key, new Map()]));
    const caveRowsState = van.state([]);
    const discovered = van.state([]);
    const objects = van.state([]);
    const bulk = useWriteStatus();
    // Changes run one at a time, each from the list the game holds when its turn comes.
    const inTurn = oneAtATime();
    const caveListNode = div();
    const reconcileCaveRows = createStaticRowReconciler(caveListNode);
    const objectListNode = div();
    const reconcileObjectGroups = createStaticRowReconciler(objectListNode);
    const rowOf = new Map();
    let objectCatalogCache = [];

    const reconcileCaves = () => {
        reconcileCaveRows(caveRowsState.val.map((row) => row.rawName).join("|"), () =>
            caveRowsState.val.map((row) => CaveRow({ row, metricStates }))
        );
    };

    // Every object, by cave, then any stored one the game's list doesn't know. Rows are kept by object, so a switch
    // keeps its focus and its save's state; the groups are rebuilt only when the objects in them change.
    const applyDiscovered = (rawNames) => {
        discovered.val = normalizeStoredNames(rawNames);
        const known = new Set(objectCatalogCache.map((entry) => entry.objectId));
        const next = [
            ...objectCatalogCache.map((entry) => ({ ...entry, known: true })),
            ...discovered.val
                .filter((id) => !known.has(id))
                .map((id) => ({ objectId: id, name: cleanName(id, id), caveName: "Other", known: false })),
        ];
        // A row whose object left the list is made again if it comes back (an undo): VanJS drops a detached row's
        // bindings.
        const ids = new Set(next.map((object) => object.objectId));
        for (const id of rowOf.keys()) if (!ids.has(id)) rowOf.delete(id);
        for (const object of next)
            if (!rowOf.has(object.objectId))
                rowOf.set(
                    object.objectId,
                    ObjectRow({
                        object,
                        isOn: () => discovered.val.includes(object.objectId),
                        onFlip: (on) => (on ? addObjects([object.objectId]) : removeObject(object.objectId)),
                    })
                );
        reconcileObjectGroups(next.map((object) => `${object.caveName}:${object.objectId}`).join("|"), () =>
            [...new Set(next.map((object) => object.caveName))].map((cave) =>
                AccountSection({
                    title: `${cave} objects`,
                    body: next.filter((object) => object.caveName === cave).map((o) => rowOf.get(o.objectId)),
                })
            )
        );
        objects.val = next;
    };

    const load = async () =>
        run(async () => {
            const [rawCaveNames, rawCaveDescriptions, rawObjectDefinitions] = await Promise.all([
                readCList("Spelunky[6]"),
                readCList("Spelunky[14]"),
                readCList("SpelunkRocks"),
            ]);
            const caveNames = normalizeCaveText(rawCaveNames);
            const caveDescriptions = normalizeCaveText(rawCaveDescriptions);
            objectCatalogCache = buildObjectCatalog(rawObjectDefinitions, caveNames);
            caveRowsState.val = caveNames
                .map((rawName, index) => ({
                    index,
                    rawName,
                    rawDescription: caveDescriptions[index],
                    name: cleanName(rawName, `Cave ${index + 1}`),
                }))
                .filter((row) => isMeaningfulCaveDefinition(row.rawName, row.rawDescription));
            reconcileCaves();

            const [rawMetrics, rawDestroyedObjects] = await Promise.all([
                Promise.all(CAVE_METRICS.map((metric) => gga(metric.path))),
                gga(DISCOVERED_OBJECTS_PATH),
            ]);
            CAVE_METRICS.forEach((metric, m) => {
                const values = toIndexedArray(rawMetrics[m] ?? []);
                for (const row of caveRowsState.val)
                    getOrCreateState(metricStates[metric.key], row.index).val = readMetric(metric, values[row.index]);
            });

            applyDiscovered(rawDestroyedObjects);
        });

    // Edits start from the game's list as it is now, not the page's last read: the game adds to it as objects are
    // destroyed. Whatever happens, the page then shows the list the game holds. `changing` counts the ones asked for
    // and not ended yet, so Add all stays pressable while a switch-off waits.
    const changing = van.state(0);
    const change = (edit) => {
        changing.val++;
        return inTurn(async () => {
            try {
                return (await edit(normalizeStoredNames(await gga(DISCOVERED_OBJECTS_PATH)))) ?? { ok: true };
            } finally {
                try {
                    applyDiscovered(await gga(DISCOVERED_OBJECTS_PATH));
                } catch {
                    // ponytail: the picture stays as it was; the next change reads the game again before it writes.
                }
            }
        }).finally(() => changing.val--);
    };

    const addObjects = (objectIds) =>
        change(async (currentNames) => {
            const toAdd = objectIds.filter((objectId) => !currentNames.includes(objectId));
            if (toAdd.length === 0) return { cancelled: true };
            // The whole list in one write, so Undo has the list as it was. The page shows the list the write read
            // back, until the read after it shows the game's.
            applyDiscovered(await writeVerified(DISCOVERED_OBJECTS_PATH, [...currentNames, ...toAdd]));
            return { ok: true };
        });

    const removeObject = (objectId) =>
        change(async (currentNames) => {
            const index = currentNames.indexOf(objectId);
            if (index < 0) return { cancelled: true };
            applyDiscovered(
                await writeVerified(
                    DISCOVERED_OBJECTS_PATH,
                    currentNames.filter((_, other) => other !== index)
                )
            );
            return { ok: true };
        });

    // The objects the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => objects.val.filter((object) => shownBySearch(rowOf.get(object.objectId)));
    const missing = () => shown().filter((object) => object.known && !discovered.val.includes(object.objectId));
    const objectWord = (n) => `object${n === 1 ? "" : "s"}`;

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container spelunking-caves-tab",
        title: "Caves",
        description: "Each cave's records, and the destroyed objects you have discovered.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the caves",
        errorTitle: "Couldn't read the caves",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "value-table--wide",
                empty: () => (caveRowsState.val.length || objects.val.length ? null : "No caves found"),
                setAll: { word: (n) => (n === 1 ? "cave" : "caves"), placeholder: "Deepest" },
                // Discovering only adds, so it runs on one press.
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Add all",
                            status: bulk.status,
                            disabled: () => loading.val || (!missing().length && !changing.val),
                            onClick: (e) => {
                                e.preventDefault();
                                // Every known object shown: its turn adds the ones the game's list lacks then, so a
                                // switch-off still saving when this was pressed is discovered again too.
                                const ids = shown()
                                    .filter((object) => object.known)
                                    .map((object) => object.objectId);
                                return bulk.run(() => addObjects(ids));
                            },
                        })
                    ),
                // Set all sets the caves' deepest layers; Add all discovers the objects.
                toolsLabel: () => {
                    const n = shown().length;
                    const found = shown().filter((object) => discovered.val.includes(object.objectId)).length;
                    return `${isSearching() ? "Matching: " : ""}${found} of ${n} ${objectWord(n)} discovered`;
                },
                body: [
                    AccountSection({
                        title: "Records",
                        body: [
                            ValueTableHead({ name: "Cave", columns: CAVE_METRICS.map((metric) => metric.label) }),
                            caveListNode,
                        ],
                    }),
                    objectListNode,
                ],
            })
        ),
    });
}

export default definePage({
    id: "w7.spelunking.caves",
    world: 7,
    system: "Spelunking",
    tab: "Caves",
    description: "Cave records and the destroyed objects you have discovered.",
    keywords: ["Spelunk", "Cave Records", "Destroyed Objects"],
    component: SpelunkingCavesTab,
});
