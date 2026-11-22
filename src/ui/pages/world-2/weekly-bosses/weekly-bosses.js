import van from "../../../vendor/van-1.6.0.js";
import { CappedValue } from "../../../components/NumberInput.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    oneAtATime,
    resolveNumberInput,
    unwrapH,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { captureGesture } from "../../../services/changeLog.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span, select, option } = van.tags;

/**
 * Edit Weekly Boss trophies, cosmetic unlocks and each character's main-bar skin. One list: the trophies, the skins,
 * then the characters. Unlock all and Lock all (asks) in the tray act on the skins the top bar's search shows.
 */
const WeeklyBossTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Weekly Boss" });
    const busy = van.state(false);
    const message = van.state("");
    const trophies = van.state(0);
    const best = van.state(0);
    const activePlayer = van.state(null);
    const bulk = useWriteStatus();
    const skinStates = new Map();
    const playerStates = new Map();
    const skinList = div({ class: "account-page-pane" });
    const playerList = div({ class: "account-page-pane" });
    const reconcileSkins = createStaticRowReconciler(skinList);
    const reconcilePlayers = createStaticRowReconciler(playerList);
    let cachedCatalog = null;
    // The skins, kept as a state too, so the tray's line and tools follow a load.
    let entries = [];
    const entriesRead = van.state(0);
    let players = [];
    let signature = null;

    const isBusy = () => loading.val || busy.val;
    const cannotWrite = () => isBusy() || Boolean(error.val) || signature === null;
    // Fields stay usable while a save runs, so a save never takes their focus away.
    const cannotEdit = () => loading.val || Boolean(error.val) || signature === null;
    const playerKey = ({ index, name }) => `${index}:${name}`;

    const readSnapshot = async (options = {}) => {
        const needsCatalog = !cachedCatalog || Boolean(options.reloadCatalog);
        const [rawShop, rawLetters, rawWeekly, rawPlayers, trophyValue, bestValue, active] = await Promise.all([
            needsCatalog ? readCList("WeeklySHOP[0]") : null,
            needsCatalog ? gga("Number2Letter") : null,
            gga("WeeklyBoss"),
            gga("GetPlayersUsernames"),
            gga("OptionsListAccount[188]"),
            gga("OptionsListAccount[189]"),
            gga("UserInfo[0]").catch(() => null),
        ]);
        let skins = cachedCatalog;
        if (needsCatalog) {
            const rawCatalog = unwrapH(rawShop);
            const rawLettersUnwrapped = unwrapH(rawLetters);
            const letters = toIndexedArray(rawLettersUnwrapped);
            if (!rawCatalog || typeof rawCatalog !== "object" || !letters.length) {
                throw new Error("Weekly Boss data is unavailable. Refresh to try again.");
            }
            const shopEntries = Object.keys(rawCatalog)
                .map((key) => ({ shopIndex: Number(key), raw: rawCatalog[key] }))
                .filter(({ shopIndex, raw }) => Number.isInteger(shopIndex) && shopIndex >= 0 && raw)
                .sort((a, b) => a.shopIndex - b.shopIndex);

            if (!shopEntries.length) {
                throw new Error("Weekly Boss data is unavailable. Refresh to try again.");
            }
            skins = shopEntries.map(({ shopIndex, raw }) => {
                const definition = toIndexedArray(unwrapH(raw));
                const letter = letters[shopIndex + 1];
                const cost = Number(definition[1]);
                if (
                    definition.length < 4 ||
                    typeof definition[0] !== "string" ||
                    !definition[0] ||
                    typeof letter !== "string" ||
                    !/^[A-Za-z0-9_]+$/.test(letter) ||
                    !Number.isFinite(cost) ||
                    cost < 0
                ) {
                    throw new Error("Weekly Boss skin definitions changed or are invalid. Refresh to try again.");
                }
                return {
                    selection: shopIndex + 1,
                    key: `UI_${letter}`,
                    name: cleanName(definition[0]),
                    cost,
                    description: definition[3] === "filler" ? "" : cleanName(definition[3]),
                };
            });
            if (new Set(skins.map(({ key }) => key)).size !== skins.length) {
                throw new Error("Weekly Boss skin keys are ambiguous. Refresh to try again.");
            }
            cachedCatalog = skins;
        }
        const weekly = unwrapH(rawWeekly);
        const playersMap = unwrapH(rawPlayers);
        if (!weekly || typeof weekly !== "object" || !playersMap || typeof playersMap !== "object") {
            throw new Error("Weekly Boss data is unavailable. Refresh to try again.");
        }
        for (const skin of skins) {
            if (
                weekly[skin.key] !== undefined &&
                weekly[skin.key] !== null &&
                ![0, 1].includes(Number(weekly[skin.key]))
            ) {
                throw new Error(`Invalid unlock value for ${skin.name}.`);
            }
        }
        const roster = Object.keys(playersMap)
            .map((key) => ({ index: Number(key), name: playersMap[key] }))
            .filter(
                ({ index, name }) =>
                    Number.isInteger(index) &&
                    index >= 0 &&
                    typeof name === "string" &&
                    name.trim().length > 0 &&
                    !name.startsWith("__")
            )
            .sort((a, b) => a.index - b.index);
        if (
            trophyValue === null ||
            trophyValue === undefined ||
            bestValue === null ||
            bestValue === undefined ||
            !Number.isInteger(Number(trophyValue)) ||
            Number(trophyValue) < 0 ||
            !Number.isFinite(Number(bestValue))
        ) {
            throw new Error("Weekly Boss trophy, progress or character data is invalid. Refresh to try again.");
        }
        return {
            entries: skins,
            players: roster,
            weekly,
            trophies: Number(trophyValue),
            best: Number(bestValue),
            active,
            signature: JSON.stringify([skins, roster]),
        };
    };

    const syncSnapshot = (snapshot, { resetDrafts = false } = {}) => {
        trophies.val = snapshot.trophies;
        best.val = snapshot.best;
        activePlayer.val = snapshot.active;
        for (const entry of snapshot.entries) {
            if (!skinStates.has(entry.key)) {
                skinStates.set(entry.key, { unlocked: van.state(false), write: useWriteStatus() });
            }
            skinStates.get(entry.key).unlocked.val = Number(snapshot.weekly[entry.key]) === 1;
        }
        for (const player of snapshot.players) {
            const key = playerKey(player);
            const value = String(snapshot.weekly[`set${player.index}`] ?? 0);
            if (!playerStates.has(key)) {
                const state = { value: van.state(value), draft: van.state(value) };
                // Picking a skin saves it.
                state.write = useAutoSave({
                    prepare: () =>
                        state.draft.val === state.value.val ? { unchanged: true } : { write: () => savePlayer(player) },
                    revert: () => (state.draft.val = state.value.val),
                });
                playerStates.set(key, state);
            } else {
                const state = playerStates.get(key);
                // A pick made since the save running now (or waiting its turn) is the player's, even when it equals
                // what was stored; the pick being saved follows the game.
                const newerPick = state.write.isBusy() && state.draft.val !== state.saving;
                if (!newerPick && (resetDrafts || state.draft.val === state.value.val)) state.draft.val = value;
                state.value.val = value;
            }
        }
    };

    const readFresh = async () => {
        const snapshot = await readSnapshot();
        if (snapshot.signature !== signature) {
            throw new Error("Skin definitions or the character roster changed. Refresh before editing.");
        }
        syncSnapshot(snapshot);
        return snapshot;
    };

    const submitWrites = async (writes) => {
        if (!writes.length) return;
        try {
            if (writes.length === 1) await writeVerified(writes[0].path, writes[0].value);
            else await writeManyVerified(writes);
        } catch (caughtError) {
            try {
                await readFresh();
            } catch {
                // Ignore read failure during write error recovery.
            }
            if (writes.length === 1) throw caughtError;

            const results = caughtError.results || [];
            let verified = 0;
            let failed = 0;
            for (const write of writes) {
                const result = results.find((entry) => entry?.path?.replace(/^gga\./, "") === write.path);
                if (result?.ok) verified++;
                else if (result?.ok === false) failed++;
                if (write.key) {
                    const state = skinStates.get(write.key);
                    if (result?.ok) state.unlocked.val = write.value === 1;
                }
            }
            throw new Error(
                `${verified} verified, ${failed} write or verification failures, ` +
                    `${writes.length - verified - failed} without results. ` +
                    `Some changes may have applied. ${caughtError.message}`
            );
        }
        for (const write of writes) {
            if (write.key) {
                const state = skinStates.get(write.key);
                state.unlocked.val = write.value === 1;
            } else if (write.player) {
                const state = playerStates.get(playerKey(write.player));
                // The draft is the player's newest pick, which may have changed while this saved: it saves next.
                state.value.val = String(write.value);
            } else if (write.path === "OptionsListAccount[188]") {
                trophies.val = write.value;
            }
        }
        try {
            await readFresh();
        } catch (caughtError) {
            message.val = `Saved and verified, but refresh failed. ${caughtError.message}`;
        }
    };

    // A switch flipped (or a pick made) while another write runs waits its turn and reads the game again then, so it
    // isn't lost.
    const inTurn = oneAtATime();

    // Returns the row's save outcome, so the switch can say why a save failed. inTurn orders it after any save
    // running, so only a page that can't be written (loading, failed read) refuses it, and the switch says so.
    const setSkin = (entry, enabled) =>
        inTurn(async () => {
            if (cannotEdit()) throw new Error("refresh first");
            busy.val = true;
            message.val = "";
            try {
                return await skinStates.get(entry.key).write.run(
                    async () => {
                        const snapshot = await readFresh();
                        if ((Number(snapshot.weekly[entry.key]) === 1) === enabled) return { cancelled: true };
                        await submitWrites([
                            { key: entry.key, path: `WeeklyBoss.h.${entry.key}`, value: enabled ? 1 : 0 },
                        ]);
                    }
                    // The switch says why a row's save failed.
                );
            } finally {
                busy.val = false;
            }
        });

    // The skins the tools act on: every one, or the ones the top bar's search shows.
    const skinRows = new Map();
    const shownSkins = () => (entriesRead.val, entries.filter(({ key }) => shownBySearch(skinRows.get(key))));

    // Writes the skins asked about, once the game still holds what it held when they were picked.
    const writeSkins = (enabled, targets, inGesture) =>
        inTurn(async () => {
            if (cannotEdit()) return;
            busy.val = true;
            message.val = "";
            try {
                await inGesture(() =>
                    bulk.run(
                        async () => {
                            const fresh = await readFresh();
                            const currentTargets = entries.filter(
                                ({ key }) =>
                                    targets.some((target) => target.key === key) &&
                                    (Number(fresh.weekly[key]) === 1) !== enabled
                            );
                            if (
                                currentTargets.length !== targets.length ||
                                currentTargets.some(({ key }, index) => key !== targets[index].key)
                            ) {
                                throw new Error("Skins changed in the game. Look them over and try again.");
                            }
                            await submitWrites(
                                currentTargets.map(({ key }) => ({
                                    key,
                                    path: `WeeklyBoss.h.${key}`,
                                    value: enabled ? 1 : 0,
                                }))
                            );
                        },
                        { onError: (caughtError) => (message.val = caughtError.message) }
                    )
                );
            } catch (caughtError) {
                message.val = caughtError.message;
            } finally {
                busy.val = false;
            }
        });

    // `button`: the tool pressed. Unlocking adds, so it runs on one press; locking takes away, so it asks in the tray.
    // `shown`: the skins the search showed at the press; a search typed while it waits or reads doesn't change them.
    const setAll = (enabled, button, ask, shown = shownSkins()) =>
        inTurn(async () => {
            if (cannotEdit()) return;
            // The bulk action starts after a read: keep the button's press, so it's named after and offers Undo all
            // beside the button even if something else was clicked meanwhile.
            const inGesture = captureGesture();
            busy.val = true;
            message.val = "";
            let targets;
            try {
                const snapshot = await readFresh();
                targets = shown.filter(({ key }) => (Number(snapshot.weekly[key]) === 1) !== enabled);
            } catch (caughtError) {
                message.val = caughtError.message;
                return;
            } finally {
                busy.val = false;
            }
            if (!targets.length) return;
            // Not awaited: it takes its turn after this one. The press waits for it outside this turn (see Unlock all).
            if (enabled) return { written: writeSkins(true, targets, inGesture) };
            const n = targets.length;
            ask({
                question: `Lock ${n} skin${n === 1 ? "" : "s"}?`,
                confirmLabel: n === 1 ? "Lock it" : "Lock them",
                from: button,
                // The tray names the change after the button that asked.
                onConfirm: () => writeSkins(false, targets, (task) => task()),
            });
        });

    // Returns { cancelled: true } when the game already has the pick; throws when it can't save.
    const savePlayer = (player) =>
        inTurn(async () => {
            if (cannotEdit()) return { cancelled: true };
            const state = playerStates.get(playerKey(player));
            const draft = state.draft.val;
            state.saving = draft;
            busy.val = true;
            message.val = "";
            try {
                const snapshot = await readFresh();
                const current = String(snapshot.weekly[`set${player.index}`] ?? 0);
                if (
                    draft === current &&
                    snapshot.weekly[`set${player.index}`] !== undefined &&
                    snapshot.weekly[`set${player.index}`] !== null
                )
                    return { cancelled: true };
                const entry = entries.find(({ selection }) => String(selection) === draft);
                if (draft !== "0" && (!entry || Number(snapshot.weekly[entry.key]) !== 1)) {
                    throw new Error("pick Default or an unlocked skin");
                }
                await submitWrites([{ player, path: `WeeklyBoss.h.set${player.index}`, value: Number(draft) }]);
            } catch (caughtError) {
                message.val = caughtError.message;
                throw caughtError;
            } finally {
                state.saving = undefined; // no pick is saving now: one queued since is the player's
                busy.val = false;
            }
        });

    const renderSkin = (entry) => {
        const state = skinStates.get(entry.key);
        return AccountRow({
            status: state.write.status,
            // The skin, and its price in the shop under it (the switch unlocks it without spending trophies).
            info: span(
                { class: "account-row__titles" },
                span({ class: "account-row__bonus" }, entry.name),
                span({ class: "account-row__name" }, `${entry.cost} trophies`),
                entry.description ? span({ class: "account-row__name" }, entry.description) : null
            ),
            controls: StateSwitch({
                checked: () => state.unlocked.val,
                // Only an unlocked skin says so; the switch already shows the rest are locked.
                words: ["Unlocked", ""],
                name: entry.name,
                disabled: () => loading.val || Boolean(error.val) || signature === null,
                status: state.write.status, // nothing else on the row reads out saving and saved
                onFlip: (unlocked) => setSkin(entry, unlocked),
            }),
        });
    };

    const renderPlayer = (player) => {
        const state = playerStates.get(playerKey(player));
        const hasUnknownSelection = () =>
            state.value.val !== "0" && !entries.some(({ selection }) => String(selection) === state.value.val);
        const selectionNode = select(
            {
                class: "select-base",
                "aria-label": `${player.name} main-bar skin`,
                disabled: cannotEdit,
                onchange: (event) => {
                    state.draft.val = event.target.value;
                    void state.write.save();
                },
            },
            option({ value: "0", selected: () => state.draft.val === "0" }, "Default"),
            ...entries.map((entry) =>
                option(
                    {
                        value: String(entry.selection),
                        selected: () => state.draft.val === String(entry.selection),
                        disabled: () =>
                            !skinStates.get(entry.key).unlocked.val && state.value.val !== String(entry.selection),
                    },
                    entry.name
                )
            ),
            option(
                {
                    value: () => (hasUnknownSelection() ? state.value.val : "__unknown__"),
                    selected: () => hasUnknownSelection() && state.draft.val === state.value.val,
                    hidden: () => !hasUnknownSelection(),
                    disabled: () => !hasUnknownSelection(),
                },
                () => `Unknown selection ${state.value.val}`
            )
        );
        const getPlayerWarning = () => {
            if (state.value.val === "0") return "";
            const entry = entries.find(({ selection }) => String(selection) === state.value.val);
            return !entry
                ? `Saved selection ${state.value.val} is unknown.`
                : !skinStates.get(entry.key).unlocked.val
                  ? `Saved skin ${entry.name} is locked.`
                  : "";
        };
        return AccountRow({
            rowClass: () => saveStateClass(state.write.status.val, state.write.undo),
            rowProps: state.write.handlers,
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, player.name),
                span(
                    {
                        class: () => `write-status write-status--error${getPlayerWarning() ? "" : " hidden"}`,
                        role: "status",
                    },
                    getPlayerWarning
                )
            ),
            badge: () => (activePlayer.val === player.name ? "Active" : `Character ${player.index + 1}`),
            controls: [SaveState(state.write), selectionNode],
        });
    };

    const load = () => {
        if (busy.val) return;
        busy.val = true;
        return runLoad(async () => {
            const snapshot = await readSnapshot({ reloadCatalog: true });
            entries = snapshot.entries;
            entriesRead.val++;
            players = snapshot.players;
            signature = snapshot.signature;
            syncSnapshot(snapshot, { resetDrafts: true });
            reconcileSkins(JSON.stringify(entries), () =>
                entries.map((entry) => {
                    const row = renderSkin(entry);
                    skinRows.set(entry.key, row);
                    return row;
                })
            );
            reconcilePlayers(JSON.stringify([entries, players]), () =>
                players.length
                    ? players.map(renderPlayer)
                    : [div({ class: "account-section__note" }, "No characters found on this account.")]
            );
            message.val = "";
        }).finally(() => (busy.val = false));
    };

    const trophyRow = EditableNumberRow({
        valueState: trophies,
        disabled: cannotEdit,
        normalize: (raw) => resolveNumberInput(raw, { min: 0 }),
        adjustInput: (rawValue, delta, currentValue) => {
            const base = Number(rawValue);
            const next = Number.isFinite(base) ? base : Number(currentValue ?? 0);
            return Math.max(0, next + delta);
        },
        // Takes its turn with the skin and character saves, so a switch flipped meanwhile waits instead of being
        // dropped as busy.
        write: (value) =>
            inTurn(async () => {
                if (cannotEdit()) throw new Error("refresh first");
                if (value === trophies.val) return { cancelled: true };
                busy.val = true;
                message.val = "";
                try {
                    await submitWrites([{ path: "OptionsListAccount[188]", value }]);
                    return value;
                } catch (caughtError) {
                    message.val = caughtError.message;
                    throw caughtError;
                } finally {
                    busy.val = false;
                }
            }),
        renderInfo: () => span({ class: "account-row__name" }, "Trophies"),
        inputProps: { "aria-label": "Weekly Boss trophy balance" },
    });

    const skinWord = (n) => `skin${n === 1 ? "" : "s"}`;
    const lockedShown = () => shownSkins().filter(({ key }) => !skinStates.get(key)?.unlocked.val).length;
    const tools = (_activeId, ask) => {
        const lockAll = ActionButton({
            label: "Lock all",
            variant: "danger",
            status: bulk.status,
            disabled: () => cannotWrite() || lockedShown() === shownSkins().length,
            onClick: (e) => {
                e.preventDefault();
                void setAll(false, lockAll, ask);
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Unlock all",
                status: bulk.status,
                disabled: () => cannotWrite() || lockedShown() === 0,
                // The press ends with the write, so the button says how it went.
                onClick: (e) => {
                    e.preventDefault();
                    return setAll(true, e.currentTarget, ask).then((turn) => turn?.written);
                },
            }),
            lockAll
        );
    };

    load();
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Weekly Bosses",
        description: "Trophies, main-bar skins and the skin each character wears.",
        actions: RefreshButton({ onRefresh: load, disabled: isBusy }),
        state: { loading, error },
        loadingText: "Reading weekly bosses",
        errorTitle: "Couldn't read weekly bosses",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    div(
                        {
                            class: () => `write-status write-status--error${message.val ? "" : " hidden"}`,
                            role: "alert",
                        },
                        () => message.val
                    ),
                    AccountSection({
                        title: "Progress",
                        body: [
                            trophyRow,
                            AccountRow({
                                info: span({ class: "account-row__name" }, "Best stage this week"),
                                controls: CappedValue({ value: () => best.val, cap: 5 }),
                            }),
                        ],
                    }),
                    AccountSection({ title: "Skins", body: skinList }),
                    AccountSection({
                        title: "Characters",
                        note: "Change maps in game to see a new skin.",
                        body: playerList,
                    }),
                ],
                tools,
                toolsLabel: () => {
                    const n = shownSkins().length;
                    return isSearching() ? `${n} matching ${skinWord(n)}` : `All ${n} ${skinWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w2.weeklybosses",
    world: 2,
    system: "Weekly Bosses",
    description: "Weekly Boss trophies, cosmetic unlocks and each character's main-bar skin.",
    keywords: ["Weekly Boss"],
    component: WeeklyBossTab,
});
