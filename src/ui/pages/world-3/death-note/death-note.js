/**
 * W3 - Death Note Tab
 *
 * World mob data sources:
 *   gga.CustomLists.h.DeathNoteMobs[worldIndex]           - array of mob IDs per world (W1=0 … W7=6)
 *   gga.CustomLists.h.MapAFKtarget[mapIndex]              - mob ID at a given map index
 *   gga.CustomLists.h.MapDetails[mapIndex][0][0]          - portal unlock kill requirement for that map
 *   gga.KillsLeft2Advance[mapIndex][0]                    - kills remaining for current character
 *   gga.PlayerDATABASE[playerName].KillsLeft2Advance[mapIndex][0]
 *                                                         - kills remaining for other characters
 *
 * Miniboss data sources:
 *   gga.CustomLists.h.NinjaInfo[30]             - array of miniboss mob IDs
 *   gga.Ninja[105]                              - array of kill counts (one per miniboss, account-wide)
 *   gga.MonsterDefinitionsGET.h[mobId].Name     - mob display name
 *
 * The game's pages are tabs: World 1 to World 7, then Minibosses. A world's mob opens its characters' kills in place
 * under its row (one open at a time); minibosses are account-wide kill counts.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import {
    adjustFormattedIntInput,
    cleanName,
    getOrCreateState,
    largeFormatter,
    largeParser,
    readCharacterInPlay,
    resolveFormattedIntInput,
    toInt,
    unwrapH,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";

const { button, div, span } = van.tags;

const MINIBOSS_WORLD_KEY = "Miniboss";
const WORLD_LABELS = ["W1", "W2", "W3", "W4", "W5", "W6", "W7"];
const SENTINEL_PLAYER_NAMES = new Set(["Player", "Current", ""]);

const DN_SUBTABS = [
    ...WORLD_LABELS.map((worldKey) => ({ id: worldKey.toLowerCase(), label: worldKey, worldKey })),
    { id: "miniboss", label: "Minibosses", worldKey: MINIBOSS_WORLD_KEY },
];

const playerDbKillsLeftPath = (playerName, mapIndex) =>
    `PlayerDATABASE.h[${playerName}].h.KillsLeft2Advance[${mapIndex}][0]`;
const liveKillsLeftPath = (mapIndex) => `KillsLeft2Advance[${mapIndex}][0]`;

const createWorldSignature = (mobs) =>
    (mobs ?? [])
        .map((mob) => {
            const players = Object.keys(mob.perCharacterKills ?? {})
                .sort()
                .join(",");
            return `${mob.mobId}|${players}`;
        })
        .join("||");

const createMinibossSignature = (mobs) => (mobs ?? []).map((mob) => String(mob.mobId)).join("|");

const createPaneSignature = (worldKey, snapshot) => {
    const mobs = snapshot?.worlds?.[worldKey] ?? [];
    if (worldKey === MINIBOSS_WORLD_KEY) return createMinibossSignature(mobs);
    return `${snapshot?.currentPlayer ?? ""}::${createWorldSignature(mobs)}`;
};

const createPaneStore = () => ({ signature: null, listNode: div({ class: "account-page-pane" }) });

const KillCountRow = ({
    killState,
    rowClass = "",
    controlsClass = "",
    renderInfo,
    renderBadge = null,
    write,
    onWriteError = null,
}) =>
    EditableNumberRow({
        valueState: killState,
        normalize: (rawValue) => resolveFormattedIntInput(rawValue, null, { min: 0 }),
        write: async (nextKills) => {
            try {
                return await write(nextKills);
            } catch (error) {
                if (typeof onWriteError === "function") onWriteError(error, nextKills);
                throw error;
            }
        },
        renderInfo,
        renderBadge,
        adjustInput: (rawValue, delta, currentValue) =>
            adjustFormattedIntInput(rawValue, delta, currentValue ?? 0, { min: 0 }),
        rowClass,
        controlsClass,
        inputProps: {
            formatter: largeFormatter,
            parser: largeParser,
        },
    });

const PlayerKillRow = ({ playerName, killState, isCurrentPlayer, mob }) =>
    KillCountRow({
        killState,
        rowClass: "dn-player-row",
        renderInfo: () => span({ class: "account-row__name" }, playerName),
        renderBadge: isCurrentPlayer ? () => "In play" : null,
        write: async (nextKills) => {
            if (
                !Number.isInteger(mob.mapIndex) ||
                mob.mapIndex < 0 ||
                !Number.isInteger(mob.required) ||
                mob.required < 0
            ) {
                throw new Error("Invalid map target for Death Note write");
            }

            const newKillsLeft = mob.required - nextKills;
            const dbPath = playerDbKillsLeftPath(playerName, mob.mapIndex);

            // Who is in play now, not when the page read the game: the live kills belong to that character. The game
            // checks again as it writes, so a switch meanwhile refuses the save instead of changing another's kills.
            if ((await readCharacterInPlay()) === playerName) {
                await writeManyVerified([{ path: liveKillsLeftPath(mob.mapIndex), value: newKillsLeft }], {
                    character: playerName,
                });
            }

            await writeVerified(dbPath, newKillsLeft);
            return nextKills;
        },
        onWriteError: (error, nextKills) => {
            console.error("[DeathNote][World SET] write failed", {
                playerName,
                mobId: mob.mobId,
                mapIndex: mob.mapIndex,
                required: mob.required,
                requestedKills: nextKills,
                error: error?.message ?? String(error),
            });
        },
    });

// A mob and its kills on all characters; its name opens each character's kills in place, under the row.
const MobRow = ({ mob, getKillState, isOpen, onOpen, currentPlayer }) => {
    const playerNames = Object.keys(mob.perCharacterKills);
    const totalKills = () => playerNames.reduce((sum, name) => sum + toInt(getKillState(mob.mobId, name).val), 0);
    const playerRows = playerNames.map((name) =>
        PlayerKillRow({
            playerName: name,
            killState: getKillState(mob.mobId, name),
            isCurrentPlayer: name === currentPlayer,
            mob,
        })
    );
    const row = AccountRow({
        rowClass: () => `dn-mob-row${isOpen() ? " is-open" : ""}`,
        info: button(
            { type: "button", class: "row-opener", "aria-expanded": () => String(isOpen()), onclick: onOpen },
            span({ class: "account-row__name" }, mob.mobName)
        ),
        controls: span({ class: "dn-mob-row__total" }, () => formatNumber(totalKills())),
    });
    // The characters' rows stay mounted (they keep their saves and Undo); closed, they're hidden.
    row.append(div({ class: "row-detail", hidden: () => !isOpen() }, ...playerRows));
    return row;
};

const MinibossRow = ({ mob, killState }) =>
    KillCountRow({
        killState,
        renderInfo: () => span({ class: "account-row__name" }, mob.mobName),
        write: async (nextKills) => {
            const path = `Ninja[105][${mob.mobIndex}]`;
            return writeVerified(path, nextKills);
        },
    });

const buildStaticMeta = async () => {
    const [rawDeathNoteMobs, rawMapTargets, rawMapDetails, rawMinibossIds] = await Promise.all([
        gga("CustomLists.h.DeathNoteMobs"),
        gga("CustomLists.h.MapAFKtarget"),
        gga("CustomLists.h.MapDetails"),
        gga("CustomLists.h.NinjaInfo[30]"),
    ]);

    const deathNoteGroups = toIndexedArray(rawDeathNoteMobs ?? []);
    const mapTargets = toIndexedArray(rawMapTargets ?? []);
    const mapDetails = toIndexedArray(rawMapDetails ?? []);
    const minibossIds = toIndexedArray(rawMinibossIds ?? [])
        .filter(Boolean)
        .map((mobId) => String(mobId));

    const mapIndexByMobId = new Map();
    mapTargets.forEach((target, mapIndex) => {
        const mobId = String(target ?? "");
        if (!mobId || mapIndexByMobId.has(mobId)) return;
        mapIndexByMobId.set(mobId, mapIndex);
    });

    const getRequired = (mapIndex) => {
        const row = toIndexedArray(mapDetails[mapIndex] ?? []);
        const inner = toIndexedArray(row[0] ?? []);
        return inner[0] ?? -1;
    };

    const worldMobIds = WORLD_LABELS.flatMap((_, worldIndex) =>
        toIndexedArray(deathNoteGroups[worldIndex] ?? [])
            .filter(Boolean)
            .map((mobId) => String(mobId))
    );
    const allMobIds = Array.from(new Set([...worldMobIds, ...minibossIds]));
    const monsterDefs = allMobIds.length
        ? await readGgaEntries("MonsterDefinitionsGET.h", allMobIds, ["Name", "displayName", "name"])
        : {};

    const getMobName = (mobId) => {
        const def = unwrapH(monsterDefs[mobId]) || {};
        return cleanName(def.Name || def.displayName || def.name || mobId, mobId);
    };

    const worlds = {};
    for (let worldIndex = 0; worldIndex < WORLD_LABELS.length; worldIndex++) {
        const worldKey = WORLD_LABELS[worldIndex];
        const rawGroup = toIndexedArray(deathNoteGroups[worldIndex] ?? []);
        worlds[worldKey] = rawGroup.filter(Boolean).map((rawMobId) => {
            const mobId = String(rawMobId);
            const mapIndex = mapIndexByMobId.get(mobId) ?? -1;
            return {
                type: "world",
                mobId,
                mobName: getMobName(mobId),
                mapIndex,
                required: mapIndex >= 0 ? getRequired(mapIndex) : 0,
            };
        });
    }

    worlds[MINIBOSS_WORLD_KEY] = minibossIds.map((mobId, mobIndex) => ({
        type: "miniboss",
        mobId,
        mobName: getMobName(mobId),
        mobIndex,
    }));

    return { worlds };
};

const DeathNoteTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Death Note" });
    const killStates = new Map();
    // The mob whose characters show, one at a time.
    const openMob = van.state(null);
    const paneStores = new Map();
    let staticMeta = null;

    const getKillState = (mobId, playerName) => getOrCreateState(killStates, `${mobId}:${playerName}`);
    const getPaneStore = (worldKey) => {
        if (!paneStores.has(worldKey)) paneStores.set(worldKey, createPaneStore());
        return paneStores.get(worldKey);
    };

    const reconcilePaneRows = (worldKey, snapshot) => {
        const paneStore = getPaneStore(worldKey);
        const signature = createPaneSignature(worldKey, snapshot);
        if (paneStore.signature === signature) return;
        paneStore.signature = signature;

        const mobs = snapshot.worlds[worldKey] ?? [];
        const rows =
            worldKey === MINIBOSS_WORLD_KEY
                ? mobs.map((mob) => MinibossRow({ mob, killState: getKillState(mob.mobId, "_") }))
                : mobs.map((mob) =>
                      MobRow({
                          mob,
                          getKillState,
                          isOpen: () => openMob.val === mob.mobId,
                          onOpen: () => (openMob.val = openMob.val === mob.mobId ? null : mob.mobId),
                          currentPlayer: snapshot.currentPlayer,
                      })
                  );

        paneStore.listNode.replaceChildren(...rows);
    };

    const load = async () =>
        run(async () => {
            if (!staticMeta) staticMeta = await buildStaticMeta();

            const [currentPlayer, rawPlayerNames, rawKillsLeft, rawMinibossKills] = await Promise.all([
                readCharacterInPlay(),
                gga("GetPlayersUsernames"),
                gga("KillsLeft2Advance"),
                gga("Ninja[105]"),
            ]);

            const currentPlayerName = String(currentPlayer ?? "");
            const hasRealCurrentPlayer = !SENTINEL_PLAYER_NAMES.has(currentPlayerName);
            const playerNames = Array.from(
                new Set([
                    ...toIndexedArray(rawPlayerNames ?? [])
                        .filter((name) => typeof name === "string" && name.trim().length > 0 && !name.startsWith("__"))
                        .map((name) => String(name)),
                    ...(hasRealCurrentPlayer ? [currentPlayerName] : []),
                ])
            );
            const rawPlayerDb = playerNames.length
                ? await readGgaEntries("PlayerDATABASE.h", playerNames, ["KillsLeft2Advance"])
                : {};
            const otherPlayers = playerNames.filter((name) => {
                if (name === currentPlayerName) return false;
                const pdata = unwrapH(rawPlayerDb[name]) || {};
                return pdata.KillsLeft2Advance !== undefined;
            });
            const killsLeftArr = toIndexedArray(rawKillsLeft ?? []);
            const minibossKills = toIndexedArray(rawMinibossKills ?? []);
            const worlds = {};

            const getCurrentKills = (mob) => {
                const left = toInt(toIndexedArray(killsLeftArr[mob.mapIndex] ?? [])[0] ?? mob.required);
                return mob.required - left;
            };

            const getOtherKills = (playerName, mob) => {
                const pdata = unwrapH(rawPlayerDb[playerName]) || {};
                const playerKillsLeft = toIndexedArray(pdata.KillsLeft2Advance ?? []);
                const left = toInt(toIndexedArray(playerKillsLeft[mob.mapIndex] ?? [])[0] ?? mob.required);
                return mob.required - left;
            };

            for (const worldKey of WORLD_LABELS) {
                worlds[worldKey] = (staticMeta.worlds[worldKey] ?? []).map((mob) => {
                    const perCharacterKills = {};
                    if (hasRealCurrentPlayer) {
                        perCharacterKills[currentPlayerName] = mob.mapIndex >= 0 ? getCurrentKills(mob) : 0;
                    }
                    for (const playerName of otherPlayers) {
                        perCharacterKills[playerName] = mob.mapIndex >= 0 ? getOtherKills(playerName, mob) : 0;
                    }

                    return { ...mob, perCharacterKills };
                });
            }

            worlds[MINIBOSS_WORLD_KEY] = (staticMeta.worlds[MINIBOSS_WORLD_KEY] ?? []).map((mob) => ({
                ...mob,
                kills: toInt(minibossKills[mob.mobIndex] ?? 0),
            }));

            for (const worldKey of WORLD_LABELS) {
                for (const mob of worlds[worldKey]) {
                    for (const [playerName, kills] of Object.entries(mob.perCharacterKills)) {
                        getKillState(mob.mobId, playerName).val = toInt(kills);
                    }
                }
            }

            for (const mob of worlds[MINIBOSS_WORLD_KEY]) {
                getKillState(mob.mobId, "_").val = toInt(mob.kills);
            }

            const snapshot = { worlds, currentPlayer: currentPlayerName };
            for (const tab of DN_SUBTABS) {
                reconcilePaneRows(tab.worldKey, snapshot);
            }
        });

    const body = div(
        { class: "account-list account-list--tabbed" },
        TabbedList({
            name: "Death Note",
            tabs: DN_SUBTABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                content: getPaneStore(tab.worldKey).listNode,
            })),
        })
    );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Death Note",
        description: "Kills of each Death Note mob on every character, and miniboss kills.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the death note",
        errorTitle: "Couldn't read the death note",
        initialWrapperClass: "account-list",
        body,
    });
};

export default definePage({
    id: "w3.deathnote",
    world: 3,
    system: "Death Note",
    description: "Kills per map and miniboss for the Death Note.",
    keywords: ["Kills", "Minibosses"],
    component: DeathNoteTab,
});
