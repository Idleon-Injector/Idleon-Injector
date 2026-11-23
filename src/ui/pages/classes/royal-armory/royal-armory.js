/**
 * Classes - Royal Armory (Royal Guardian)
 *
 * One page, the Royal Guardian's screens as its tabs: the Armory's upgrades, the royal resources, the resource nodes
 * on the world maps, the Royal Statues, the outposts, and the Lil' Orblet Shop.
 *
 * Data sources:
 *   gga.RoyalG[2][n]       - Armory upgrade n's level (cList.ArmoryUpg: [0] name, [4] max level, 999999 for none, [9]
 *                            its line), shown in the order cList.Research[43] lists (the shelf)
 *   gga.RoyalG[1][r]       - royal resource r (ten per world; only the kinds the nodes give are real)
 *   gga.RoyalG[4][i], [5]  - node i's collected amount (-1 when Empty) and its grade (cList.RoyalResources: [x, y,
 *                            base amount, resource], 20 a world, resource -1 for none)
 *   gga.RoyalG[0][s]       - Royal Statue s's level, 0 while locked (cList.Research[40]: its bonus; "4" to "7" are
 *                            statues still to come)
 *   gga.RoyalMaps[m]       - map m: a built outpost (13 values: [0-2] Barracks, Logistics, Education, [3-7] rank EXP,
 *                            [10] type, [11] slots, one digit each, [12] glorified), or [kills toward building one]
 *   gga.RoyalG[6-13]       - the map units of W1 to W4, a type list and a map list each
 *   gga.RoyalG[23][n]      - Lil' Orblet Shop upgrade n's level (cList.OrbletMarket: [0] name, [3] max level, [6] line)
 */

import {
    BUILT_OUTPOST_LENGTH,
    MAP_UNIT_ARRAYS,
    MAP_UNIT_ORDER,
    UNIT_REBUILD_DISPLAY_SHELVES,
    buildDistributedUnitArrays,
    decodeSlots,
    encodeSlots,
    normalizeSlotsForCapacity,
    refreshRoyalGuardUnitCaches,
    resetRoyalGuardUnitsToVanilla,
    unlockedSlotCount,
} from "../../../components/views/account/royalGuardDomain.js";
import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { NumberInput } from "../../../components/NumberInput.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { MasterclassPage, UpgradesPart, plural } from "../../../components/views/account/masterclassParts.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    normalCase,
    oneAtATime,
    runBulkSet,
    toInt,
    toNum,
    unwrapH,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { button, div, span } = van.tags;

const WORLDS = 7;
const worldOfMap = (m) => Math.floor(m / 50) + 1;
// A royal resource has no name in the game, only its picture: its number in its world.
const resourceName = (r) => `Resource ${(r % 10) + 1}`;

// ---- Upgrades ----------------------------------------------------------------------------------------------------

// Some shelves add or remove map units (militia, Kingdom Sovereignty): the units are built again from the levels.
const rebuildsUnits = (upgrades) => upgrades.some((upgrade) => UNIT_REBUILD_DISPLAY_SHELVES.has(upgrade.shelf));

const UpgradesTab = ({ pending, reload, bulk }) =>
    UpgradesPart({
        levelsPath: "RoyalG[2]",
        definitions: "ArmoryUpg",
        orderPath: "Research[43]",
        words: ["upgrade", "upgrades"],
        // In the outposts' unit queue, so a rebuild and an outpost's unit change never interleave.
        afterSave: (upgrade) => (rebuildsUnits([upgrade]) ? unitWrites(resetRoyalGuardUnitsToVanilla) : null),
        afterBulk: (upgrades) => (rebuildsUnits(upgrades) ? unitWrites(resetRoyalGuardUnitsToVanilla) : null),
        pending,
        reload,
        bulk,
    });

// ---- Resources ---------------------------------------------------------------------------------------------------

// The nodes on the world maps, and the resource kinds they give.
const readNodes = async () =>
    toIndexedArray((await readCList("RoyalResources")) ?? [])
        .map((raw, i) => ({ i, resource: toInt(toIndexedArray(raw ?? [])[3], { min: -1, fallback: -1 }) }))
        .filter((node) => node.resource >= 0);

const ResourcesTab = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const [nodes, rawOwned] = await Promise.all([readNodes(), gga("RoyalG[1]")]);
            const owned = toIndexedArray(rawOwned ?? []);
            const kinds = [...new Set(nodes.map((node) => node.resource))].sort((a, b) => a - b);
            list.show(
                kinds.map((r) => ({
                    key: String(r),
                    name: resourceName(r),
                    section: `World ${Math.floor(r / 10) + 1}`,
                    path: `RoyalG[1][${r}]`,
                    value: toNum(owned[r], 0),
                }))
            );
        },
    };
};

// ---- Nodes -------------------------------------------------------------------------------------------------------

const EMPTY = -1;

// `bulk` is the page's, so the nodes' tools and Set all never write at once.
const NodesTab = ({ pending, reload, bulk }) => {
    const nodes = van.state([]);
    const states = new Map();
    const stateOf = (i, key) => getOrCreateState(states, `${i}:${key}`);
    const rowOf = new Map();
    const worldNodes = Array.from({ length: 4 }, () => div());
    const reconcilers = worldNodes.map(createStaticRowReconciler);
    const counts = worldNodes.map(() => van.state(0));
    const collectedPath = (node) => `RoyalG[4][${node.i}]`;

    // A node's grade and what was collected from it; "Empty" before them when it is.
    const NodeRow = (node) => {
        const row = ValueTableRow({
            name: node.name,
            info: RowTitles({ bonus: resourceName(node.resource), name: node.name }),
            badge: () => (stateOf(node.i, "empty").val ? "Empty" : ""),
            // Set all sets every node's grade; what was collected stays each node's own (Refill all, Empty all).
            setAll: "grade",
            fields: [
                { key: "grade", label: "Grade", valueState: stateOf(node.i, "grade"), paths: [`RoyalG[5][${node.i}]`] },
                {
                    key: "collected",
                    label: "Collected",
                    valueState: stateOf(node.i, "collected"),
                    paths: [collectedPath(node)],
                    formatted: true,
                },
            ],
            read: async () => {
                const [grade, collected] = await Promise.all([gga(`RoyalG[5][${node.i}]`), gga(collectedPath(node))]);
                stateOf(node.i, "empty").val = toNum(collected, 0) === EMPTY;
                return { grade: toInt(grade, { min: 0 }), collected: toInt(collected, { min: 0 }) };
            },
            // A collected amount typed in fills it again from there.
            afterWrite: (changed) => {
                if (changed.includes("collected")) stateOf(node.i, "empty").val = false;
            },
        });
        rowOf.set(node.i, row);
        return row;
    };

    const shown = () => nodes.val.filter((node) => shownBySearch(rowOf.get(node.i)));
    const word = ["node", "nodes"];
    // Refill puts a node back to full (nothing collected); Empty takes all of it.
    const setAll = async (entries, value) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => value,
                getValueState: (node) => ({
                    val: stateOf(node.i, "empty").val ? EMPTY : stateOf(node.i, "collected").val,
                }),
                getPath: collectedPath,
                applyLocal: (node) => {
                    stateOf(node.i, "empty").val = value === EMPTY;
                    stateOf(node.i, "collected").val = 0;
                },
            })
        );
        if (!result.ok && !result.cancelled) await reload();
    };
    const isEmpty = (node) => stateOf(node.i, "empty").val;
    const isFull = (node) => !isEmpty(node) && stateOf(node.i, "collected").val === 0;

    return {
        content: div(
            { class: "royal-nodes" },
            ...worldNodes.map((node, w) =>
                div(
                    { hidden: () => !counts[w].val },
                    AccountSection({
                        title: `World ${w + 1}`,
                        body: [ValueTableHead({ name: "Node", columns: ["Grade", "Collected"] }), node],
                    })
                )
            )
        ),
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [found, rawCollected, rawGrades] = await Promise.all([
                readNodes(),
                gga("RoyalG[4]"),
                gga("RoyalG[5]"),
            ]);
            const collected = toIndexedArray(rawCollected ?? []);
            const grades = toIndexedArray(rawGrades ?? []);
            const next = found.map((node) => ({
                ...node,
                world: Math.floor(node.i / 20) + 1,
                name: `Node ${(node.i % 20) + 1}`,
            }));
            worldNodes.forEach((_, w) => {
                const own = next.filter((node) => node.world === w + 1);
                reconcilers[w](own.map((node) => `${node.i}:${node.resource}`).join("|"), () => own.map(NodeRow));
                counts[w].val = own.length;
            });
            next.forEach((node) => {
                const amount = toNum(collected[node.i], 0);
                stateOf(node.i, "empty").val = amount === EMPTY;
                stateOf(node.i, "collected").val = Math.max(0, Math.floor(amount));
                stateOf(node.i, "grade").val = toInt(grades[node.i], { min: 0 });
            });
            nodes.val = next;
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${word[n === 1 ? 0 : 1]}` : `All ${plural(n, word)}`;
        },
        setAllWord: (n) => word[n === 1 ? 0 : 1],
        setAllPlaceholder: "Grade",
        tools: (ask) => {
            const emptyAll = ActionButton({
                label: "Empty all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shown().some((node) => !isEmpty(node)),
                onClick: (e) => {
                    e.preventDefault();
                    const entries = shown().filter((node) => !isEmpty(node));
                    ask({
                        question: `Empty ${plural(entries.length, word)}?`,
                        confirmLabel: entries.length === 1 ? "Empty it" : "Empty them",
                        from: emptyAll,
                        onConfirm: () => setAll(entries, EMPTY),
                    });
                },
            });
            return div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Refill all",
                    status: bulk.status,
                    disabled: () => pending() || shown().every(isFull),
                    onClick: (e) => {
                        e.preventDefault();
                        return setAll(
                            shown().filter((node) => !isFull(node)),
                            0
                        );
                    },
                }),
                emptyAll
            );
        },
    };
};

// ---- Royal Statues -----------------------------------------------------------------------------------------------

const StatuesTab = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const [rawBonuses, rawLevels] = await Promise.all([readCList("Research[40]"), gga("RoyalG[0]")]);
            const levels = toIndexedArray(rawLevels ?? []);
            list.show(
                toIndexedArray(rawBonuses ?? [])
                    .map((raw, s) => ({ s, raw: String(raw ?? "") }))
                    // "4" to "7": statues still to come.
                    .filter(({ s, raw }) => !/^\d+$/.test(raw) && s < levels.length)
                    .map(({ s, raw }) => ({
                        key: String(s),
                        name: normalCase(raw.replace(/^.*千/, "")),
                        path: `RoyalG[0][${s}]`,
                        value: toInt(levels[s], { min: 0 }),
                        formatted: false,
                        badge: (level) => (Number(level) > 0 ? "" : "Locked"),
                    }))
            );
        },
    };
};

// ---- Outposts ----------------------------------------------------------------------------------------------------

const LEVELS = [
    { index: 0, key: "barracks", label: "Barracks" },
    { index: 1, key: "logistics", label: "Logistics" },
    { index: 2, key: "education", label: "Education" },
];
const RANKS = [
    { index: 3, key: "trading", label: "Trading" },
    { index: 4, key: "intel", label: "Intel" },
    { index: 5, key: "command", label: "Command" },
    { index: 6, key: "military", label: "Military" },
    { index: 7, key: "purity", label: "Purity" },
];
const TYPES = [
    { value: 0, label: "Resource Depot" },
    { value: 1, label: "Support Camp" },
    { value: 2, label: "Savage" },
];
const SLOT_KINDS = [
    { value: 1, label: "Locked" },
    { value: 2, label: "Worker" },
    { value: 3, label: "Trader" },
    { value: 4, label: "Guard" },
    { value: 5, label: "Surveyor" },
];
// The most slots an outpost opens (one, and one a Barracks level up to five).
const SLOTS = 6;
const UNIT_KINDS = [
    { value: 5, label: "Commander" },
    { value: 6, label: "Knight" },
    { value: 4, label: "Militia" },
    { value: 7, label: "Priest" },
];
const unitLabel = (type) => UNIT_KINDS.find((kind) => kind.value === Number(type))?.label ?? `Unit ${type}`;
const DEFAULT_OUTPOST = [0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 211111111, 0];
const DEFAULT_UNITS = { 5: 1, 6: 4, 4: 5, 7: 1 };
const UNIT_GONE = "that unit is no longer on this map";

const readUnitPair = async (typeArray, mapArray) => {
    const [rawTypes, rawMaps] = await Promise.all([gga(`RoyalG[${typeArray}]`), gga(`RoyalG[${mapArray}]`)]);
    return { types: toIndexedArray(rawTypes ?? []).slice(), maps: toIndexedArray(rawMaps ?? []).slice() };
};

// A map unit in the lists the game holds now: where the page read it, or, when another unit change moved it, the same
// kind of unit on the same map (units of one kind on one map are alike). -1 when there is none.
const findUnit = (types, maps, unit) =>
    Number(types[unit.unitIndex]) === unit.type && Number(maps[unit.unitIndex]) === unit.mapId
        ? unit.unitIndex
        : types.findIndex((type, index) => Number(type) === unit.type && Number(maps[index]) === unit.mapId);

const mapName = (mapId, names) => cleanName(names[mapId], `Map ${mapId}`) || `Map ${mapId}`;

// How many kills the game asks for before an outpost can be built on a map.
const killsToBuild = (mapId, mapDetails, overrides) => {
    const own = unwrapH(overrides) ?? {};
    if (Object.prototype.hasOwnProperty.call(own, String(mapId))) return toNum(own[String(mapId)], 0);
    const detail = toIndexedArray(unwrapH(toIndexedArray(unwrapH(mapDetails[mapId]) ?? [])[0]) ?? []);
    const w = Math.floor(mapId / 50);
    return (
        3 *
        (25 +
            5 * mapId +
            toNum(detail[0], 0) * Math.pow(1.3 - 0.01 * w, 0.2 * (mapId - 50 * w)) * 4 ** w * (1 + 29 * Math.min(1, w)))
    );
};

const readOutposts = async () => {
    const [rawMaps, rawDetails, rawOverrides, rawRoyalG, rawNames] = await Promise.all([
        gga("RoyalMaps"),
        gga("CustomLists.h.MapDetails"),
        gga("CustomMaps.h.RG_KillReq.h"),
        gga("RoyalG"),
        readCList("MapDispName"),
    ]);
    const royalG = toIndexedArray(rawRoyalG ?? []);
    const details = toIndexedArray(rawDetails ?? []);
    const names = toIndexedArray(rawNames ?? []);
    const unitsOn = new Map();
    Object.entries(MAP_UNIT_ARRAYS).forEach(([world, arrays]) => {
        const types = toIndexedArray(royalG[arrays.typeArray] ?? []);
        const maps = toIndexedArray(royalG[arrays.mapArray] ?? []);
        for (let unitIndex = 0; unitIndex < Math.max(types.length, maps.length); unitIndex++) {
            const mapId = toInt(maps[unitIndex], { min: 0, fallback: -1 });
            if (mapId < 0) continue;
            const unit = {
                world: Number(world),
                unitIndex,
                type: toInt(types[unitIndex], { min: 0 }),
                mapId,
                ...arrays,
            };
            unitsOn.set(mapId, [...(unitsOn.get(mapId) ?? []), unit]);
        }
    });
    const outposts = toIndexedArray(rawMaps ?? [])
        .map((row, mapId) => {
            const world = worldOfMap(mapId);
            if (!Array.isArray(row) || world > WORLDS) return null;
            const base = { mapId, world, name: mapName(mapId, names), units: unitsOn.get(mapId) ?? [] };
            if (row.length >= BUILT_OUTPOST_LENGTH) return { ...base, kind: "built", row };
            if (row.length === 1 && Number.isFinite(Number(row[0]))) {
                const killReq = killsToBuild(mapId, details, rawOverrides);
                return { ...base, kind: "kills", kills: toNum(row[0], 0), killReq };
            }
            return null;
        })
        .filter(Boolean);
    // Only W1-W4 have map unit lists the page knows, so only their outposts are populated.
    const builtByWorld = {};
    for (const outpost of outposts)
        if (outpost.kind === "built" && MAP_UNIT_ARRAYS[outpost.world])
            builtByWorld[outpost.world] = [...(builtByWorld[outpost.world] ?? []), outpost.mapId];
    return { outposts, royalG, builtByWorld };
};

// A pick that saves on the press, its words where the list's first column starts. A refused one goes back to what the
// game holds and says why on the outpost. `locked` says why it can't be picked yet, in its place; `extra` comes after it.
const PickLine = ({ name, label = name, steps, state, write, said, onFailed = null, locked = null, extra = null }) => {
    const { status, run } = useWriteStatus();
    const picked = van.state(state.val);
    van.derive(() => (picked.val = state.val));
    return AccountRow({
        status,
        rowClass: "value-row outpost-pick",
        info: span({ class: "account-row__name" }, label),
        controls: [
            div(
                { class: "value-cells" },
                div(
                    {
                        class: `value-cell value-cell--steps outpost-pick__cell${extra ? " outpost-pick__cell--short" : ""}`,
                    },
                    span({ class: "outpost-pick__locked", hidden: () => !locked?.() }, () => locked?.() ?? ""),
                    div(
                        { hidden: () => Boolean(locked?.()) },
                        StepPicker({
                            name,
                            steps,
                            picked: () => picked.val,
                            onPick: async (value) => {
                                picked.val = value;
                                said.clear();
                                const result = await run(() => write(value));
                                if (result.ok) return;
                                picked.val = state.val;
                                said.say("failed", `${name} not saved: ${saveFailureReason(result.error)}`);
                                if (onFailed) await onFailed();
                            },
                        })
                    )
                ),
                extra ? div({ class: "value-cell outpost-pick__extra" }, extra) : null
            ),
        ],
    });
};

// The map unit lists are shared by every outpost of a world, and an upgrade shelf rebuilds them: each change to them
// runs after the last one ended.
const unitWrites = oneAtATime();

// A change to the map unit lists, then the game's unit totals per map (DNSM TotUnitzAllMapz) go, so it counts them
// again, as Reset to the game's does. A failed change may have landed, so they go then too.
const withUnitTotals = (task) => async () => {
    try {
        await task();
    } catch (error) {
        await refreshRoyalGuardUnitCaches().catch(() => {});
        throw error;
    }
    await refreshRoyalGuardUnitCaches();
};

const OutpostsTab = ({ pending, reload }) => {
    const openMap = van.state(-1);
    const read = van.state({ outposts: [], royalG: [], builtByWorld: {} });
    // mapId -> { kind, node, update }: a reload keeps each row, and what is typed or said in it.
    const rows = new Map();
    const worldNodes = Array.from({ length: WORLDS }, () => ({ built: div(), kills: div({ class: "outpost-kills" }) }));
    const reconcilers = worldNodes.map(({ built, kills }) => ({
        built: createStaticRowReconciler(built),
        kills: createStaticRowReconciler(kills),
    }));
    const counts = worldNodes.map(() => ({ built: van.state(0), kills: van.state(0) }));

    // ---- A built outpost: its levels on the line, the rest when it opens.
    const BuiltRow = (first) => {
        const outpost = { ...first };
        const { mapId } = outpost;
        const said = useSaid();
        const at = (index) => `RoyalMaps[${mapId}][${index}]`;
        const levels = Object.fromEntries([...LEVELS, ...RANKS].map((field) => [field.key, van.state(0)]));
        const type = van.state(0);
        const glorified = van.state(0);
        const slots = van.state(111111111);
        const isOpen = () => openMap.val === mapId;
        // The slot value is one number: the slot picks and the barracks' slot fix save it one at a time.
        const slotWrites = oneAtATime();
        const readFields = async (fields) => {
            const values = await Promise.all(fields.map((field) => gga(at(field.index))));
            return Object.fromEntries(fields.map((field, i) => [field.key, toNum(values[i], 0)]));
        };
        const fieldsOf = (list, formatted) =>
            list.map((field) => ({ ...field, valueState: levels[field.key], paths: [at(field.index)], formatted }));

        // The slots a Barracks level opens, from the level and the slots the game holds now.
        const syncSlots = (barracks) =>
            slotWrites(async () => {
                const now = toInt(await gga(at(11)), { min: 0, fallback: 111111111 });
                const next = normalizeSlotsForCapacity(now, barracks);
                slots.val = now;
                if (next === now) return;
                await writeVerified(at(11), next);
                slots.val = next;
                await refreshRoyalGuardUnitCaches();
            });

        const SlotLine = (slot) =>
            PickLine({
                name: `Slot ${slot + 1}`,
                steps: SLOT_KINDS,
                state: van.derive(() => Number(decodeSlots(slots.val)[slot])),
                said,
                locked: () => (slot >= unlockedSlotCount(levels.barracks.val) ? `Opens at Barracks ${slot}` : null),
                // One at a time, each from what the game holds then, so a pick made while another saves keeps both.
                write: (kind) =>
                    slotWrites(async () => {
                        // A Barracks lowered since the pick may have locked the slot: the pick goes no further.
                        const [raw, barracks] = await Promise.all([gga(at(11)), gga(at(0))]);
                        if (slot >= unlockedSlotCount(toNum(barracks, 0))) throw new Error(`Opens at Barracks ${slot}`);
                        const next = decodeSlots(raw);
                        next[slot] = String(kind);
                        const value = encodeSlots(next);
                        try {
                            await writeVerified(at(11), value);
                        } catch (error) {
                            // The write may have landed: the slots show what the game holds now.
                            slots.val = await gga(at(11)).then(
                                (raw) => toInt(raw, { min: 0, fallback: 111111111 }),
                                () => slots.val
                            );
                            await refreshRoyalGuardUnitCaches().catch(() => {});
                            throw error;
                        }
                        slots.val = value;
                        await refreshRoyalGuardUnitCaches();
                    }),
            });

        // A unit change runs after any other on the page, then the page reads the game again, whatever happened.
        const changeUnits = (failed, run, task) => {
            said.clear();
            return run(
                async () => {
                    try {
                        await unitWrites(withUnitTotals(task));
                    } finally {
                        await reload();
                    }
                },
                { onError: (error) => said.say("failed", `${failed}: ${saveFailureReason(error)}`) }
            );
        };

        const UnitLine = (unit, n) => {
            const kind = van.state(unit.type);
            const remove = useWriteStatus();
            return PickLine({
                name: `Unit ${n + 1}`,
                steps: UNIT_KINDS,
                state: kind,
                said,
                write: (value) =>
                    unitWrites(
                        withUnitTotals(async () => {
                            const { types, maps } = await readUnitPair(unit.typeArray, unit.mapArray);
                            const index = findUnit(types, maps, unit);
                            if (index < 0) throw new Error(UNIT_GONE);
                            await writeVerified(`RoyalG[${unit.typeArray}][${index}]`, value);
                            Object.assign(unit, { unitIndex: index, type: value });
                            kind.val = value;
                        })
                    ).finally(reload),
                extra: ActionButton({
                    label: "Remove",
                    variant: "danger",
                    className: "btn-sm outpost-unit__remove",
                    status: remove.status,
                    onClick: (e) => {
                        e.preventDefault();
                        return changeUnits("Unit not removed", remove.run, async () => {
                            const { types, maps } = await readUnitPair(unit.typeArray, unit.mapArray);
                            // Found again in what the game holds now: another Remove may have moved it.
                            const index = findUnit(types, maps, unit);
                            if (index < 0) throw new Error(UNIT_GONE);
                            types.splice(index, 1);
                            maps.splice(index, 1);
                            await writeManyVerified([
                                { path: `RoyalG[${unit.typeArray}]`, value: types },
                                { path: `RoyalG[${unit.mapArray}]`, value: maps },
                            ]);
                        });
                    },
                }),
            });
        };

        const add = useWriteStatus();
        const arrays = MAP_UNIT_ARRAYS[outpost.world];
        const AddLine = () =>
            AccountRow({
                status: add.status,
                rowClass: "value-row outpost-pick",
                info: span({ class: "account-row__name" }, "Add a unit"),
                controls: div(
                    { class: "value-cells" },
                    div(
                        { class: "value-cell value-cell--steps outpost-pick__cell outpost-add" },
                        ...UNIT_KINDS.map((kind) =>
                            ActionButton({
                                label: kind.label,
                                className: "btn-sm",
                                status: add.status,
                                onClick: (e) => {
                                    e.preventDefault();
                                    return changeUnits("Unit not added", add.run, async () => {
                                        const { types, maps } = await readUnitPair(arrays.typeArray, arrays.mapArray);
                                        types.push(kind.value);
                                        maps.push(mapId);
                                        await writeManyVerified([
                                            { path: `RoyalG[${arrays.typeArray}]`, value: types },
                                            { path: `RoyalG[${arrays.mapArray}]`, value: maps },
                                        ]);
                                    });
                                },
                            })
                        )
                    )
                ),
            });

        // Only the unit lines are built again on a reload, and only when the game's units differ from what they show.
        const unitList = div();
        const unitKey = (units) => units.map((unit) => `${unit.unitIndex}:${unit.type}`).join("|");
        let shownUnits = null;
        const setUnits = (units) => {
            if (shownUnits !== null && unitKey(shownUnits) === unitKey(units)) return;
            shownUnits = units;
            unitList.replaceChildren(
                ...(units.length
                    ? units.map(UnitLine)
                    : [AccountRow({ info: span({ class: "account-row__name outpost-none" }, "No units here") })])
            );
        };

        const typeWord = () =>
            [TYPES.find((t) => t.value === type.val)?.label, glorified.val === 1 ? "Glorified" : ""]
                .filter(Boolean)
                .join(" · ");
        const row = ValueTableRow({
            name: outpost.name,
            info: button(
                {
                    type: "button",
                    class: "row-opener",
                    "aria-expanded": () => String(isOpen()),
                    onclick: () => (openMap.val = isOpen() ? -1 : mapId),
                },
                RowTitles({ bonus: outpost.name, name: typeWord })
            ),
            fields: fieldsOf(LEVELS, false),
            read: () => readFields(LEVELS),
            // The Barracks level as saved (the line takes it after this): the slots follow it.
            afterWrite: async (changed) => {
                if (changed.includes("barracks")) await syncSlots(toNum(await gga(at(0)), 0));
            },
        });
        row.append(
            div(
                { class: "row-detail outpost-detail", hidden: () => !isOpen() },
                Said({ said: said.said, className: "said--line outpost-detail__said" }),
                div(
                    { class: "outpost-ranks" },
                    // One rank a line, its EXP in the Barracks column.
                    ValueTableHead({ name: "Rank", columns: ["EXP"] }),
                    ...RANKS.map((rank) =>
                        ValueTableRow({
                            name: `${outpost.name} ${rank.label.toLowerCase()} rank`,
                            info: span({ class: "account-row__name" }, rank.label),
                            fields: fieldsOf([rank], true).map((field) => ({ ...field, label: "EXP" })),
                            read: () => readFields([rank]),
                            // Command rank adds stationary units: the game counts them again.
                            afterWrite: () => (rank.key === "command" ? refreshRoyalGuardUnitCaches() : null),
                        })
                    )
                ),
                PickLine({
                    name: "Type",
                    steps: TYPES,
                    state: type,
                    said,
                    write: async (value) => {
                        await writeVerified(at(10), value);
                        type.val = value;
                    },
                    onFailed: reload,
                }),
                AccountToggleRow({
                    info: span({ class: "account-row__name" }, "Glorified"),
                    words: ["Glorified", ""],
                    name: `${outpost.name} glorified`,
                    checked: () => glorified.val === 1,
                    write: async (on) => {
                        try {
                            await writeVerified(at(12), on ? 1 : 0);
                            glorified.val = on ? 1 : 0;
                            await refreshRoyalGuardUnitCaches();
                        } catch (error) {
                            said.say("failed", `Glorified not saved: ${saveFailureReason(error)}`);
                            await reload();
                            throw error;
                        }
                    },
                }),
                AccountSection({ title: "Slots", body: Array.from({ length: SLOTS }, (_, slot) => SlotLine(slot)) }),
                AccountSection({ title: "Units", body: [unitList, arrays ? AddLine() : null] })
            )
        );
        const update = (next) => {
            Object.assign(outpost, next);
            [...LEVELS, ...RANKS].forEach((field) => (levels[field.key].val = toNum(next.row[field.index], 0)));
            type.val = toInt(next.row[10], { min: 0 });
            slots.val = toInt(next.row[11], { min: 0, fallback: 111111111 });
            glorified.val = toInt(next.row[12], { min: 0 });
            setUnits(next.units);
        };
        return { node: row, update };
    };

    // ---- A map still being cleared: its kills toward the outpost, the game's requirement as their cap. It opens on
    // Build, which puts a new outpost on the map.
    const KillsRow = (first) => {
        const outpost = { ...first };
        const { mapId } = outpost;
        const kills = van.state(0);
        const said = useSaid();
        const build = useWriteStatus();
        const mapWrites = oneAtATime();
        const isOpen = () => openMap.val === mapId;
        const path = `RoyalMaps[${mapId}][0]`;
        const node = ValueTableRow({
            name: outpost.name,
            info: button(
                {
                    type: "button",
                    class: "row-opener",
                    "aria-expanded": () => String(isOpen()),
                    onclick: () => (openMap.val = isOpen() ? -1 : mapId),
                },
                span({ class: "account-row__name" }, outpost.name)
            ),
            fields: [
                {
                    key: "kills",
                    label: "Kills",
                    valueState: kills,
                    paths: [path],
                    formatted: true,
                    max: () => Math.ceil(outpost.killReq),
                },
            ],
            read: async () => ({ kills: toInt(await gga(path), { min: 0 }) }),
            // A kills save and Build take turns; once built, [0] is the Barracks level, so a kills save stops.
            runWrite: (task) =>
                mapWrites(async () => {
                    const record = await gga(`RoyalMaps[${mapId}]`);
                    if (Array.isArray(record) && record.length >= BUILT_OUTPOST_LENGTH)
                        throw new Error("Built here now. Refresh.");
                    return task();
                }),
        });
        node.append(
            div(
                { class: "row-detail", hidden: () => !isOpen() },
                AccountRow({
                    status: build.status,
                    info: div(
                        { class: "account-row__name-group" },
                        span({ class: "account-row__name" }, "Build an outpost here"),
                        Said({ said: said.said, className: "said--line" })
                    ),
                    controls: ActionButton({
                        label: "Build",
                        className: "btn-sm",
                        status: build.status,
                        onClick: async (e) => {
                            e.preventDefault();
                            said.clear();
                            const result = await build.run(() =>
                                mapWrites(() => writeVerified(`RoyalMaps[${mapId}]`, [...DEFAULT_OUTPOST]))
                            );
                            if (!result.ok) said.say("failed", `Not built: ${saveFailureReason(result.error)}`);
                            // The row turns into the outpost, or stays with the reason.
                            await reload();
                        },
                    }),
                })
            )
        );
        const update = (next) => {
            Object.assign(outpost, next);
            kills.val = Math.floor(next.kills);
        };
        return { node, update };
    };

    // ---- Units: how many of each kind Populate puts on every outpost of W1-W4: Populate's own fields, in the tray.
    const countOf = new Map(MAP_UNIT_ORDER.map((type) => [type, van.state(String(DEFAULT_UNITS[type] ?? 0))]));
    const unitWorlds = Object.keys(MAP_UNIT_ARRAYS).map(Number);
    const wanted = () =>
        Object.fromEntries(
            unitWorlds.map((world) => [
                world,
                Object.fromEntries(MAP_UNIT_ORDER.map((type) => [type, toInt(countOf.get(type).val, { min: 0 })])),
            ])
        );
    const builtIn = (builtByWorld) =>
        Object.fromEntries(Object.entries(builtByWorld).filter(([world]) => unitWorlds.includes(Number(world))));
    // What Populate would take away from `royalG`: units over the counts, and kinds it doesn't place.
    const unitsRemoved = (royalG, builtByWorld, counts = wanted()) =>
        buildDistributedUnitArrays(royalG, counts, builtIn(builtByWorld)).summaries.reduce(
            (sum, summary) =>
                sum +
                toIndexedArray(royalG[MAP_UNIT_ARRAYS[summary.world].typeArray] ?? []).length -
                summary.movedExisting,
            0
        );
    const unitsBulk = useWriteStatus();
    const populate = async (confirmed) => {
        // The counts and the removal as pressed, while the save waits its turn.
        const counts = wanted();
        await unitsBulk.run(async () => {
            try {
                await unitWrites(
                    withUnitTotals(async () => {
                        const royalG = toIndexedArray((await gga("RoyalG")) ?? []);
                        // Units the game added since the page read them would go without being asked.
                        if (unitsRemoved(royalG, read.val.builtByWorld, counts) > confirmed)
                            throw new Error("Map units changed in game. Press Populate again.");
                        const { rebuilt } = buildDistributedUnitArrays(royalG, counts, builtIn(read.val.builtByWorld));
                        await writeManyVerified(
                            Object.values(rebuilt).flatMap((entry) => [
                                { path: `RoyalG[${entry.typeArray}]`, value: entry.types },
                                { path: `RoyalG[${entry.mapArray}]`, value: entry.maps },
                            ])
                        );
                    })
                );
            } finally {
                await reload();
            }
        });
    };
    const resetUnits = () =>
        unitsBulk.run(async () => {
            try {
                await unitWrites(resetRoyalGuardUnitsToVanilla);
            } finally {
                await reload();
            }
        });

    return {
        content: div(
            { class: "royal-outposts" },
            ...worldNodes.map(({ built, kills }, w) =>
                div(
                    { hidden: () => !counts[w].built.val && !counts[w].kills.val },
                    AccountSection({
                        title: `World ${w + 1}`,
                        body: [
                            div(
                                { hidden: () => !counts[w].built.val },
                                ValueTableHead({ name: "Outpost", columns: LEVELS.map((level) => level.label) }),
                                built
                            ),
                            div(
                                { hidden: () => !counts[w].kills.val },
                                ValueTableHead({ name: "Still to clear", columns: ["Kills"] }),
                                kills
                            ),
                        ],
                    })
                )
            )
        ),
        busy: () => unitsBulk.status.val === "loading",
        load: async () => {
            const next = await readOutposts();
            worldNodes.forEach((_, w) => {
                for (const kind of ["built", "kills"]) {
                    const own = next.outposts.filter((outpost) => outpost.world === w + 1 && outpost.kind === kind);
                    // A row is kept across reloads while its map stays the same kind of row.
                    for (const outpost of own)
                        if (rows.get(outpost.mapId)?.kind !== kind)
                            rows.set(outpost.mapId, {
                                kind,
                                ...(kind === "built" ? BuiltRow(outpost) : KillsRow(outpost)),
                            });
                    reconcilers[w][kind](own.map((outpost) => `${outpost.mapId}:${kind}`).join("|"), () =>
                        own.map((outpost) => rows.get(outpost.mapId).node)
                    );
                    counts[w][kind].val = own.length;
                    own.forEach((outpost) => rows.get(outpost.mapId).update(outpost));
                }
            });
            read.val = next;
        },
        toolsLabel: () => "Units on each outpost of World 1 to 4",
        tools: (ask) => {
            const reset = ActionButton({
                label: "Reset to the game's",
                status: unitsBulk.status,
                variant: "danger",
                disabled: pending,
                onClick: (e) => {
                    e.preventDefault();
                    ask({
                        question: "Put every map unit back where the game puts it?",
                        confirmLabel: "Reset them",
                        from: reset,
                        onConfirm: resetUnits,
                    });
                },
            });
            const populateButton = ActionButton({
                label: "Populate",
                status: unitsBulk.status,
                disabled: pending,
                onClick: (e) => {
                    e.preventDefault();
                    const removed = unitsRemoved(read.val.royalG, read.val.builtByWorld);
                    // Adding runs on one press; taking units away asks first.
                    if (!removed) return populate(0);
                    ask({
                        question: `Populate removes ${plural(removed, ["map unit", "map units"])}. Go on?`,
                        confirmLabel: "Populate",
                        from: populateButton,
                        onConfirm: () => populate(removed),
                    });
                    return undefined;
                },
            });
            // How many of each kind, a field each, then Populate | Reset: the tray wraps them on a narrow screen.
            const kindField = (type) => {
                const value = countOf.get(type);
                const step = (delta) => (value.val = String(Math.max(0, toInt(value.val, { min: 0 }) + delta)));
                return div(
                    { class: "account-setall-row outpost-kind" },
                    span({ class: "account-setall-row__label" }, unitLabel(type)),
                    div(
                        { class: "account-setall-row__input" },
                        NumberInput({
                            value,
                            mode: "int",
                            "aria-label": `${unitLabel(type)} per outpost`,
                            oninput: (e) => (value.val = e.target.value),
                            onDecrement: () => step(-1),
                            onIncrement: () => step(1),
                        })
                    )
                );
            };
            return [...MAP_UNIT_ORDER.map(kindField), div({ class: "tabbed-list__tool-group" }, populateButton, reset)];
        },
    };
};

// ---- Lil' Orblet Shop --------------------------------------------------------------------------------------------

const OrbletTab = ({ pending, reload, bulk }) =>
    UpgradesPart({
        levelsPath: "RoyalG[23]",
        definitions: "OrbletMarket",
        maxAt: 3,
        words: ["upgrade", "upgrades"],
        pending,
        reload,
        bulk,
    });

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "upgrades", label: "Upgrades", part: UpgradesTab, keywords: ["Armory", "Kingdom Expansion", "Shelves"] },
    { id: "resources", label: "Resources", part: ResourcesTab, keywords: ["Royal resources", "RGres"] },
    { id: "nodes", label: "Nodes", part: NodesTab, keywords: ["Resource nodes", "Grade", "Deplete", "Empty"] },
    { id: "statues", label: "Royal Statues", part: StatuesTab, keywords: ["Statues"] },
    {
        id: "outposts",
        label: "Outposts",
        part: OutpostsTab,
        keywords: ["Units", "Kingdom", "Barracks", "Slots", "Glorified", "Militia", "Populate"],
    },
    {
        id: "orblets",
        label: "Lil' Orblet Shop",
        part: OrbletTab,
        keywords: ["Orblet Market", "Lil Orblet Shop", "Orblets"],
    },
];

export default definePage({
    id: "classes.royalarmory",
    world: "classes",
    system: "Royal Armory",
    description: "The Royal Guardian's armory, resources, statues and outposts.",
    keywords: ["Royal Guardian", "Royal Guard", "Masterclass"],
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: () =>
        MasterclassPage({
            name: "Royal Armory",
            page: "classes.royalarmory",
            description: "The Royal Guardian's armory, resources, statues and outposts.",
            tabs: TABS,
            wrap: true,
        }),
});
