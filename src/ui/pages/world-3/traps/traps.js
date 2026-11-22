/**
 * W3 - Trapping Tab
 *
 * Data sources:
 *   gga.GetPlayersUsernames                              - all character names
 *   readCharacterInPlay()                                - the character in play; rejects at character select
 *   gga.PlayerDATABASE.h[playerName].h.PldTraps         - stored traps per character
 *   gga.PlacedTraps                                      - live traps for currently selected character
 *
 * Trap row shape (t):
 *   t[0] map
 *   t[1] x position
 *   t[2] current elapsed progress
 *   t[3] critter
 *   t[4] qty reward
 *   t[5] trap type
 *   t[6] completion time
 *   t[7] exp reward
 *   t[8] rare chance
 *
 * Each character is a tab, its traps a table: Qty, EXP and Rare in columns, Finish at the line's end. Finish all sits
 * in the tray and finishes the open tab's traps the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import {
    EditableFieldsRow,
    StackedNumberField,
    ValueTableHead,
} from "../../../components/views/account/EditableFieldsRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    adjustFormattedIntInput,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    readCharacterInPlay,
    resolveFormattedIntInput,
    toInt,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, p, span } = van.tags;

const trapStateKey = (playerName, trapIndex, field) => `${playerName}:${trapIndex}:${field}`;
const trapBasePath = (playerName, trapIndex) => `PlayerDATABASE.h[${playerName}].h.PldTraps[${trapIndex}]`;
const trapShapeSignature = (snapshot) =>
    `${snapshot.currentPlayer}::${snapshot.players
        .map(
            (player) =>
                `${player.playerName}:${player.traps
                    .map((trap) => `${trap.trapIndex}:${trap.critterId}:${trap.map}`)
                    .join(",")}`
        )
        .join("|")}`;

const progressLabel = (elapsed, completion) => {
    const done = toInt(elapsed, 0);
    const total = Math.max(0, toInt(completion, 0));
    const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0;
    return `${formatNumber(done)} / ${formatNumber(total)} done (${pct}%)`;
};

const resolveCritterName = (critterId, itemDefs, monsterDefs) => {
    const raw = critterId ?? "";
    const key = String(raw);
    if (!key) return "Unknown Critter";

    const itemDef = unwrapH(itemDefs[key] ?? itemDefs[raw]);
    const itemName = itemDef?.Name ?? itemDef?.displayName ?? itemDef?.name;
    if (itemName) return cleanName(itemName, key);

    const mobDef = unwrapH(monsterDefs[key] ?? monsterDefs[raw]);
    const mobName = mobDef?.Name ?? mobDef?.displayName ?? mobDef?.name;
    if (mobName) return cleanName(mobName, key);

    return cleanName(raw, key) || key;
};

const parseTrapRows = (rawTraps) =>
    toIndexedArray(rawTraps ?? [])
        .map((rawTrap, trapIndex) => {
            const t = toIndexedArray(rawTrap ?? []);
            const mapValue = toInt(t[0], -1);
            if (mapValue === -1) return null;

            return {
                trapIndex,
                map: mapValue,
                xPos: toInt(t[1], 0),
                elapsed: toInt(t[2], 0),
                critterId: t[3],
                qty: toInt(t[4], 0),
                trapType: toInt(t[5], 0),
                completionTime: toInt(t[6], 0),
                exp: toInt(t[7], 0),
                rareChance: toInt(t[8], 0),
            };
        })
        .filter(Boolean);

const TrappingRow = ({ playerName, trap, getValueState, onWriteField, finishTrap }) => {
    const qtyValue = getValueState(playerName, trap.trapIndex, "qty", toInt(trap.qty));
    const expValue = getValueState(playerName, trap.trapIndex, "exp", toInt(trap.exp));
    const rareValue = getValueState(playerName, trap.trapIndex, "rare", toInt(trap.rareChance));
    const elapsedValue = getValueState(playerName, trap.trapIndex, "elapsed", toInt(trap.elapsed));
    const completionValue = getValueState(playerName, trap.trapIndex, "completion", toInt(trap.completionTime));
    const finishStatus = useWriteStatus();

    return EditableFieldsRow({
        fields: [
            { key: "qty", valueState: qtyValue },
            { key: "exp", valueState: expValue },
            { key: "rare", valueState: rareValue },
        ],
        normalize: ({ qty, exp, rare }) => {
            const nextQty = resolveFormattedIntInput(qty, null, { min: 0 });
            const nextExp = resolveFormattedIntInput(exp, null, { min: 0 });
            const nextRare = resolveFormattedIntInput(rare, null, { min: 0 });
            if (nextQty === null || nextExp === null || nextRare === null) return null;
            return { qty: nextQty, exp: nextExp, rare: nextRare };
        },
        write: async ({ qty, exp, rare }) => {
            const verifiedQty = await onWriteField(playerName, trap.trapIndex, 4, qty);
            const verifiedExp = await onWriteField(playerName, trap.trapIndex, 7, exp);
            const verifiedRare = await onWriteField(playerName, trap.trapIndex, 8, rare);
            return { qty: verifiedQty, exp: verifiedExp, rare: verifiedRare };
        },
        // The critter, then how far the trap is, small and muted under it.
        info: span(
            { class: "account-row__titles" },
            span({ class: "account-row__name" }, trap.critterName),
            span({ class: "trap-row__progress" }, () => progressLabel(elapsedValue.val, completionValue.val))
        ),
        rowClass: "trap-row value-row",
        renderControls: ({ draftStates, getDraftValue, setFieldFocused, resetDraft }) =>
            div(
                { class: "value-cells" },
                StackedNumberField({
                    field: {
                        key: "qty",
                        label: "Qty",
                        formatted: true,
                        rootClass: "value-cell",
                        labelClass: "value-cell__label",
                        inputProps: { "aria-label": `${trap.critterName} qty` },
                        adjustDraft: (raw, delta) => adjustFormattedIntInput(raw, delta, qtyValue.val, { min: 0 }),
                    },
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                StackedNumberField({
                    field: {
                        key: "exp",
                        label: "EXP",
                        formatted: true,
                        rootClass: "value-cell",
                        labelClass: "value-cell__label",
                        inputProps: { "aria-label": `${trap.critterName} EXP` },
                        adjustDraft: (raw, delta) => adjustFormattedIntInput(raw, delta, expValue.val, { min: 0 }),
                    },
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                StackedNumberField({
                    field: {
                        key: "rare",
                        label: "Rare",
                        formatted: true,
                        rootClass: "value-cell",
                        labelClass: "value-cell__label",
                        inputProps: { "aria-label": `${trap.critterName} rare` },
                        adjustDraft: (raw, delta) => adjustFormattedIntInput(raw, delta, rareValue.val, { min: 0 }),
                    },
                    draftStates,
                    getDraftValue,
                    setFieldFocused,
                    resetDraft,
                }),
                // Finish closes the line, in the table's last column.
                ActionButton({
                    label: "Finish",
                    status: finishStatus.status,
                    className: "trap-row__finish-btn",
                    disabled: () => elapsedValue.val >= completionValue.val,
                    onClick: (e) => {
                        e.preventDefault();
                        return finishStatus.run(() => finishTrap(playerName, trap));
                    },
                })
            ),
    });
};

const TrappingTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Trapping" });
    const finishAllStatus = useWriteStatus();
    const valueStates = new Map();
    const critterNameById = new Map();
    const playersNode = div({ class: "account-list account-list--tabbed traps-list" });
    // Each trap's row, so Finish all acts on the open tab's traps the search shows.
    const rowOf = new Map();
    let latestSnapshot = { currentPlayer: "", players: [] };
    const reconcilePlayerPanels = createStaticRowReconciler(playersNode);

    const getValueState = (playerName, trapIndex, field, initialValue = 0) =>
        getOrCreateState(valueStates, trapStateKey(playerName, trapIndex, field), initialValue);

    const setTrapStatesFromSnapshot = (snapshot) => {
        for (const player of snapshot.players) {
            for (const trap of player.traps) {
                getValueState(player.playerName, trap.trapIndex, "qty", 0).val = toInt(trap.qty);
                getValueState(player.playerName, trap.trapIndex, "exp", 0).val = toInt(trap.exp);
                getValueState(player.playerName, trap.trapIndex, "rare", 0).val = toInt(trap.rareChance);
                getValueState(player.playerName, trap.trapIndex, "elapsed", 0).val = toInt(trap.elapsed);
                getValueState(player.playerName, trap.trapIndex, "completion", 0).val = toInt(trap.completionTime);
            }
        }
    };

    const reconcilePlayers = (snapshot) => {
        latestSnapshot = snapshot;
        setTrapStatesFromSnapshot(snapshot);

        reconcilePlayerPanels(trapShapeSignature(snapshot), () => {
            rowOf.clear();
            return TabbedList({
                name: "Traps",
                tabs: snapshot.players.map((player) => ({
                    id: player.playerName,
                    label: player.playerName,
                    content: player.traps.length
                        ? [
                              ValueTableHead({ name: "Critter", columns: ["Qty", "EXP", "Rare", ""] }),
                              ...player.traps.map((trap) => {
                                  const row = TrappingRow({
                                      playerName: player.playerName,
                                      trap,
                                      getValueState,
                                      onWriteField,
                                      finishTrap,
                                  });
                                  rowOf.set(`${player.playerName}:${trap.trapIndex}`, row);
                                  return row;
                              }),
                          ]
                        : p({ class: "trap-empty" }, "No traps placed."),
                })),
                toolsOn: (playerName) => Boolean(trapsOf(playerName).length),
                toolsLabel: (activeId) => {
                    const n = trapsShown(activeId.val).length;
                    const inPlay = activeId.val === latestSnapshot.currentPlayer ? " · in play" : "";
                    return `${isSearching() ? `${n} matching ${trapWord(n)}` : `All ${n} ${trapWord(n)}`}${inPlay}`;
                },
                tools: (activeId) =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Finish all",
                            status: finishAllStatus.status,
                            disabled: () => loading.val || !trapsShown(activeId.val).length,
                            onClick: (e) => {
                                e.preventDefault();
                                return finishAllTraps(activeId.val);
                            },
                        })
                    ),
            });
        });
    };

    // PlacedTraps holds the traps of the character in play now, so a save asks the game who that is first.
    const onWriteField = async (playerName, trapIndex, fieldIndex, value) => {
        const inPlay = await readCharacterInPlay(latestSnapshot.currentPlayer);
        if (playerName === inPlay) {
            // The game refuses it if another character is in play by the time it writes.
            await writeVerified(`PlacedTraps[${trapIndex}][${fieldIndex}]`, value, { character: inPlay });
        }

        const dbPath = `${trapBasePath(playerName, trapIndex)}[${fieldIndex}]`;
        return writeVerified(dbPath, value);
    };

    // One trap done: its progress set to its completion time.
    const finishTrap = async (playerName, trap) => {
        const finishAt = toInt(
            getValueState(playerName, trap.trapIndex, "completion", 0).val,
            toInt(trap.completionTime)
        );
        const verifiedElapsed = await onWriteField(playerName, trap.trapIndex, 2, finishAt);
        getValueState(playerName, trap.trapIndex, "elapsed", 0).val = verifiedElapsed;
    };

    const trapsOf = (playerName) =>
        latestSnapshot.players.find((player) => player.playerName === playerName)?.traps ?? [];
    // The open tab's traps Finish all acts on: every one, or those the top bar's search shows.
    const trapsShown = (playerName) =>
        trapsOf(playerName).filter((trap) => shownBySearch(rowOf.get(`${playerName}:${trap.trapIndex}`)));
    const trapWord = (n) => `trap${n === 1 ? "" : "s"}`;

    // Finishing only moves progress forward, so it runs on one press.
    const finishAllTraps = async (playerName) => {
        const traps = trapsShown(playerName).filter(
            (trap) =>
                getValueState(playerName, trap.trapIndex, "elapsed", 0).val <
                getValueState(playerName, trap.trapIndex, "completion", 0).val
        );
        if (!traps.length) return;
        await finishAllStatus.run(async () => {
            for (const trap of traps) await finishTrap(playerName, trap);
        });
    };

    const loadCritterNames = async (critterIds) => {
        const missingCritterIds = critterIds.filter((critterId) => !critterNameById.has(critterId));
        if (!missingCritterIds.length) return;

        const [itemDefs, monsterDefs] = await Promise.all([
            readGgaEntries("ItemDefinitionsGET.h", missingCritterIds, ["Name", "displayName", "name"]),
            readGgaEntries("MonsterDefinitionsGET.h", missingCritterIds, ["Name", "displayName", "name"]),
        ]);

        for (const critterId of missingCritterIds) {
            critterNameById.set(critterId, resolveCritterName(critterId, itemDefs, monsterDefs));
        }
    };

    const load = async () =>
        run(async () => {
            const [rawNames, currentPlayer] = await Promise.all([gga("GetPlayersUsernames"), readCharacterInPlay()]);
            const playerNames = toIndexedArray(rawNames ?? []).filter(
                (name) => typeof name === "string" && name.trim().length > 0 && !name.startsWith("__")
            );

            const [playerEntries, liveTraps] = await Promise.all([
                playerNames.length ? readGgaEntries("PlayerDATABASE.h", playerNames, ["PldTraps"]) : {},
                currentPlayer ? gga("PlacedTraps") : [],
            ]);

            const playersWithRawTraps = playerNames.map((playerName) => {
                const playerNode = unwrapH(playerEntries[playerName]) || {};
                const rawTraps = playerName === currentPlayer ? liveTraps : playerNode.PldTraps;
                return { playerName, traps: parseTrapRows(rawTraps) };
            });
            const critterIds = [
                ...new Set(
                    playersWithRawTraps
                        .flatMap((player) => player.traps.map((trap) => String(trap.critterId ?? "")))
                        .filter(Boolean)
                ),
            ];
            await loadCritterNames(critterIds);

            reconcilePlayers({
                currentPlayer,
                players: playersWithRawTraps.map((player) => ({
                    playerName: player.playerName,
                    traps: player.traps.map((trap) => ({
                        ...trap,
                        critterName: critterNameById.get(String(trap.critterId ?? "")) ?? "Unknown Critter",
                    })),
                })),
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container traps-tab",
        title: "Traps",
        description: "Each character's placed traps. Rare chance tops out at 100.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading traps",
        errorTitle: "Couldn't read traps",
        initialWrapperClass: "account-list",
        body: playersNode,
    });
};

export default definePage({
    id: "w3.traps",
    world: 3,
    system: "Traps",
    description: "Placed traps for each character.",
    keywords: ["Trapping", "Critters"],
    component: TrappingTab,
});
