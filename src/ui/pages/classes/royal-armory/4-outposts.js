import {
    BUILT_OUTPOST_LENGTH,
    MAP_UNIT_ORDER,
    MAP_UNIT_ARRAYS,
    VANILLA_UNIT_HOME_MAPS,
    decodeSlots,
    encodeSlots,
    unlockedSlotCount,
    normalizeSlotsForCapacity,
    buildDistributedUnitArrays,
    refreshRoyalGuardUnitCaches,
    resetRoyalGuardUnitsToVanilla,
} from "../../../components/views/account/royalGuardDomain.js";
import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { gga, readCList } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { toIndexedArray } from "../../../utils/index.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { InlineEditableNumberField } from "../../../components/views/account/components/InlineEditableNumberField.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    adjustFormattedIntInput,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    largeParser,
    oneAtATime,
    resolveFormattedIntInput,
    resolveNumberInput,
    toInt,
    toNum,
    unwrapH,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { button, div, input, option, select, span } = van.tags;

const WORLD_COUNT = 7;
const DEFAULT_OUTPOST_ROW = [0, 0, 0, 0, 0, 0, 0, 0, -1, -1, 0, 211111111, 0];

const OUTPOST_FIELDS = [
    { index: 0, key: "barracks", label: "Barracks", inputMode: "int", min: 0 },
    { index: 1, key: "logistics", label: "Logistics", inputMode: "int", min: 0 },
    { index: 2, key: "education", label: "Education", inputMode: "int", min: 0 },
    { index: 3, key: "tradingXp", label: "Trading XP", inputMode: "float", min: 0 },
    { index: 4, key: "intelXp", label: "Intel XP", inputMode: "float", min: 0 },
    { index: 5, key: "commandXp", label: "Command XP", inputMode: "float", min: 0 },
    { index: 6, key: "militaryXp", label: "Military XP", inputMode: "float", min: 0 },
    { index: 7, key: "purityXp", label: "Purity XP", inputMode: "float", min: 0 },
];

const OUTPOST_TYPES = [
    { value: 0, label: "Resource Depot" },
    { value: 1, label: "Support Camp" },
    { value: 2, label: "Savage" },
];

const SLOT_TYPES = [
    { value: "1", label: "Locked" },
    { value: "2", label: "Worker" },
    { value: "3", label: "Trader" },
    { value: "4", label: "Guard" },
    { value: "5", label: "Surveyor" },
];

const MAP_UNIT_TYPES = [
    { value: 4, label: "Militia" },
    { value: 5, label: "Commander" },
    { value: 6, label: "Knight" },
    { value: 7, label: "Priest" },
];

const worldFromMapId = (mapId) => Math.floor(mapId / 50) + 1;

const buildOutpostsByWorld = (royalMaps) => {
    const result = {};
    toIndexedArray(royalMaps ?? []).forEach((row, mapId) => {
        if (!Array.isArray(row) || row.length < 10) return;
        const world = worldFromMapId(mapId);
        if (world < 1 || world > WORLD_COUNT) return;
        if (!result[world]) result[world] = [];
        result[world].push(mapId);
    });
    return result;
};

const DEFAULT_UNIT_COUNTS = {
    5: 1,
    6: 4,
    4: 5,
    7: 1,
};

const formatAmount = (value) => formatNumber(Math.max(0, Math.floor(toNum(value, 0))));
const rankFieldIndex = (field) => field.index - 3;

const outpostRankRequirement = (rank, rankType) => {
    if (rankType === 4) return 100000 * Math.pow(10, rank);
    if (rankType === 2) return (50 + 50 * rank) * Math.pow(1.6, rank);
    return (10 + 5 * rank) * Math.pow(1.3, rank);
};

const getOutpostRankInfo = (xp, rankType) => {
    let rank = 0;
    const safeXp = Math.max(0, toNum(xp, 0));

    while (safeXp >= outpostRankRequirement(rank, rankType)) rank++;

    return {
        rank,
        next: outpostRankRequirement(rank, rankType),
    };
};

const selectOption = ({ value, label }, current) =>
    option({ value: String(value), selected: String(value) === String(current) }, label);

const outpostTypeLabel = (type) =>
    OUTPOST_TYPES.find((entry) => entry.value === Number(type))?.label ?? `Outpost Type ${type}`;

const syncSlotsToCapacity = async ({ mapId, slotState, barracksLevel }) => {
    const nextValue = normalizeSlotsForCapacity(slotState.val, barracksLevel);
    if (nextValue === slotState.val) return;

    await writeVerified(`RoyalMaps[${mapId}][11]`, nextValue);
    slotState.val = nextValue;
    await refreshRoyalGuardUnitCaches();
};

const readUnitPair = async (typeArray, mapArray) => {
    const [rawTypes, rawMaps] = await Promise.all([gga(`RoyalG[${typeArray}]`), gga(`RoyalG[${mapArray}]`)]);
    return {
        types: toIndexedArray(rawTypes ?? []).slice(),
        maps: toIndexedArray(rawMaps ?? []).slice(),
    };
};

const getMapName = (mapId, mapDispNames, mapDetails) => {
    const dispName = mapDispNames?.[mapId];
    if (dispName && typeof dispName === "string" && dispName.trim()) return cleanName(dispName, `Map ${mapId}`);

    const row = toIndexedArray(mapDetails?.[mapId] ?? []);
    const candidates = row.flatMap((entry) => toIndexedArray(entry ?? []));
    const text = candidates.find((entry) => typeof entry === "string" && entry.trim());
    return cleanName(text, `Map ${mapId}`) || `Map ${mapId}`;
};

const getKillReq = (mapId, mapDetails, killReqOverrides) => {
    const overrides = unwrapH(killReqOverrides) ?? {};
    if (Object.prototype.hasOwnProperty.call(overrides, String(mapId))) return toNum(overrides[String(mapId)], 0);

    const mapDetail = toIndexedArray(unwrapH(mapDetails?.[mapId]) ?? []);
    const detail = toIndexedArray(unwrapH(mapDetail[0]) ?? []);
    return (
        3 *
        (25 +
            5 * mapId +
            toNum(detail[0], 0) *
                Math.pow(1.3 - 0.01 * Math.floor(mapId / 50), 0.2 * (mapId - 50 * Math.floor(mapId / 50))) *
                Math.pow(4, Math.floor(mapId / 50)) *
                (1 + 29 * Math.min(1, Math.floor(mapId / 50))))
    );
};

const rowKind = (row) => {
    if (!Array.isArray(row)) return "hidden";
    if (row.length >= BUILT_OUTPOST_LENGTH) return "built";
    if (row.length === 1 && Number.isFinite(Number(row[0]))) return "kills";
    return "hidden";
};

const getUnitTypeLabel = (type) =>
    MAP_UNIT_TYPES.find((entry) => entry.value === Number(type))?.label ?? `Unit ${type}`;

// A map unit in the arrays the game holds now: where the page read it, or, when another unit change moved it, the
// same kind of unit on the same map (units of one kind on one map are alike). -1 when there is none.
const findUnit = (types, maps, unit) =>
    Number(types[unit.unitIndex]) === unit.type && Number(maps[unit.unitIndex]) === unit.mapId
        ? unit.unitIndex
        : types.findIndex((type, index) => Number(type) === unit.type && Number(maps[index]) === unit.mapId);

// Picks save one at a time, in the order made. A refused pick goes back to what the game holds and says why on the card.
const SelectWriter = ({ label, name = label, said, valueState, options, write, onApplied = null, onFailed = null }) => {
    const { status, run } = useWriteStatus();
    const queue = oneAtATime();
    return div(
        { class: "outpost-select-field" },
        span({ class: "outpost-select-field__label" }, label),
        select(
            {
                class: () =>
                    `outpost-select-field__select${status.val === "success" ? " is-success" : ""}${
                        status.val === "error" ? " is-error" : ""
                    }`,
                value: () => String(valueState.val),
                onchange: async (e) => {
                    const field = e.target;
                    const rawValue = field.value;
                    const value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : rawValue;
                    said.clear();
                    const result = await run(() =>
                        queue(async () => {
                            await write(value);
                            valueState.val = value;
                            if (typeof onApplied === "function") await onApplied(value);
                        })
                    );
                    if (result.ok) return;
                    said.say("failed", `${name} not saved: ${saveFailureReason(result.error)}`);
                    field.value = String(valueState.val);
                    if (typeof onFailed === "function") await onFailed();
                },
            },
            ...options.map((entry) => selectOption(entry, valueState.val))
        )
    );
};

const OutpostSlots = ({ mapId, slotState, barracksState, slotWrites, said }) => {
    const { status, run } = useWriteStatus();
    const path = `RoyalMaps[${mapId}][11]`;
    const slots = () => decodeSlots(slotState.val);
    const unlockedSlots = () => unlockedSlotCount(barracksState.val);

    return div(
        { class: "outpost-slots" },
        span({ class: "outpost-slots__label" }, "Outpost slots"),
        ...Array.from({ length: 9 }, (_, slot) =>
            select(
                {
                    class: () =>
                        `outpost-slot-select${status.val === "success" ? " is-success" : ""}${
                            status.val === "error" ? " is-error" : ""
                        }`,
                    value: () => slots()[slot],
                    title: `Slot ${slot + 1}`,
                    disabled: () => slot >= unlockedSlots(),
                    onchange: async (e) => {
                        const field = e.target;
                        const picked = field.value;
                        said.clear();
                        // One at a time, each from what the game holds then, so a pick made while another saves keeps both.
                        const result = await run(() =>
                            slotWrites(async () => {
                                const nextSlots = decodeSlots(await gga(path));
                                nextSlots[slot] = picked;
                                const nextValue = encodeSlots(nextSlots);
                                await writeVerified(path, nextValue);
                                slotState.val = nextValue;
                                await refreshRoyalGuardUnitCaches();
                            })
                        );
                        if (result.ok) return;
                        said.say("failed", `Slot ${slot + 1} not saved: ${saveFailureReason(result.error)}`);
                        field.value = slots()[slot];
                    },
                },
                ...SLOT_TYPES.map((entry) => selectOption(entry, slots()[slot]))
            )
        )
    );
};

const MapUnitAddControl = ({ outpost, changeUnits }) => {
    const arrays = MAP_UNIT_ARRAYS[outpost.world];
    const typeState = van.state(MAP_UNIT_TYPES[0].value);
    const { status, run } = useWriteStatus();

    if (!arrays)
        return span({ class: "outpost-map-units__empty" }, "Map unit arrays are not mapped for this world yet.");

    return div(
        { class: "outpost-map-unit-add" },
        div(
            { class: "outpost-select-field outpost-map-unit-add__field" },
            span({ class: "outpost-select-field__label" }, "New unit"),
            select(
                {
                    class: "outpost-select-field__select",
                    value: () => String(typeState.val),
                    onchange: (e) => {
                        typeState.val = Number(e.target.value);
                    },
                },
                ...MAP_UNIT_TYPES.map((entry) => selectOption(entry, typeState.val))
            )
        ),
        ActionButton({
            label: "Add unit",
            status,
            tooltip: `Add the selected map unit to ${outpost.name}.`,
            onClick: (e) => {
                e.preventDefault();
                return changeUnits("Unit not added", run, async () => {
                    const { types, maps } = await readUnitPair(arrays.typeArray, arrays.mapArray);
                    types.push(Number(typeState.val));
                    maps.push(outpost.mapId);
                    await writeManyVerified([
                        { path: `RoyalG[${arrays.typeArray}]`, value: types },
                        { path: `RoyalG[${arrays.mapArray}]`, value: maps },
                    ]);
                });
            },
        })
    );
};

const UNIT_GONE = "that unit is no longer on this map";

const MapUnitRow = ({ unit, changeUnits, unitWrites, said, reload }) => {
    const typeState = van.state(unit.type);
    const { status, run } = useWriteStatus();

    return div(
        { class: "outpost-map-unit", title: `RoyalG[${unit.typeArray}/${unit.mapArray}] index ${unit.unitIndex}` },
        SelectWriter({
            label: "Type",
            name: "Unit type",
            said,
            valueState: typeState,
            options: MAP_UNIT_TYPES,
            write: (value) =>
                unitWrites(async () => {
                    const { types, maps } = await readUnitPair(unit.typeArray, unit.mapArray);
                    const index = findUnit(types, maps, unit);
                    if (index < 0) throw new Error(UNIT_GONE);
                    await writeVerified(`RoyalG[${unit.typeArray}][${index}]`, value);
                    Object.assign(unit, { unitIndex: index, type: value });
                }),
            // Populate's question and preview count units from the last read.
            onApplied: reload,
            onFailed: reload,
        }),
        ActionButton({
            label: "Remove",
            status,
            variant: "danger",
            tooltip: "Remove this map unit and close the matching type/map array indexes.",
            onClick: (e) => {
                e.preventDefault();
                return changeUnits("Unit not removed", run, async () => {
                    const { types, maps } = await readUnitPair(unit.typeArray, unit.mapArray);
                    // Found again in what the game holds now: another Remove may have moved it since the page read it.
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
        })
    );
};

const UnitCountField = ({ unitType, valueState }) =>
    div(
        { class: "outpost-unit-config__field" },
        span({ class: "outpost-unit-config__label" }, getUnitTypeLabel(unitType)),
        input({
            class: "outpost-unit-config__input",
            type: "number",
            min: "0",
            step: "1",
            value: () => String(valueState.val),
            oninput: (e) => {
                valueState.val = Math.max(0, toInt(e.target.value, { min: 0, mode: "floor" }));
            },
        })
    );

const UnitSummaryRows = ({ summaries, mapDispNames, mapDetails }) =>
    summaries.map((summary) => {
        const homeMapId = VANILLA_UNIT_HOME_MAPS[summary.world];
        const homeMapName = homeMapId ? getMapName(homeMapId, mapDispNames, mapDetails) : `W${summary.world}`;
        return div(
            { class: "outpost-vanilla-units__row" },
            span({ class: "account-row__index" }, `W${summary.world}`),
            span({ class: "outpost-vanilla-units__count" }, `${summary.total} Units`),
            span(
                { class: "outpost-vanilla-units__breakdown" },
                MAP_UNIT_ORDER.map((unitType) => `${getUnitTypeLabel(unitType)} ${summary.counts[unitType] ?? 0}`).join(
                    " | "
                )
            ),
            span(
                { class: "outpost-vanilla-units__meta" },
                summary.addedNew || summary.movedExisting
                    ? `${summary.movedExisting} moved, ${summary.addedNew} added`
                    : `Home ${homeMapName}`
            )
        );
    });

const UnitBulkPanel = ({
    royalGState,
    onChanged,
    outpostsByWorldState,
    mapDispNamesState,
    mapDetailsState,
    unitWrites,
}) => {
    const vanillaStatus = useWriteStatus();
    const customStatus = useWriteStatus();
    const countStates = new Map();
    const previewState = van.state({ mode: "custom", summaries: [] });
    const summaryList = div({ class: "outpost-vanilla-units__summary" });
    const worlds = Object.keys(outpostsByWorldState.val).map(Number);

    worlds.forEach((world) => {
        MAP_UNIT_ORDER.forEach((unitType) => {
            countStates.set(`${world}:${unitType}`, van.state(DEFAULT_UNIT_COUNTS[unitType] ?? 0));
        });
    });

    const getWantedCounts = () =>
        Object.fromEntries(
            worlds.map((world) => [
                world,
                Object.fromEntries(
                    MAP_UNIT_ORDER.map((unitType) => [unitType, countStates.get(`${world}:${unitType}`).val])
                ),
            ])
        );

    const refreshPreview = () => {
        previewState.val = {
            mode: "custom",
            summaries: buildDistributedUnitArrays(royalGState.val ?? [], getWantedCounts(), outpostsByWorldState.val)
                .summaries,
        };
        summaryList.replaceChildren(
            ...UnitSummaryRows({
                summaries: previewState.val.summaries,
                mapDispNames: mapDispNamesState.val,
                mapDetails: mapDetailsState.val,
            })
        );
    };

    worlds.forEach((world) => {
        MAP_UNIT_ORDER.forEach((unitType) => {
            van.derive(() => {
                countStates.get(`${world}:${unitType}`).val;
                refreshPreview();
            });
        });
    });

    van.derive(() => {
        royalGState.val;
        refreshPreview();
    });

    // What Populate would take away from `royalG`: units over the counts, and unit kinds it doesn't place.
    const unitsRemoved = (royalG, counts = getWantedCounts()) =>
        buildDistributedUnitArrays(royalG, counts, outpostsByWorldState.val).summaries.reduce(
            (sum, summary) =>
                sum +
                toIndexedArray(royalG[MAP_UNIT_ARRAYS[summary.world].typeArray] ?? []).length -
                summary.movedExisting,
            0
        );
    // How many the press was asked about (none when it didn't ask); the save takes away no more than that.
    let confirmedRemoval = 0;

    return div(
        { class: "outpost-vanilla-units" },
        div(
            { class: "outpost-card__header" },
            div(
                { class: "outpost-row__text" },
                span({ class: "account-row__name" }, "Bulk Map Units"),
                span(
                    { class: "outpost-row__meta" },
                    "Reset to vanilla, or populate every mapped outpost using the counts below."
                )
            ),
            div(
                { class: "outpost-unit-config__actions" },
                ActionButton({
                    label: "Reset to vanilla",
                    status: vanillaStatus.status,
                    variant: "danger",
                    tooltip:
                        "Rebuild RoyalG map-unit arrays from current militia and Kingdom Sovereignty upgrade levels.",
                    confirm: "rebuild every world's map units from your militia and Kingdom Sovereignty levels.",
                    onClick: (e) => {
                        e.preventDefault();
                        return vanillaStatus.run(async () => {
                            try {
                                await unitWrites(resetRoyalGuardUnitsToVanilla);
                            } finally {
                                await onChanged();
                            }
                        });
                    },
                }),
                ActionButton({
                    label: "Populate outposts",
                    status: customStatus.status,
                    tooltip: "Move existing map units first, then add any missing units to match the selected counts.",
                    // Adding runs on one press; taking units away asks first.
                    confirm: () => {
                        const removed = unitsRemoved(royalGState.val ?? []);
                        confirmedRemoval = removed;
                        return removed > 0
                            ? `remove ${removed} map unit${removed === 1 ? "" : "s"} from your outposts.`
                            : null;
                    },
                    onClick: (e) => {
                        e.preventDefault();
                        // The counts and the removal as pressed, while the save waits its turn.
                        const [confirmed, counts] = [confirmedRemoval, getWantedCounts()];
                        return customStatus.run(async () => {
                            try {
                                await unitWrites(async () => {
                                    const rawRoyalG = await gga("RoyalG");
                                    const royalG = toIndexedArray(rawRoyalG ?? []);
                                    // Units the game added since the page read them would go without being asked.
                                    if (unitsRemoved(royalG, counts) > confirmed)
                                        throw new Error("Map units changed in game. Press Populate again.");
                                    const { rebuilt } = buildDistributedUnitArrays(
                                        royalG,
                                        counts,
                                        outpostsByWorldState.val
                                    );
                                    const writes = [];

                                    Object.values(rebuilt).forEach((entry) => {
                                        writes.push({ path: `RoyalG[${entry.typeArray}]`, value: entry.types });
                                        writes.push({ path: `RoyalG[${entry.mapArray}]`, value: entry.maps });
                                    });

                                    await writeManyVerified(writes);
                                });
                            } finally {
                                await onChanged();
                            }
                        });
                    },
                })
            )
        ),
        div(
            { class: "outpost-unit-config" },
            ...worlds.map((world) =>
                div(
                    { class: "outpost-unit-config__world" },
                    span({ class: "account-row__index" }, `W${world}`),
                    ...MAP_UNIT_ORDER.map((unitType) =>
                        UnitCountField({ unitType, valueState: countStates.get(`${world}:${unitType}`) })
                    )
                )
            )
        ),
        summaryList
    );
};

const BuiltOutpostRow = ({ outpost, fieldStates, slotState, outpostTypeState, glorifiedState, unitWrites, reload }) => {
    // The card's failures, said on the card until its next save.
    const said = useSaid();
    const glorified = useWriteStatus();
    // The slot value is one number: the slot picks and the barracks' slot fix save it one at a time.
    const slotWrites = oneAtATime();
    const syncCapacity = (nextBarracks = fieldStates.get("barracks").val) =>
        slotWrites(() =>
            syncSlotsToCapacity({
                mapId: outpost.mapId,
                slotState,
                barracksLevel: nextBarracks,
            })
        );

    // A unit change runs after any other on the page, then the page reads the game again, whatever happened.
    const changeUnits = (failed, run, task) => {
        said.clear();
        return run(
            async () => {
                try {
                    await unitWrites(task);
                } finally {
                    await reload();
                }
            },
            { onError: (error) => said.say("failed", `${failed}: ${saveFailureReason(error)}`) }
        );
    };

    // Only the unit list is rebuilt on a reload, and only when the game's units differ from what the rows show now
    // (a TYPE pick changes its row's unit in place): the rest of the card stays.
    const unitList = div({ class: "outpost-map-units__list" });
    const unitKey = (units) => units.map((unit) => `${unit.unitIndex}:${unit.type}`).join("|");
    let shownUnits = null;
    const setUnits = (units) => {
        if (shownUnits && unitKey(shownUnits) === unitKey(units)) return;
        shownUnits = units;
        unitList.replaceChildren(
            ...(units.length
                ? units.map((unit) => MapUnitRow({ unit, changeUnits, unitWrites, said, reload }))
                : [span({ class: "outpost-map-units__empty" }, "None stationed")])
        );
    };

    const fieldLabel = (field) => {
        if (field.index < 3) return field.label;

        const rankInfo = getOutpostRankInfo(fieldStates.get(field.key).val, rankFieldIndex(field));
        return [
            span({ class: "outpost-field__label-main" }, field.label),
            span({ class: "outpost-field__rank" }, `Rank ${rankInfo.rank}`),
            span({ class: "outpost-field__next" }, `Next ${formatAmount(rankInfo.next)}`),
        ];
    };

    const fieldControl = (field) =>
        InlineEditableNumberField({
            label: () => fieldLabel(field),
            valueState: fieldStates.get(field.key),
            path: `RoyalMaps[${outpost.mapId}][${field.index}]`,
            onApplied:
                field.key === "barracks"
                    ? (value) => syncCapacity(value)
                    : field.index === 5
                      ? () => refreshRoyalGuardUnitCaches()
                      : null,
            inputMode: field.inputMode,
            normalize: (raw) =>
                resolveNumberInput(raw, {
                    formatted: true,
                    float: field.inputMode === "float",
                    min: field.min ?? 0,
                    fallback: null,
                }),
            rootClass: "outpost-field",
            labelClass: "outpost-field__label",
        });

    setUnits(outpost.mapUnits);

    const node = div(
        { class: "outpost-card outpost-card--built" },
        div(
            { class: "outpost-card__header" },
            div(
                { class: "outpost-card__title" },
                span({ class: "account-row__index" }, `M${outpost.mapId}`),
                div(
                    { class: "outpost-row__text" },
                    span({ class: "account-row__name" }, outpost.name),
                    span({ class: "outpost-row__meta" }, () => outpostTypeLabel(outpostTypeState.val))
                )
            ),
            div(
                { class: "outpost-card__status" },
                span({ class: "outpost-row__badge" }, () => (toInt(glorifiedState.val) === 1 ? "Glorified" : "Outpost"))
            )
        ),
        Said({ said: said.said, className: "said--line outpost-card__said" }),
        div(
            { class: "outpost-card__body" },
            div(
                { class: "outpost-card__group outpost-card__group--levels" },
                span({ class: "outpost-card__group-title" }, "Upgrades"),
                ...OUTPOST_FIELDS.slice(0, 3).map(fieldControl)
            ),
            div(
                { class: "outpost-card__group outpost-card__group--settings" },
                span({ class: "outpost-card__group-title" }, "State"),
                SelectWriter({
                    label: "Type",
                    said,
                    valueState: outpostTypeState,
                    options: OUTPOST_TYPES,
                    write: (value) => writeVerified(`RoyalMaps[${outpost.mapId}][10]`, value),
                    onApplied: (value) => {
                        outpost.type = value;
                    },
                    onFailed: reload,
                }),
                div(
                    { class: "outpost-select-field" },
                    span({ class: "outpost-select-field__label" }, "Glorified"),
                    ActionButton({
                        label: () => (toInt(glorifiedState.val) === 1 ? "Glorified" : "Standard"),
                        status: glorified.status,
                        tooltip: "Toggle glorified outpost status.",
                        variant: "switch-filled",
                        className: "outpost-glorified-button",
                        onClick: async (e) => {
                            e.preventDefault();
                            said.clear();
                            const result = await glorified.run(
                                async () => {
                                    const nextValue = toInt(glorifiedState.val) === 1 ? 0 : 1;
                                    await writeVerified(`RoyalMaps[${outpost.mapId}][12]`, nextValue);
                                    glorifiedState.val = nextValue;
                                    outpost.glorified = nextValue;
                                    await refreshRoyalGuardUnitCaches();
                                },
                                {
                                    onError: (error) =>
                                        said.say("failed", `Glorified not saved: ${saveFailureReason(error)}`),
                                }
                            );
                            if (!result.ok) await reload();
                        },
                    })
                )
            ),
            div(
                { class: "outpost-card__group outpost-card__group--rank-a" },
                span({ class: "outpost-card__group-title" }, "Rank XP"),
                ...OUTPOST_FIELDS.slice(3, 6).map(fieldControl)
            ),
            div(
                { class: "outpost-card__group outpost-card__group--rank-b" },
                span({ class: "outpost-card__group-title" }, "Rank XP"),
                ...OUTPOST_FIELDS.slice(6).map(fieldControl)
            ),
            OutpostSlots({
                mapId: outpost.mapId,
                slotState,
                barracksState: fieldStates.get("barracks"),
                slotWrites,
                said,
            }),
            div(
                { class: "outpost-map-units" },
                span({ class: "outpost-map-units__label" }, "Map units"),
                MapUnitAddControl({ outpost, changeUnits }),
                unitList
            )
        )
    );
    return { node, setUnits };
};

const KillOutpostRow = ({ outpost, remainingState, killsState, onConverted }) =>
    EditableNumberRow({
        valueState: remainingState,
        normalize: (raw) => resolveFormattedIntInput(raw, null, { min: 0, max: Math.ceil(outpost.killReq) }),
        write: async (nextRemaining) => {
            const nextKills = Math.max(0, outpost.killReq - nextRemaining);
            await writeVerified(`RoyalMaps[${outpost.mapId}][0]`, nextKills);
            killsState.val = nextKills;
            return nextRemaining;
        },
        renderInfo: () => [
            span({ class: "account-row__index" }, `M${outpost.mapId}`),
            div(
                { class: "outpost-row__text" },
                span({ class: "account-row__name" }, outpost.name),
                span(
                    { class: "outpost-row__meta" },
                    () => `Kills done ${formatAmount(killsState.val)} / ${formatAmount(outpost.killReq)}`
                )
            ),
        ],
        adjustInput: (rawValue, delta, currentValue) =>
            adjustFormattedIntInput(rawValue, delta, currentValue ?? 0, { min: 0, max: Math.ceil(outpost.killReq) }),
        rowClass: "outpost-row outpost-row--kills",
        badgeClass: "outpost-row__badge",
        controlsClass: "outpost-kill-row__controls",
        inputProps: {
            formatter: largeFormatter,
            parser: largeParser,
        },
        // Make outpost saves with the row's own save state (saving…, or the reason), then the page reads the game again:
        // the row turns into the outpost, or stays with the reason.
        renderExtraActions: ({ run }) =>
            ActionButton({
                label: "Make outpost",
                tooltip: "Replace this kill-counter row with a default built outpost row.",
                onClick: async (e) => {
                    e.preventDefault();
                    await run(() => writeVerified(`RoyalMaps[${outpost.mapId}]`, [...DEFAULT_OUTPOST_ROW]));
                    await onConverted();
                },
            }),
    });

const readOutposts = async () => {
    const [rawRoyalMaps, rawMapDetails, rawKillReqOverrides, rawRoyalG, rawMapDispNames] = await Promise.all([
        gga("RoyalMaps"),
        gga("CustomLists.h.MapDetails"),
        gga("CustomMaps.h.RG_KillReq.h"),
        gga("RoyalG"),
        readCList("MapDispName"),
    ]);

    const royalMaps = toIndexedArray(rawRoyalMaps ?? []);
    const mapDetails = toIndexedArray(rawMapDetails ?? []);
    const royalG = toIndexedArray(rawRoyalG ?? []);
    const mapDispNames = toIndexedArray(rawMapDispNames ?? []);

    const mapUnitsByMapId = new Map();
    Object.entries(MAP_UNIT_ARRAYS).forEach(([world, arrays]) => {
        const types = toIndexedArray(royalG[arrays.typeArray] ?? []);
        const maps = toIndexedArray(royalG[arrays.mapArray] ?? []);
        const count = Math.max(types.length, maps.length);

        for (let unitIndex = 0; unitIndex < count; unitIndex++) {
            const mapId = toInt(maps[unitIndex], { min: 0, fallback: -1 });
            if (mapId < 0) continue;

            const unit = {
                world: Number(world),
                unitIndex,
                type: toInt(types[unitIndex], { min: 0 }),
                mapId,
                typeArray: arrays.typeArray,
                mapArray: arrays.mapArray,
            };
            if (!mapUnitsByMapId.has(mapId)) mapUnitsByMapId.set(mapId, []);
            mapUnitsByMapId.get(mapId).push(unit);
        }
    });

    const outposts = royalMaps
        .map((row, mapId) => {
            const kind = rowKind(row);
            if (kind === "hidden") return null;

            const killReq = getKillReq(mapId, mapDetails, rawKillReqOverrides);
            const world = worldFromMapId(mapId);
            const name = getMapName(mapId, mapDispNames, mapDetails);
            if (world < 1 || world > WORLD_COUNT) return null;

            if (kind === "kills") {
                const kills = toNum(row[0], 0);
                return {
                    kind,
                    mapId,
                    world,
                    name,
                    kills,
                    killReq,
                    remaining: Math.max(0, killReq - kills),
                    mapUnits: mapUnitsByMapId.get(mapId) ?? [],
                };
            }

            return {
                kind,
                mapId,
                world,
                name,
                row,
                type: toInt(row[10], { min: 0 }),
                glorified: toInt(row[12], { min: 0 }),
                mapUnits: mapUnitsByMapId.get(mapId) ?? [],
            };
        })
        .filter(Boolean);

    return { outposts, mapDispNames, mapDetails };
};

const OutpostsTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Outposts" });
    const activeWorld = van.state(1);
    const outposts = van.state([]);
    const royalGState = van.state([]);
    const outpostsByWorldState = van.state({});
    const mapDispNamesState = van.state([]);
    const mapDetailsState = van.state([]);
    const fieldStateGroups = new Map();
    const slotStates = new Map();
    const outpostTypeStates = new Map();
    const glorifiedStates = new Map();
    const remainingStates = new Map();
    const killsStates = new Map();
    // mapId -> { kind, outpost, node, setUnits }: a reload keeps each row (and what is typed or said in it).
    const rows = new Map();
    // Map unit arrays are shared by every outpost of a world: each change to them runs after the last one ended.
    const unitWrites = oneAtATime();
    const rowList = div({ class: "account-item-stack account-item-stack--dense outpost-list" });
    const reconcileRows = createStaticRowReconciler(rowList);
    const bodyContent = div();
    let unitPanel = null;
    let unitPanelWorlds = null;
    const noOutposts = EmptyState({
        title: "No outpost rows",
        subtitle: "No RoyalMaps outpost or kill-counter rows were returned for this world.",
    });

    const renderRows = () => {
        if (activeWorld.val === "units") {
            // Kept while the worlds stay the same, so the counts typed in it outlast a reload.
            const worlds = Object.keys(outpostsByWorldState.val).join(",");
            if (worlds !== unitPanelWorlds) {
                unitPanelWorlds = worlds;
                unitPanel = UnitBulkPanel({
                    royalGState,
                    onChanged: load,
                    outpostsByWorldState,
                    mapDispNamesState,
                    mapDetailsState,
                    unitWrites,
                });
            }
            return unitPanel;
        }

        const visible = outposts.val.filter((outpost) => outpost.world === activeWorld.val);
        reconcileRows(
            visible.map((outpost) => `${outpost.mapId}:${outpost.kind}`).join("|"),
            visible.map((outpost) => rows.get(outpost.mapId).node)
        );
        return visible.length ? rowList : noOutposts;
    };

    van.derive(() => {
        activeWorld.val;
        outposts.val;
        const next = renderRows();
        if (bodyContent.firstChild !== next) bodyContent.replaceChildren(next);
    });

    // A row is kept across reloads while its map stays the same kind of row; it takes the new read in place.
    const keepRow = (outpost) => {
        const kept = rows.get(outpost.mapId);
        if (kept?.kind !== outpost.kind) return false;
        Object.assign(kept.outpost, outpost);
        kept.setUnits?.(outpost.mapUnits);
        return true;
    };

    let loads = 0;
    const load = () => {
        const thisLoad = ++loads;
        return runLoad(async () => {
            const [{ outposts: nextOutposts, mapDispNames, mapDetails }, rawRoyalG, rawRoyalMaps] = await Promise.all([
                readOutposts(),
                gga("RoyalG"),
                gga("RoyalMaps"),
            ]);
            // A newer read was asked for meanwhile (two unit changes back to back): only the newest is shown.
            if (thisLoad !== loads) return;
            royalGState.val = toIndexedArray(rawRoyalG ?? []);
            // Only W1-W4 have map unit arrays the page knows, so only they can be populated.
            outpostsByWorldState.val = Object.fromEntries(
                Object.entries(buildOutpostsByWorld(rawRoyalMaps)).filter(([world]) => MAP_UNIT_ARRAYS[world])
            );
            mapDispNamesState.val = mapDispNames;
            mapDetailsState.val = mapDetails;

            nextOutposts.forEach((outpost) => {
                if (outpost.kind === "kills") {
                    const remainingState = getOrCreateState(remainingStates, outpost.mapId);
                    const killsState = getOrCreateState(killsStates, outpost.mapId);
                    remainingState.val = outpost.remaining;
                    killsState.val = outpost.kills;
                    if (keepRow(outpost)) return;
                    rows.set(outpost.mapId, {
                        kind: outpost.kind,
                        outpost,
                        node: KillOutpostRow({ outpost, remainingState, killsState, onConverted: load }),
                    });
                    return;
                }

                const fieldStates = new Map();
                OUTPOST_FIELDS.forEach((field) => {
                    const state = getOrCreateState(fieldStateGroups, `${outpost.mapId}:${field.key}`);
                    state.val = toNum(outpost.row[field.index], 0);
                    fieldStates.set(field.key, state);
                });

                const slotState = getOrCreateState(slotStates, outpost.mapId, 111111111);
                const outpostTypeState = getOrCreateState(outpostTypeStates, outpost.mapId);
                const glorifiedState = getOrCreateState(glorifiedStates, outpost.mapId);
                slotState.val = toInt(outpost.row[11], { min: 0, fallback: 111111111 });
                outpostTypeState.val = outpost.type;
                glorifiedState.val = outpost.glorified;
                if (keepRow(outpost)) return;

                rows.set(outpost.mapId, {
                    kind: outpost.kind,
                    outpost,
                    ...BuiltOutpostRow({
                        outpost,
                        fieldStates,
                        slotState,
                        outpostTypeState,
                        glorifiedState,
                        unitWrites,
                        reload: load,
                    }),
                });
            });

            outposts.val = nextOutposts;
        });
    };

    load();

    return PersistentAccountListPage({
        title: "Outposts",
        description: "Manage Royal Guard outposts, kill counters, ranks, slots, and stationed map units.",
        wrapActions: false,
        actions: BulkActionBar({
            refresh: {
                onClick: load,
                tooltip: "Re-read RoyalMaps and RoyalG unit arrays from the running game.",
                disabled: () => loading.val,
            },
        }),
        state: { loading, error },
        loadingText: "Reading outposts",
        errorTitle: "Outposts read failed",
        initialWrapperClass: "masterclass-upgrade-scroll",
        body: div(
            { class: "masterclass-upgrade-scroll scrollable-panel" },
            AccountSection({
                title: "Outpost worlds",
                body: [
                    div(
                        { class: "masterclass-category-tabs" },
                        ...Array.from({ length: WORLD_COUNT }, (_, index) => {
                            const world = index + 1;
                            return button(
                                {
                                    type: "button",
                                    class: () =>
                                        `masterclass-category-tabs__button${
                                            activeWorld.val === world ? " is-active" : ""
                                        }`,
                                    onclick: () => {
                                        activeWorld.val = world;
                                    },
                                },
                                `W${world}`
                            );
                        }),
                        button(
                            {
                                type: "button",
                                class: () =>
                                    `masterclass-category-tabs__button${
                                        activeWorld.val === "units" ? " is-active" : ""
                                    }`,
                                onclick: () => {
                                    activeWorld.val = "units";
                                },
                            },
                            "Units"
                        )
                    ),
                    bodyContent,
                ],
            })
        ),
    });
};

export default definePage({
    id: "classes.royalarmory.outposts",
    world: "classes",
    system: "Royal Armory",
    tab: "Outposts",
    keywords: ["Units"],
    description: "Outposts, kill counters, ranks, slots and stationed map units.",
    component: OutpostsTab,
});
