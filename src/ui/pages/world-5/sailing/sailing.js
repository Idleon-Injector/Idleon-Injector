/**
 * W5 - Sailing
 *
 * One page, the game's sailing screens as its tabs: Boats, Captains, Islands, Artifacts, Loot Pile. One read of the
 * game fills every tab; a tab's tools (Unlock all, Max all, ...) show on that tab only.
 *
 * Data sources:
 *   gga.Boats[b][3], [5]          - boat b's Loot Value and Speed levels
 *   gga.GemItemsPurchased[8]      - Davey Jones Training buys (gem shop, up to 8): each is +50% boat speed, loot value,
 *                                   artifact find chance and captain EXP, and 4 minutes off the shortest trip
 *                                   (_customBlock_Sailing "DaveyJonesBonus" and "Minimumtraveltime")
 *   gga.Captains[c]               - [0] rarity (0 to 6; -1 an empty slot), [1], [2] its two bonus kinds
 *                                   (cList.CaptainBonuses[k][3] in the game's words), [3] level, [4] EXP, [5], [6] the
 *                                   bonus amounts; slots 0-29 are hired, 30 and up the Recruitment pool. The game's
 *                                   discard sets [0] to -1, [3] to 1 and [4] to 0, not for a captain on a boat
 *                                   (gga.Boats[b][0]) or the last one
 *   gga.Sailing[0][i]             - island i's cloud progress; -1 once unlocked (cList.IslandInfo: one per island)
 *   gga.Sailing[3][n]             - artifact n's tier: 0 not found, 1 found, then Ancient up to Verisimilitude (7);
 *                                   cList.ArtifactInfo[n] [0] its name, [4] its bonus
 *   gga.Sailing[1][n]             - how many of treasure n you have: 0 is Gold Bars, then two per island in the map's
 *                                   order (the game's item list has only placeholder names for them)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { TabbedList, toolsPerTab, loadParts } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    oneAtATime,
    runBulkSet,
    toInt,
    toNum,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import {
    SaveState,
    saveFailureReason,
    saveStateClass,
    useAutoSave,
} from "../../../components/views/account/autoSave.js";

const { button, div, span } = van.tags;

const plural = (n, word) => `${word}${n === 1 ? "" : "s"}`;
// Asks in the tray before taking away ("Lock 3 islands?"): `entries` the things it changes.
const askFirst = (ask, from, entries, words, onConfirm) => {
    const n = entries.length;
    ask({ question: words.question(n), confirmLabel: n === 1 ? words.one : words.many, from, onConfirm });
};

// ---- Boats -------------------------------------------------------------------------------------------------------

const DAVEY_JONES_PATH = "GemItemsPurchased[8]";
const BOAT_FIELDS = [
    { key: "loot", label: "Loot Value", index: 3 },
    { key: "speed", label: "Speed", index: 5 },
];

const BoatsPart = () => {
    const states = new Map();
    const stateOf = (index) => {
        if (!states.has(index))
            states.set(index, Object.fromEntries(BOAT_FIELDS.map((field) => [field.key, van.state(0)])));
        return states.get(index);
    };
    const daveyState = van.state(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const BoatRow = (index) => {
        const name = `Boat ${index + 1}`;
        const at = (field) => `Boats[${index}][${field.index}]`;
        return ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: BOAT_FIELDS.map((field) => ({
                ...field,
                valueState: stateOf(index)[field.key],
                paths: [at(field)],
            })),
            read: async () => {
                const values = await Promise.all(BOAT_FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(BOAT_FIELDS.map((field, i) => [field.key, toInt(values[i], { min: 0 })]));
            },
        });
    };
    const daveyRow = ClampedLevelRow({
        valueState: daveyState,
        writePath: DAVEY_JONES_PATH,
        max: 8,
        integerMode: "trunc",
        name: "Davey Jones Training",
        renderInfo: () =>
            RowTitles({
                bonus: "1.50x Boat Speed, Loot Value, Artifact Find and Captain EXP each",
                name: "Davey Jones Training",
            }),
    });

    return {
        content: [
            AccountSection({ title: "Gem shop", body: daveyRow }),
            AccountSection({
                title: "Boats",
                body: [ValueTableHead({ name: "Boat", columns: BOAT_FIELDS.map((field) => field.label) }), listNode],
            }),
        ],
        load: async () => {
            const [rawBoats, davey] = await Promise.all([gga("Boats"), gga(DAVEY_JONES_PATH)]);
            const boats = toIndexedArray(rawBoats ?? []).map((raw) => toIndexedArray(raw ?? []));
            reconcileRows(String(boats.length), () => boats.map((_, index) => BoatRow(index)));
            boats.forEach((boat, index) =>
                BOAT_FIELDS.forEach((field) => (stateOf(index)[field.key].val = toInt(boat[field.index], { min: 0 })))
            );
            // The buys the game holds, above the shop's 8 too: the field brings them down.
            daveyState.val = toInt(davey, { min: 0 });
        },
    };
};

// ---- Captains ----------------------------------------------------------------------------------------------------

const OWNED_SLOTS = 30;
// The most each rarity (0 to 6) rolls for each bonus kind, as the game rolls it.
const BONUS_MAX = [
    [4, 11, 18, 26, 33, 40, 47],
    [7, 19, 31, 43, 55, 67, 79],
    [7, 19, 31, 43, 55, 67, 79],
    [3, 9, 15, 21, 27, 33, 39],
    [3, 7, 12, 17, 22, 27, 31],
];
const CAPTAIN_FIELDS = [
    { key: "rarity", label: "Rarity", index: 0, max: 6 },
    { key: "level", label: "Level", index: 3 },
    { key: "exp", label: "EXP", index: 4, formatted: true, quiet: true },
    { key: "bonus1", label: "Bonus 1", index: 5, kind: 1 },
    { key: "bonus2", label: "Bonus 2", index: 6, kind: 2 },
];
const KIND_PICKS = [
    { slot: 1, label: "First bonus" },
    { slot: 2, label: "Second bonus" },
];

const CaptainsPart = ({ pending, reload }) => {
    const kinds = van.state([]);
    const states = new Map();
    const stateOf = (slot) => {
        if (!states.has(slot))
            states.set(slot, {
                ...Object.fromEntries(CAPTAIN_FIELDS.map((field) => [field.key, van.state(0)])),
                kind1: van.state(0),
                kind2: van.state(0),
            });
        return states.get(slot);
    };
    const openSlot = van.state(-1);
    const poolCount = van.state(0);
    const ownedNode = div();
    const poolNode = div();
    const reconcileOwned = createStaticRowReconciler(ownedNode);
    const reconcilePool = createStaticRowReconciler(poolNode);
    const rowOf = new Map();
    // A kind in a word or two ("Boat Speed"): the title holds two of them.
    const kindLabel = (index) => kinds.val[index]?.short ?? `Bonus ${index + 1}`;
    // A low-rarity captain has one bonus: the game keeps -1 for the other ("None" on its picker, left off the title).
    const titleOf = (state) =>
        [state.kind1.val, state.kind2.val]
            .filter((kind) => kind >= 0)
            .map(kindLabel)
            .join(" · ");

    // A bonus kind: a step picker that saves on a pick, like a sigil's tier.
    const KindRow = (slot, pick) => {
        const kindState = stateOf(slot)[`kind${pick.slot}`];
        const picked = van.state(kindState.val);
        const path = `Captains[${slot}][${pick.slot}]`;
        const { status, reason, save, handlers, undo } = useAutoSave({
            capture: () => picked.val,
            prepare: (kind = picked.val) => {
                if (kind === kindState.val) return { unchanged: true };
                return {
                    write: async () => {
                        try {
                            await writeVerified(path, kind);
                        } catch (saveError) {
                            // The picker shows the kind the game holds, so the same pick can be tried again.
                            kindState.val = toNum(await gga(path).catch(() => kindState.val), -1);
                            if (picked.val === kind) picked.val = kindState.val;
                            throw saveError;
                        }
                        kindState.val = kind;
                    },
                };
            },
            revert: () => (picked.val = kindState.val),
        });
        van.derive(() => (picked.val = kindState.val));
        return AccountRow({
            rowClass: () => saveStateClass(status.val, undo),
            rowProps: handlers,
            info: span({ class: "account-row__name" }, pick.label),
            controls: [
                SaveState({ status, reason, undo }),
                StepPicker({
                    name: `Captain ${slot + 1} ${pick.label.toLowerCase()}`,
                    className: "captain-kinds",
                    steps: [
                        { value: -1, label: "None" },
                        ...kinds.val.map((kind) => ({ value: kind.index, label: kind.short })),
                    ],
                    picked: () => picked.val,
                    onPick: (kind) => {
                        picked.val = kind;
                        void save();
                    },
                }),
            ],
        });
    };

    // Removing a hired captain, the way the game's own discard does it (its sailing screen): the slot's rarity goes to
    // -1, its level back to 1 and its EXP to 0, and nothing else moves. Like the game it won't take a captain that is
    // on a boat, or the last one. It asks first, in place. Removals take turns (read, check, write, read again), so
    // two quick Removes can't both pass the last-captain check.
    const removeTurn = oneAtATime();
    const RemoveRow = (slot) => {
        const asking = van.state(false);
        const status = useWriteStatus();
        const refusal = van.state("");
        const name = `Captain ${slot + 1}`;
        const remove = () =>
            status.run(() =>
                removeTurn(async () => {
                    const [rawBoats, rawCaptains] = await Promise.all([gga("Boats"), gga("Captains")]);
                    const boats = toIndexedArray(rawBoats ?? []).map((raw) => toIndexedArray(raw ?? []));
                    const captains = toIndexedArray(rawCaptains ?? []).map((raw) => toIndexedArray(raw ?? []));
                    asking.val = false;
                    if (boats.some((boat) => toNum(boat[0], -1) === slot)) {
                        refusal.val = "It's on a boat. Take it off first.";
                        return { cancelled: true };
                    }
                    const hired = captains.slice(0, OWNED_SLOTS).filter((captain) => toNum(captain[0], -1) >= 0).length;
                    if (hired < 2) {
                        refusal.val = "Can't remove your last captain.";
                        return { cancelled: true };
                    }
                    refusal.val = "";
                    try {
                        await writeManyVerified([
                            { path: `Captains[${slot}][0]`, value: -1 },
                            { path: `Captains[${slot}][3]`, value: 1 },
                            { path: `Captains[${slot}][4]`, value: 0 },
                        ]);
                        openSlot.val = -1;
                    } catch (error) {
                        // Said where the player is looking (the "Remove it" button is gone by now); Remove tries again.
                        refusal.val = saveFailureReason(error);
                        throw error;
                    } finally {
                        // Part of it may have landed: show what the game holds either way.
                        await reload();
                    }
                })
            );
        return AccountRow({
            info: span({ class: "account-row__name" }, () => (asking.val ? `Remove ${name}?` : "Remove captain")),
            controls: [
                span({ class: "captain-remove__refusal", role: "status" }, () => refusal.val),
                div(
                    { class: "tabbed-list__tool-group", hidden: () => asking.val },
                    ActionButton({
                        label: "Remove",
                        variant: "danger",
                        disabled: pending,
                        onClick: (e) => {
                            e.preventDefault();
                            refusal.val = "";
                            asking.val = true;
                        },
                    })
                ),
                div(
                    { class: "tabbed-list__tool-group", hidden: () => !asking.val },
                    ActionButton({
                        label: "Remove it",
                        variant: "danger",
                        status: status.status,
                        onClick: (e) => {
                            e.preventDefault();
                            return remove();
                        },
                    }),
                    ActionButton({
                        label: "Cancel",
                        onClick: (e) => {
                            e.preventDefault();
                            asking.val = false;
                        },
                    })
                ),
            ],
        });
    };

    const CaptainRow = (slot) => {
        const state = stateOf(slot);
        const name = `Captain ${slot + 1}`;
        const isOpen = () => openSlot.val === slot;
        const at = (field) => `Captains[${slot}][${field.index}]`;
        const row = ValueTableRow({
            name,
            info: button(
                {
                    type: "button",
                    class: "row-opener",
                    "aria-expanded": () => String(isOpen()),
                    onclick: () => (openSlot.val = isOpen() ? -1 : slot),
                },
                RowTitles({ bonus: () => titleOf(state), name })
            ),
            fields: CAPTAIN_FIELDS.map((field) => ({
                ...field,
                valueState: state[field.key],
                paths: [at(field)],
                max: field.kind
                    ? () => BONUS_MAX[state[`kind${field.kind}`].val]?.[state.rarity.val] ?? Infinity
                    : field.max,
            })),
            read: async () => {
                const values = await Promise.all(CAPTAIN_FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(
                    CAPTAIN_FIELDS.map((field, i) => [
                        field.key,
                        field.formatted ? toNum(values[i], 0) : toInt(values[i], { min: 0 }),
                    ])
                );
            },
        });
        row.append(
            div(
                { class: "row-detail", hidden: () => !isOpen() },
                ...KIND_PICKS.map((pick) => KindRow(slot, pick)),
                // A pool offer is the shop's, not yours to remove.
                slot < OWNED_SLOTS ? RemoveRow(slot) : null
            )
        );
        return row;
    };

    const head = () => ValueTableHead({ name: "Captain", columns: CAPTAIN_FIELDS.map((field) => field.label) });

    return {
        content: div(
            { class: "sailing-captains" },
            AccountSection({ title: "Captains", body: [head(), ownedNode] }),
            div(
                { hidden: () => !poolCount.val },
                AccountSection({ title: "Recruitment pool", body: [head(), poolNode] })
            )
        ),
        load: async () => {
            const [rawCaptains, rawKinds] = await Promise.all([gga("Captains"), readCList("CaptainBonuses")]);
            kinds.val = toIndexedArray(rawKinds ?? []).map((raw, index) => {
                const label = bonusText(toIndexedArray(raw ?? [])[3]) || `Bonus ${index + 1}`;
                // The picker's word: the kind without its "%" and its trailing "Rate"/"Chance".
                return { index, label, short: label.replace(/ %$/, "").replace(/ (Rate|Chance)$/, "") };
            });
            const captains = toIndexedArray(rawCaptains ?? []).map((raw) => toIndexedArray(raw ?? []));
            // An empty slot (rarity -1) holds no captain.
            const hired = captains
                .map((captain, slot) => ({ slot, captain }))
                .filter((c) => toNum(c.captain[0], -1) >= 0);
            const owned = hired.filter((c) => c.slot < OWNED_SLOTS);
            const pool = hired.filter((c) => c.slot >= OWNED_SLOTS);
            // A captain still hired keeps its row through a reload (its Remove's answer stays on the page); a slot that
            // emptied drops its row, so a captain hired there later gets a new one.
            for (const slot of rowOf.keys()) if (!hired.some((c) => c.slot === slot)) rowOf.delete(slot);
            const rowFor = ({ slot }) => {
                if (!rowOf.has(slot)) rowOf.set(slot, CaptainRow(slot));
                return rowOf.get(slot);
            };
            reconcileOwned(owned.map((c) => c.slot).join("|"), () => owned.map(rowFor));
            reconcilePool(pool.map((c) => c.slot).join("|"), () => pool.map(rowFor));
            poolCount.val = pool.length;
            for (const { slot, captain } of hired) {
                const state = stateOf(slot);
                CAPTAIN_FIELDS.forEach((field) => {
                    const raw = captain[field.index];
                    state[field.key].val = field.formatted ? toNum(raw, 0) : toInt(raw, { min: 0 });
                });
                state.kind1.val = toNum(captain[1], -1);
                state.kind2.val = toNum(captain[2], -1);
            }
        },
    };
};

// ---- Islands -----------------------------------------------------------------------------------------------------

const ISLANDS_PATH = "Sailing[0]";
const UNLOCKED = -1;
const ISLAND_NAMES = [
    "Safari Island",
    "Beachy Coast",
    "Isolated Woods",
    "Rocky Peaks",
    "Stormy North",
    "Snowy South",
    "Toxic Bay Inc",
    "Candied Island",
    "Fungi Meadows",
    "Cloudy Quay",
    "Dungeon Cove",
    "Crystal Enclave",
    "Petulent Garage",
    "Isle Of Note",
    "The Edge",
    "Worlds End",
    "The Maw",
];

const IslandsPart = ({ pending, reload }) => {
    const bulk = useWriteStatus();
    const getState = createIndexedStateGetter(0);
    const islands = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const IslandRow = (island) =>
        AccountToggleRow({
            info: span({ class: "account-row__name" }, island.name),
            words: ["Unlocked", ""],
            name: island.name,
            checked: () => getState(island.index).val === UNLOCKED,
            title: `${island.name} unlocked`,
            write: async (on) => {
                const value = on ? UNLOCKED : 0;
                await writeVerified(`${ISLANDS_PATH}[${island.index}]`, value);
                getState(island.index).val = value;
            },
        });

    const shown = () => islands.val.filter((island) => shownBySearch(rowOf.get(island.index)));
    const isUnlocked = (island) => getState(island.index).val === UNLOCKED;
    const setAll = async (entries, value) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => value,
                getValueState: (island) => getState(island.index),
                getPath: (island) => `${ISLANDS_PATH}[${island.index}]`,
                // Locking clears only an unlocked island: one on its way keeps its cloud progress.
                shouldWrite: ({ currentValue }) =>
                    value === UNLOCKED ? Number(currentValue) !== UNLOCKED : Number(currentValue) === UNLOCKED,
            })
        );
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: listNode,
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [rawProgress, rawInfo] = await Promise.all([gga(ISLANDS_PATH), readCList("IslandInfo")]);
            const progress = toIndexedArray(rawProgress ?? []);
            const next = toIndexedArray(rawInfo ?? []).map((_, index) => ({
                index,
                name: ISLAND_NAMES[index] ?? `Island ${index + 1}`,
            }));
            reconcileRows(next.map((island) => island.name).join("|"), () =>
                next.map((island) => {
                    const row = IslandRow(island);
                    rowOf.set(island.index, row);
                    return row;
                })
            );
            next.forEach((island) => (getState(island.index).val = toNum(progress[island.index], 0)));
            islands.val = next;
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${plural(n, "island")}` : `All ${n} ${plural(n, "island")}`;
        },
        tools: (ask) => {
            const lockAll = ActionButton({
                label: "Lock all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shown().some(isUnlocked),
                onClick: (e) => {
                    e.preventDefault();
                    const entries = shown().filter(isUnlocked);
                    askFirst(
                        ask,
                        lockAll,
                        entries,
                        {
                            question: (n) => `Lock ${n} ${plural(n, "island")}?`,
                            one: "Lock it",
                            many: "Lock them",
                        },
                        () => setAll(entries, 0)
                    );
                },
            });
            return div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Unlock all",
                    status: bulk.status,
                    disabled: () => pending() || !shown().length,
                    onClick: (e) => {
                        e.preventDefault();
                        return setAll(shown(), UNLOCKED);
                    },
                }),
                lockAll
            );
        },
    };
};

// ---- Artifacts ---------------------------------------------------------------------------------------------------

const ARTIFACTS_PATH = "Sailing[3]";
// The game's tiers, in order (its patch note: "Ancient, Eldritch, Sovereign, Omnipotent, Transcendent, then
// Verisimilitude").
const TIERS = ["", "Found", "Ancient", "Eldritch", "Sovereign", "Omnipotent", "Transcendent", "Verisimilitude"];
const MAX_TIER = TIERS.length - 1;

const ArtifactsPart = ({ pending, reload }) => {
    const bulk = useWriteStatus();
    const getTierState = createIndexedStateGetter(0);
    const artifacts = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const ArtifactRow = (artifact) =>
        ClampedLevelRow({
            valueState: getTierState(artifact.index),
            writePath: `${ARTIFACTS_PATH}[${artifact.index}]`,
            max: MAX_TIER,
            integerMode: "trunc",
            name: artifact.name,
            renderInfo: () => RowTitles({ bonus: artifact.bonus, name: artifact.name }),
            renderBadge: (tier) => TIERS[tier] ?? "",
        });

    const shown = () => artifacts.val.filter((artifact) => shownBySearch(rowOf.get(artifact.index)));
    const setTiers = async (entries, tier) => {
        const result = await bulk.run(() =>
            runBulkSet({
                entries,
                getTargetValue: () => tier,
                getValueState: (artifact) => getTierState(artifact.index),
                getPath: (artifact) => `${ARTIFACTS_PATH}[${artifact.index}]`,
            })
        );
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: div({ class: "field-columns" }, listNode),
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [rawTiers, rawInfo] = await Promise.all([gga(ARTIFACTS_PATH), readCList("ArtifactInfo")]);
            const tiers = toIndexedArray(rawTiers ?? []);
            const next = toIndexedArray(rawInfo ?? []).map((raw, index) => {
                const info = toIndexedArray(raw ?? []);
                return { index, name: cleanName(info[0], `Artifact ${index + 1}`), bonus: bonusText(info[4]) };
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
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${plural(n, "artifact")}` : `All ${n} ${plural(n, "artifact")}`;
        },
        tools: (ask) => {
            const resetAll = ActionButton({
                label: "Reset all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shown().length,
                onClick: (e) => {
                    e.preventDefault();
                    const entries = shown();
                    askFirst(
                        ask,
                        resetAll,
                        entries,
                        {
                            question: (n) => `Reset ${n} ${plural(n, "artifact")} to not found?`,
                            one: "Reset it",
                            many: "Reset them",
                        },
                        () => setTiers(entries, 0)
                    );
                },
            });
            return div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Max all",
                    status: bulk.status,
                    disabled: () => pending() || !shown().length,
                    onClick: (e) => {
                        e.preventDefault();
                        return setTiers(shown(), MAX_TIER);
                    },
                }),
                resetAll
            );
        },
    };
};

// ---- Loot Pile ---------------------------------------------------------------------------------------------------

const TREASURES_PATH = "Sailing[1]";

const LootPilePart = () => {
    const getAmountState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    return {
        content: listNode,
        load: async () => {
            const [rawAmounts, rawIslands] = await Promise.all([gga(TREASURES_PATH), readCList("IslandInfo")]);
            const amounts = toIndexedArray(rawAmounts ?? []);
            // Each island has two treasures, after the Gold Bars.
            const count = Math.max(amounts.length, 1 + toIndexedArray(rawIslands ?? []).length * 2);
            // The game's item list holds no names for its treasures (only placeholders), so each is named by the
            // island it comes from, as the Loot Pile groups them.
            const treasures = Array.from({ length: count }, (_, index) => ({
                index,
                name:
                    index === 0
                        ? "Gold Bars"
                        : `${ISLAND_NAMES[Math.floor((index - 1) / 2)] ?? `Island ${Math.floor((index - 1) / 2) + 1}`} treasure ${((index - 1) % 2) + 1}`,
            }));
            reconcileRows(treasures.map((treasure) => treasure.name).join("|"), () =>
                treasures.map((treasure) =>
                    SimpleNumberRow({
                        entry: { name: treasure.name, path: `${TREASURES_PATH}[${treasure.index}]`, float: true },
                        valueState: getAmountState(treasure.index),
                    })
                )
            );
            treasures.forEach((treasure) => (getAmountState(treasure.index).val = toNum(amounts[treasure.index], 0)));
        },
    };
};

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    {
        id: "boats",
        label: "Boats",
        part: BoatsPart,
        keywords: ["Davey Jones Training", "Davey Jones", "Gem shop", "Limited", "Fomo", "Loot Value", "Boat Speed"],
    },
    {
        id: "captains",
        label: "Captains",
        part: CaptainsPart,
        keywords: [
            "Recruitment",
            "Captain bonus",
            "Captain level",
            "Captain EXP",
            "Captain rarity",
            "Remove captain",
            "Artifact Find",
        ],
    },
    { id: "islands", label: "Islands", part: IslandsPart, keywords: ["Clouds", "Sailing map"] },
    {
        id: "artifacts",
        label: "Artifacts",
        part: ArtifactsPart,
        keywords: ["Ancient", "Eldritch", "Sovereign", "Omnipotent", "Transcendent", "Verisimilitude"],
    },
    {
        id: "lootpile",
        label: "Loot Pile",
        part: LootPilePart,
        keywords: ["Currency", "Treasure", "Gold Bars", "Sailing currency"],
    },
];

const SailingTab = () => {
    const parts = new Map();
    const { loading, error, run } = useAccountLoad({
        label: "Sailing",
        busy: () => [...parts.values()].some((part) => part.busy?.()),
    });
    // After a read that failed, what the tabs show may be old: their tools wait for one that works.
    const pending = () => loading.val || Boolean(error.val);
    const load = () => run(() => loadParts(parts));
    for (const tab of TABS) parts.set(tab.id, tab.part({ pending, reload: load }));
    const partOf = (id) => parts.get(id);

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container sailing-tab",
        title: "Sailing",
        description: "Boats, captains, islands, artifacts and the loot pile.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val || [...parts.values()].some((part) => part.busy?.()),
        }),
        state: { loading, error },
        loadingText: "Reading sailing",
        errorTitle: "Couldn't read sailing",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Sailing",
                page: "w5.sailing",
                // Five tabs: on a phone they take two rows instead of running off the side.
                wrap: true,
                busy: () => [...parts.values()].some((part) => part.busy?.()),
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: partOf(tab.id).content })),
                // Each tab's own tools; the tray shows the open tab's.
                tools: toolsPerTab(
                    Object.fromEntries(
                        TABS.filter((tab) => partOf(tab.id).tools).map((tab) => [tab.id, partOf(tab.id).tools])
                    )
                ),
                toolsOn: (id) => Boolean(partOf(id).tools),
                toolsLabel: (activeId) => partOf(activeId.val).toolsLabel?.() ?? "",
            })
        ),
    });
};

export default definePage({
    id: "w5.sailing",
    world: 5,
    system: "Sailing",
    description: "Boats, captains, islands, artifacts and the loot pile.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: SailingTab,
});
