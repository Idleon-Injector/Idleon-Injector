/**
 * Account-wide prayer levels and per-character equipment.
 *
 * One list in the game's order, each prayer's bonus first, its name and curse under it. The character whose prayers
 * Equip changes is picked on the line under the title. Unlock all, Max all and Unequip all sit in the tray and act on
 * the prayers the top bar's search shows; Unequip asks there first.
 */
import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { askAtField } from "../../../components/inPlace.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { createCharacterSelector } from "../../../components/views/account/components/CharacterSelector.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    CHARACTER_CHANGED,
    bonusText,
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    readCharacterInPlay,
    resolveNumberInput,
    unwrapH,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

export const savedPath = (name, slot) => `PlayerDATABASE.h[${name}].h.Prayers[${slot}]`;

export const calculateCapacity = (wizardLevel, thresholds, gemSlots) => {
    let capacity = 0;
    thresholds.forEach((threshold, index) => {
        if (wizardLevel >= threshold) capacity = index + 1;
    });
    return Math.max(0, Math.min(12, Math.round(capacity + Number(gemSlots || 0))));
};

export const calculateGamingPercent = (gamingBits, letters) => {
    if (typeof gamingBits !== "string") return 0;
    const letterList = toIndexedArray(letters ?? []);
    const bits = [9, 39, 53].map(
        (index) => Boolean(letterList[index]) && gamingBits.includes(String(letterList[index]))
    );
    return 20 * bits.filter(Boolean).length;
};

export const equipmentPlan = (state, player, ids) => {
    const writes = [];
    player.saved.forEach((id, slot) => {
        if (ids.includes(id)) writes.push({ path: savedPath(player.name, slot), value: -1 });
    });
    if (player.name === state.current) {
        player.prayers.forEach((id, slot) => {
            if (ids.includes(id)) writes.push({ path: `PrayersActive[${slot}]`, value: -1 });
        });
    }
    return writes;
};

export const levelPlan = (state, id, requested) => {
    const definition = state.definitions.find((entry) => entry.id === id);
    if (!definition) throw new Error("Prayer metadata changed. Refresh and try again.");
    const next = Math.max(0, Math.min(Number(definition.data[9]), requested));
    const affected =
        next === 0 ? state.players.filter((player) => player.prayers.includes(id) || player.saved.includes(id)) : [];
    return {
        equipment: next === 0 ? affected.flatMap((player) => equipmentPlan(state, player, [id])) : [],
        levels: state.levels[id] !== next ? [{ path: `PrayersUnlocked[${id}]`, value: next }] : [],
        confirmation:
            next === 0 && (affected.length || state.levels[id] !== 0)
                ? `lock ${cleanName(definition.data[0])} at level 0.${affected.length ? ` Unequips it from ${affected.length} character(s): ${affected.map((player) => player.name).join(", ")}.` : ""}`
                : null,
        value: next,
    };
};

/** Render the prayer editor without invoking normal-game purchases or unlocks. */
const PrayersTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Prayers" });
    const busy = van.state(false);
    const selected = van.state("");
    const snapshot = van.state(null);
    const message = van.state("");
    const levelStates = new Map();
    const metadataStates = new Map();
    const bulkStatus = useWriteStatus();
    const rows = div({ class: "account-page-pane" });
    // Each prayer's row, so the tools act only on the prayers the top bar's search shows.
    const rowOf = new Map();
    const shownIds = () =>
        (snapshot.val?.definitions ?? []).map(({ id }) => id).filter((id) => shownBySearch(rowOf.get(id)));
    const reconcileRows = createStaticRowReconciler(rows);
    const characterSelector = createCharacterSelector({
        id: "prayers-character",
        selected,
        disabled: () => busy.val || loading.val || Boolean(error.val),
        onChange: (event) => {
            if (!busy.val) selected.val = event.target.value;
        },
        info: () => (snapshot.val ? slotsLine() : ""),
    });
    const unavailable = () => busy.val || loading.val || Boolean(error.val) || !snapshot.val;

    const readSnapshot = async () => {
        const current = await readCharacterInPlay();
        const [
            rawNames,
            rawLevels,
            rawDefinitions,
            rawActive,
            gemSlots,
            rawThresholds,
            gamingBits,
            letters,
            rawTrials,
        ] = await Promise.all([
            gga("GetPlayersUsernames"),
            gga("PrayersUnlocked"),
            readCList("PrayerInfo"),
            gga("PrayersActive"),
            gga("GemItemsPurchased[114]"),
            readCList("RANDOlist[9]"),
            gga("Gaming[12]"),
            gga("Number2Letter"),
            readCList("WorshipBASEinfos"),
        ]);
        const roster = toIndexedArray(rawNames);
        const names = roster.filter((name) => typeof name === "string" && name && !name.startsWith("__"));
        const entries = await readGgaEntries("PlayerDATABASE.h", names, ["Prayers", "CharacterClass", "Lv0"]);
        const trials = toIndexedArray(rawTrials).map((raw) => toIndexedArray(raw)[2]);
        const trialKeys = [...new Set(trials.filter((key) => typeof key === "string" && key.length > 0))];
        const trialMonsters =
            trialKeys.length > 0 ? await readGgaEntries("MonsterDefinitionsGET.h", trialKeys, ["Name"]) : {};
        if (!names.includes(current)) throw new Error(CHARACTER_CHANGED);
        await readCharacterInPlay(current);
        const levels = toIndexedArray(rawLevels).map(Number);
        const definitions = toIndexedArray(rawDefinitions)
            .map((raw, id) => ({ id, data: toIndexedArray(raw) }))
            .filter(({ data }) => data[0] !== "Some_Prayer_Name0" && Number(data[9]) > 0);
        const active = toIndexedArray(rawActive).map(Number);
        const thresholds = toIndexedArray(rawThresholds).slice(0, 8).map(Number);
        const players = names.map((name) => {
            const entry = unwrapH(entries[name]);
            const rawSaved = entry?.Prayers ? toIndexedArray(entry.Prayers).map(Number) : Array(12).fill(-1);
            const saved = rawSaved.length === 12 ? rawSaved : Array(12).fill(-1);
            return {
                name,
                saved,
                prayers: name === current ? active : saved,
                classId: Number(entry?.CharacterClass ?? 0),
                level: Number(toIndexedArray(entry?.Lv0 ?? [])[0] ?? 0),
            };
        });
        if (
            !definitions.length ||
            active.length !== 12 ||
            thresholds.length !== 8 ||
            !Number.isFinite(Number(gemSlots ?? 0)) ||
            definitions.some(({ id, data }) => !Number.isFinite(levels[id]) || !Number.isFinite(Number(data[9])))
        ) {
            throw new Error("Prayer metadata or account state is incomplete. Refresh and try again.");
        }
        const wizardLevel = Math.max(
            0,
            ...players.filter((player) => [32, 34, 35].includes(player.classId)).map((player) => player.level)
        );
        const capacity = calculateCapacity(wizardLevel, thresholds, gemSlots);
        const gamingPercent = calculateGamingPercent(gamingBits, letters);
        return {
            current,
            players,
            levels,
            definitions,
            trialNames: trials.map((key) => cleanName(unwrapH(trialMonsters[key])?.Name || key || "")),
            capacity,
            gamingPercent,
        };
    };

    const applySnapshot = (next) => {
        if (!next.players.some((player) => player.name === selected.val)) selected.val = next.current;
        snapshot.val = next;
        characterSelector.setCharacters(next.players.map((player) => player.name));
        next.definitions.forEach(({ id, data }) => {
            getOrCreateState(levelStates, id).val = next.levels[id];
            getOrCreateState(metadataStates, id, data).val = data;
        });
        reconcileRows(next.definitions.map(({ id }) => id).join("|"), () =>
            next.definitions.map(({ id }) => renderRow(id))
        );
    };

    const load = async () => {
        if (busy.val) return;
        busy.val = true;
        try {
            await runLoad(async () => applySnapshot(await readSnapshot()));
        } finally {
            busy.val = false;
        }
    };

    const checkContext = async (current, target) => {
        if (selected.val !== target) throw new Error(CHARACTER_CHANGED);
        await readCharacterInPlay(current);
    };

    const refreshEffectCache = async (current, target) => {
        await checkContext(current, target);
        await deleteGga("DNSM.h.PrayNonEq");
        const [flag, rawActive] = await Promise.all([gga("DNSM.h.PrayNonEq"), gga("PrayersActive")]);
        await checkContext(current, target);
        const active = toIndexedArray(rawActive);
        if (active.length !== 12)
            throw new Error("Prayer effect cache verification could not read all equipment slots.");
        const expected = active.every((id) => Number(id) === -1) ? 1 : 0;
        if (flag !== null && flag !== undefined && Number(flag) !== expected) {
            throw new Error("Prayer effect cache did not refresh to match the current equipment.");
        }
    };

    // `ask(question, plan)`: the in-place confirm (#77) for a plan with a confirmation; true goes ahead. `target`: the
    // character the change is for; once another is picked, it refuses.
    const execute = async (buildPlan, ask, target = selected.val) => {
        if (unavailable()) throw new Error("Prayers are busy or unavailable. Refresh and try again.");
        busy.val = true;
        message.val = "";
        let attempted = 0;
        let verified = 0;
        let touchedLive = false;
        let initial = null;
        try {
            if (selected.val !== target) throw new Error(CHARACTER_CHANGED);
            initial = await readSnapshot();
            if (initial.current !== snapshot.val.current) {
                throw new Error(CHARACTER_CHANGED);
            }
            let plan = buildPlan(initial);
            if (plan.cancelled) {
                return { cancelled: true };
            }
            if (!plan.equipment.length && !plan.levels.length && !plan.confirmation) {
                return { value: plan.value };
            }
            if (plan.confirmation) {
                if (!ask(plan.confirmation, plan)) return { cancelled: true };
                const fresh = await readSnapshot();
                const refreshed = buildPlan(fresh);
                if (fresh.current !== initial.current || JSON.stringify(refreshed) !== JSON.stringify(plan)) {
                    throw new Error("The confirmed targets changed. Refresh and confirm again.");
                }
                plan = refreshed;
            }
            const writeBatch = async (writes) => {
                if (!writes.length) return;
                await checkContext(initial.current, target);
                attempted += writes.length;
                touchedLive = touchedLive || writes.some((write) => write.path.startsWith("PrayersActive["));
                try {
                    if (writes.length === 1) await writeVerified(writes[0].path, writes[0].value);
                    else await writeManyVerified(writes);
                    verified += writes.length;
                } catch (caught) {
                    if (caught.results) verified += caught.results.filter((result) => result.ok).length;
                    throw caught;
                }
                await checkContext(initial.current, target);
            };
            // Equipment cleanup must verify before an account-wide level is locked.
            await writeBatch(plan.equipment);
            if (touchedLive) {
                await refreshEffectCache(initial.current, target);
                touchedLive = false;
            }
            await writeBatch(plan.levels);
            applySnapshot(await readSnapshot());
            return { value: plan.value };
        } catch (caught) {
            // Asking again happens beside the field, before anything was written.
            if (caught.askAgain) throw caught;
            message.val = attempted
                ? `Operation incomplete: ${verified}/${attempted} attempted writes verified. Some changes may have applied. ${caught.message}`
                : caught.message;
            if (touchedLive) {
                try {
                    await refreshEffectCache(initial.current, target);
                } catch (cacheError) {
                    message.val += ` Prayer effect cache refresh failed: ${cacheError.message}`;
                }
            }
            await runLoad(async () => applySnapshot(await readSnapshot()));
            throw caught;
        } finally {
            busy.val = false;
        }
    };

    // Locking a prayer (level 0) asks in place (#77): the first 0 is refused beside the field with what it
    // would do, and Enter on 0 again within a few seconds does it.
    const lockAsks = new Map();
    const askAtLevel = (id) => {
        if (!lockAsks.has(id)) {
            const label = `${cleanName(getOrCreateState(metadataStates, id).val[0])} level`;
            const field = () =>
                [...document.querySelectorAll("input[aria-label]")].find(
                    (input) => input.getAttribute("aria-label") === label
                );
            lockAsks.set(id, askAtField(field));
        }
        return lockAsks.get(id);
    };

    const setLevel = async (id, next) => {
        const result = await execute((state) => levelPlan(state, id, next), askAtLevel(id));
        return result.cancelled ? result : result.value;
    };

    const toggleEquipment = (id, wasEquipped) =>
        execute((state) => {
            const player = state.players.find((entry) => entry.name === selected.val);
            if (!player) throw new Error("Selected character no longer exists.");
            const equipped = player.prayers.includes(id);
            if (equipped !== wasEquipped) throw new Error("Equipment changed. Refresh and try again.");
            if (equipped) return { equipment: equipmentPlan(state, player, [id]), levels: [] };
            if (!(state.levels[id] > 0)) throw new Error("Unlock this prayer before equipping it.");
            if (player.prayers.filter((val) => val !== -1).length >= state.capacity) {
                throw new Error("No usable prayer slots remain.");
            }
            const slot = player.prayers.indexOf(-1);
            if (slot === -1) throw new Error("No usable prayer slots remain.");
            const equipment = [{ path: savedPath(player.name, slot), value: id }];
            if (player.name === state.current) equipment.push({ path: `PrayersActive[${slot}]`, value: id });
            return { equipment, levels: [] };
        });

    // `only`: the prayers the search showed when the tool was pressed. Unequip was asked in the tray already, about
    // `asked`: it unequips that character's prayers, and refuses once another is picked.
    const bulk = async (mode, only, asked = selected.val) => {
        if (unavailable()) return;
        await bulkStatus.run(() =>
            execute(
                (state) => {
                    if (mode === "unequip") {
                        const player = state.players.find((entry) => entry.name === asked);
                        if (!player) throw new Error("Selected character no longer exists.");
                        const ids = state.definitions
                            .map((entry) => entry.id)
                            .filter((id) => only.includes(id) && player.prayers.includes(id));
                        if (!ids.length) return { equipment: [], levels: [], cancelled: true };
                        return {
                            equipment: equipmentPlan(state, player, ids),
                            levels: [],
                            confirmation: `unequip ${ids.length} from ${player.name}`,
                        };
                    }
                    const levels = state.definitions
                        .filter(({ id }) => only.includes(id))
                        .filter(({ id, data }) =>
                            mode === "unlock" ? state.levels[id] === 0 : state.levels[id] !== Number(data[9])
                        )
                        .map(({ id, data }) => ({
                            path: `PrayersUnlocked[${id}]`,
                            value: mode === "unlock" ? 1 : Number(data[9]),
                        }));
                    if (!levels.length) return { equipment: [], levels: [], cancelled: true };
                    // Unlock and Max all run on one click (#25). Max brings a prayer above its cap down to it: that
                    // is what Max means (Lumi, 2026-11-20), and Undo puts it back.
                    return { equipment: [], levels, confirmation: null };
                },
                () => true,
                asked
            )
        );
    };

    const renderRow = (id) => {
        const level = getOrCreateState(levelStates, id);
        const metadata = getOrCreateState(metadataStates, id);
        const equipmentStatus = useWriteStatus();
        const isEquipped = () =>
            Boolean(snapshot.val?.players.find((player) => player.name === selected.val)?.prayers.includes(id));
        const row = EditableNumberRow({
            valueState: level,
            normalize: (raw) => resolveNumberInput(raw, { min: 0, max: Number(metadata.val[9]) }),
            write: (next) => setLevel(id, next),
            // Not while a save runs: the field keeps focus, and `execute` refuses a save that overlaps.
            disabled: () => loading.val || Boolean(error.val) || !snapshot.val,
            rowClass: "prayer-row",
            inputProps: { "aria-label": `${cleanName(metadata.val[0])} level` },
            maxAction: { label: "Max", value: () => Number(metadata.val[9]) },
            // The bonus first, then the name and the curse it brings, in the game's words.
            renderInfo: () =>
                span(
                    { class: "prayer-row__titles" },
                    RowTitles({ bonus: () => bonusText(metadata.val[1]), name: () => cleanName(metadata.val[0]) }),
                    span({ class: "prayer-row__curse" }, () => `Curse: ${bonusText(metadata.val[2])}`)
                ),
            cap: () => Number(metadata.val[9]),
            renderBadge: () => (level.val === 0 ? "Locked" : isEquipped() ? "Equipped" : ""),
            renderExtraActions: () =>
                ActionButton({
                    label: () => (isEquipped() ? "Unequip" : "Equip"),
                    status: equipmentStatus.status,
                    className: "prayer-row__equip-btn",
                    disabled: () => unavailable() || (!isEquipped() && level.val === 0),
                    onClick: () => {
                        if (unavailable()) return;
                        const wasEquipped = isEquipped();
                        void equipmentStatus.run(() => toggleEquipment(id, wasEquipped));
                    },
                }),
        });
        rowOf.set(id, row);
        return row;
    };

    const selectedPlayer = () => snapshot.val?.players.find((entry) => entry.name === selected.val);
    const prayerWord = (n) => `prayer${n === 1 ? "" : "s"}`;
    // The shown prayers the picked character has on.
    const equippedShown = () => shownIds().filter((id) => selectedPlayer()?.prayers.includes(id));

    // Unlock and Max all only raise (Max brings a level above its cap down to it: that is what Max means, Lumi
    // 2026-11-20, and Undo puts it back), so they run on one press. Unequip takes prayers off, so it asks first.
    const tools = (_activeId, ask) => {
        const unequipAll = ActionButton({
            label: "Unequip all",
            status: bulkStatus.status,
            variant: "danger",
            disabled: () => unavailable() || !equippedShown().length,
            onClick: (e) => {
                e.preventDefault();
                const ids = equippedShown();
                const asked = selected.val;
                ask({
                    question: `Unequip ${ids.length} ${prayerWord(ids.length)} from ${asked}?`,
                    confirmLabel: ids.length === 1 ? "Unequip it" : "Unequip them",
                    from: unequipAll,
                    onConfirm: () => bulk("unequip", ids, asked),
                });
            },
        });
        const raise = (label, mode) =>
            ActionButton({
                label,
                status: bulkStatus.status,
                disabled: () => unavailable() || !shownIds().length,
                onClick: (e) => {
                    e.preventDefault();
                    return bulk(mode, shownIds());
                },
            });
        return [
            div({ class: "tabbed-list__tool-group" }, raise("Unlock all", "unlock"), raise("Max all", "max")),
            div({ class: "tabbed-list__tool-group" }, unequipAll),
        ];
    };

    // What the picked character's slots hold, and what Gaming gives with them all empty.
    const slotsLine = () => {
        const player = selectedPlayer();
        if (!player) return "";
        const used = `${player.prayers.filter((id) => id !== -1).length} / ${snapshot.val.capacity} slots used`;
        if (!snapshot.val.gamingPercent) return used;
        const gaming = `${snapshot.val.gamingPercent}% of owned bonuses and no curses`;
        return player.prayers.every((id) => id === -1)
            ? `${used}. Gaming gives ${gaming}.`
            : `${used}. With every slot empty, Gaming gives ${gaming}.`;
    };

    void load();
    return PersistentAccountListPage({
        title: "Prayers",
        rootClass: "tab-container scroll-container prayers-page",
        description: "Prayer levels and each character's prayers. Level 0 unequips a prayer everywhere first.",
        actions: RefreshButton({ onRefresh: load, disabled: () => busy.val || loading.val }),
        toolbar: characterSelector.node,
        state: { loading, error },
        body: div(
            { class: "account-list account-list--tabbed" },
            div({ class: "write-status", role: "status", "aria-live": "polite", hidden: () => !message.val }, message),
            ListPanel({
                body: rows,
                tools,
                toolsLabel: () => {
                    const n = shownIds().length;
                    return isSearching() ? `${n} matching ${prayerWord(n)}` : `All ${n} ${prayerWord(n)}`;
                },
            })
        ),
        initialWrapperClass: "account-list",
        loadingText: "Reading prayers",
        errorTitle: "Couldn't read prayers",
    });
};

export default definePage({
    id: "w3.prayers",
    world: 3,
    system: "Prayers",
    description: "Prayer levels and the prayers each character has equipped.",
    keywords: ["Curses"],
    component: PrayersTab,
});
