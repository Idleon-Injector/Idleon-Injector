/**
 * Account - Player: Attire Rack (#89, ported from VoidKitten's #3)
 *
 * Two tabs. Outfit bonuses: a line per outfit, its bonus first, with a switch that gives it as if worn. The choice is
 * cheatConfig.wide.attire.outfits ("all" once every outfit is on, so outfits a game update adds count too), saved to
 * config.custom.js and the session on each click, as the Pets page saves its pets. `wide attire` is on,
 * now and at every start (a startup cheat), while any outfit is chosen. As on Pets, the cards show the saved choice
 * even while the cheat is off, and a flip edits that choice. All on and All off sit in the tray; All off asks there.
 *
 * Appearance: the attire each character wears, slot 15 of its first equipment row (EquipmentOrder, EquipmentQuantity
 * and EquipmentMap), on the live copy of the character in play and on its PlayerDATABASE copy. Each change is one
 * saved action Undo can put back. A character's attire is picked in place under its line; Give everyone is a pick in the
 * tray that asks there before it replaces what everyone wears. After a change of the character in play, and after any undo of a change made here,
 * the game works out that character's stats again (the `wide attirestats` command).
 *
 * Reads: readComputed("attire", "status") (the outfits and each character's attire), the config and the cheat states.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import {
    executeCheatAction,
    fetchCheatStates,
    fetchConfig,
    readComputed,
    saveConfigPart,
    startupWith,
} from "../../../services/api.js";
import { currentPlace, reloadPlace } from "../../../services/changeLog.js";
import { useSaid } from "../../../components/inPlace.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    createStaticRowReconciler,
    normalCase,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { TabbedList, toolsPerTab } from "../../../components/views/account/tabShared.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div } = van.tags;

// The attire slot, relative to a character's live copy (the top-level keys) or its PlayerDATABASE entry.
const ORDER_PATH = "EquipmentOrder[0][15]";
const QUANTITY_PATH = "EquipmentQuantity[0][15]";
const MAP_PATH = "EquipmentMap[0][15].h";
// The path resolver splits names at dots and brackets, so such a character's entry can't be addressed.
const ADDRESSABLE = /^[^.[\]]+$/;
const NO_ATTIRE = "Blank";
const ATTIRE_CHEAT = "wide attire";
const STATS_CHEAT = "wide attirestats";

const words = (key) => String(key).replace(/_/g, " ");
// An outfit's bonus in normal case, as the game names it: "%_DROP_RATE" is "+2% Drop Rate" (EXP stays EXP).
const bonusLine = ({ key, value }) => {
    const percent = String(key).startsWith("%");
    return `+${value}${percent ? "%" : ""} ${normalCase(String(key).replace(/^%_?/, ""))}`;
};
const statLine = (outfit) =>
    Object.entries(outfit.stats)
        .filter(([, value]) => value)
        .map(([key, value]) => `+${value} ${words(key)}`)
        .join(" · ");

/** The writes that put `item` in a character's attire slot: its live copy while in play, and its saved copy. */
// Only the copies that don't hold `item` yet: after a write that landed in part, the copy that has it keeps its upgrades
// (an undo may have put them back) and the other one is written.
const slotWrites = (character, item) =>
    [
        character.active && character.item !== item ? "" : null,
        character.saved && character.savedItem !== item ? `PlayerDATABASE.h[${character.name}].h.` : null,
    ]
        .filter((root) => root !== null)
        .flatMap((root) => [
            { path: `${root}${ORDER_PATH}`, value: item },
            { path: `${root}${QUANTITY_PATH}`, value: item === NO_ATTIRE ? 0 : 1 },
            // The old attire's upgrades don't belong to the new one.
            { path: `${root}${MAP_PATH}`, value: {} },
        ]);

const changeable = (character) => character.available && ADDRESSABLE.test(character.name);

const AttireRackPage = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Attire Rack" });
    const choiceWrite = useWriteStatus();
    // The switches' own saves, so their result doesn't light up All on or All off.
    const cardWrite = useWriteStatus();
    const choiceSaving = () => choiceWrite.status.val === "loading" || cardWrite.status.val === "loading";
    const bulkWrite = useWriteStatus();
    const choiceSaid = useSaid();
    const bulkSaid = useSaid();
    const outfits = van.state([]);
    const chosen = van.state(new Set());
    const allChosen = van.state(false);
    const enabled = van.state(false);
    const current = van.state("");
    // Character name -> { character, item, draft, write }.
    const rowStates = new Map();
    // Busy while an outfit choice saves, so assistive technology hears the list is updating.
    const cards = div({ class: "account-page-pane", "aria-busy": () => choiceSaving() });
    const rows = div({ class: "account-page-pane" });
    const reconcileCards = createStaticRowReconciler(cards);
    const reconcileRows = createStaticRowReconciler(rows);

    const busy = () => loading.val || choiceSaving() || bulkWrite.status.val === "loading";
    const isChosen = (id) => chosen.val.has(id);
    const wornNow = () => rowStates.get(current.val)?.item.val;

    // --- Outfit bonuses ---

    // A choice saved since this read began is newer than what it read: the read drops its answer.
    let choiceSaves = 0;
    // The outfits a config gives: "all", or the known ids of its comma-separated list.
    const chosenIn = (config) => {
        const saved = config?.cheatConfig?.wide?.attire?.outfits ?? "all";
        const ids = outfits.val.map(({ id }) => id);
        if (saved === "all") return new Set(ids);
        return new Set(
            String(saved)
                .split(",")
                .map((id) => id.trim())
                .filter((id) => ids.includes(id))
        );
    };
    // Of two reads with no save between them (the read after a failed save, then a Refresh), the newer one wins.
    let choiceReads = 0;
    let shownChoice = 0;
    const readChoice = async (read = fetchConfig()) => {
        const saves = choiceSaves;
        const mine = ++choiceReads;
        const [config, cheatStates] = await Promise.all([read, fetchCheatStates()]);
        if (saves !== choiceSaves || mine < shownChoice) return;
        shownChoice = mine;
        enabled.val = Boolean(cheatStates?.data?.wide?.attire);
        allChosen.val = (config?.cheatConfig?.wide?.attire?.outfits ?? "all") === "all";
        chosen.val = chosenIn(config);
    };

    // `next(chosen)`: the outfits to give, from the saved choice. Built after a fresh read, so a choice saved from the
    // Config page meanwhile isn't overwritten. `write`: the status it runs under (the cards have their own).
    const writeChoice = (next, write = choiceWrite) =>
        write.run(
            async () => {
                choiceSaid.clear();
                await readChoice();
                const ids = outfits.val.map(({ id }) => id);
                let value;
                // Chosen outfits also turn the cheat on at every start; none takes it off that list.
                const { result, config } = await saveConfigPart((now) => {
                    // From the config as it is in the save's turn, so a choice saved meanwhile isn't overwritten.
                    const wanted = next(chosenIn(now));
                    value =
                        ids.length && ids.every((id) => wanted.has(id))
                            ? "all"
                            : ids.filter((id) => wanted.has(id)).join(",");
                    return {
                        cheatConfig: { wide: { attire: { outfits: value } } },
                        startupCheats: startupWith(now.startupCheats, ATTIRE_CHEAT, value !== ""),
                    };
                });
                if (result.message.includes("kept its old settings")) throw new Error(result.message);
                await executeCheatAction(ATTIRE_CHEAT, value !== "");
                choiceSaves++;
                await readChoice(config);
            },
            {
                // Part of it may have landed (the session took the choice): the cards show what is saved now, and a
                // read started before it (a reload) is older than this one.
                onError: (caught) => {
                    choiceSaid.say("failed", caught.message);
                    choiceSaves++;
                    void readChoice().catch(() => {});
                },
            }
        );

    // All off takes every bonus away, now and at start, so it asks in the tray first.
    const clearChoice = (from, ask) => {
        choiceSaid.clear();
        const n = chosen.val.size;
        return ask({
            question:
                n === outfits.val.length
                    ? "Stop giving every outfit bonus, now and at start?"
                    : `Stop giving ${n} outfit bonus${n === 1 ? "" : "es"}, now and at start?`,
            confirmLabel: n === 1 ? "Turn it off" : "Turn them off",
            from,
            lowers: () => [...chosen.val],
            again: () => clearChoice(from, ask),
            onConfirm: () => writeChoice(() => new Set()),
        });
    };

    // A switch's flip: on gives the outfit's bonus, off stops it, from the choice as it is saved when the save runs.
    const flipOutfit = (id, on) =>
        writeChoice((chosenNow) => {
            if (on) chosenNow.add(id);
            else chosenNow.delete(id);
            return chosenNow;
        }, cardWrite);

    // An outfit: what it gives first (its stats, then its bonuses), its name under it, "Worn" while the character in
    // play wears it, and a switch that gives its bonus as if worn.
    const renderOutfit = (outfit) =>
        AccountRow({
            rowClass: "attire-outfit-row",
            info: RowTitles({
                bonus: [statLine(outfit), ...outfit.bonuses.map(bonusLine)].filter(Boolean).join(" · "),
                name: outfit.name,
            }),
            badge: () => (wornNow() === outfit.id ? "Worn" : ""),
            controls: StateSwitch({
                checked: () => isChosen(outfit.id),
                // No word: the switch alone says on or off (Lumi, as on the Cheats tab).
                words: ["", ""],
                name: `${outfit.name} bonus`,
                disabled: () => loading.val,
                ownStatus: true,
                onFlip: (on) => flipOutfit(outfit.id, on),
            }),
        });

    // What the outfit tray says: how many bonuses are on, or that the cheat giving them is off.
    const choiceLabel = () => {
        const n = outfits.val.length;
        if (!enabled.val && chosen.val.size) return "Off, so the chosen bonuses aren't given. Flip one to give them.";
        const all = `All ${n} outfit${n === 1 ? "" : "s"}`;
        return allChosen.val && n ? `${all} · every bonus on, new outfits too` : `${all} · ${chosen.val.size} on`;
    };

    // --- Appearance ---

    // Shows what the game holds. A pick still saving keeps its draft.
    const show = (status) => {
        current.val = status.current;
        outfits.val = status.outfits;
        for (const character of status.characters) {
            if (!rowStates.has(character.name)) {
                const state = {
                    character: van.state(character),
                    item: van.state(character.item),
                    draft: van.state(character.item),
                };
                state.write = useAutoSave({
                    // A stat update owed for the character in play is a change still to save (it shows the pick).
                    // A failed pick whose other copy still lacks it is also one (the live copy took it, the
                    // saved one didn't). ponytail: only after a failure, so a saved copy the game hasn't caught up
                    // with yet isn't written each time the player leaves the field.
                    prepare: () =>
                        state.draft.val === state.item.val &&
                        !(owed.has(character.name) && state.character.val.active) &&
                        !(state.write.status.val === "error" && slotWrites(state.character.val, state.draft.val).length)
                            ? { unchanged: true }
                            : { write: () => wear(character.name, state.draft.val) },
                    revert: () => (state.draft.val = state.item.val),
                });
                rowStates.set(character.name, state);
            }
            const state = rowStates.get(character.name);
            if (state.draft.val === state.item.val) state.draft.val = character.item;
            state.item.val = character.item;
            state.character.val = character;
        }
        for (const name of rowStates.keys())
            if (!status.characters.some((character) => character.name === name)) rowStates.delete(name);
        const ids = status.outfits.map(({ id }) => id);
        reconcileCards(JSON.stringify(ids), () => status.outfits.map(renderOutfit));
        reconcileRows(JSON.stringify([status.characters.map(({ name }) => name), ids]), () =>
            status.characters.map(({ name }) => renderRow(name))
        );
    };

    // Two row saves can read at once: a read that answers after a newer one was shown is older, so it isn't shown.
    let statusReads = 0;
    let shownRead = 0;
    const readStatus = async () => {
        const mine = ++statusReads;
        const status = await readComputed("attire", "status");
        if (!status || !Array.isArray(status.outfits)) throw new Error("The game didn't send its outfits");
        if (mine > shownRead) {
            shownRead = mine;
            show(status);
        }
        return status;
    };

    // Characters whose attire changed while in play and whose stat update is still to run: it failed, or it runs now,
    // or their write failed after it may have landed. Each one's update runs again from its row, from Give everyone or
    // from Refresh, while it is in play.
    const owed = new Set();
    // Each owed update, and each write that owes one, is newer than the last for its character: an older update that
    // answers late neither clears a newer debt nor says its own failure once a newer update worked.
    let statsRuns = 0;
    const latestRun = new Map();
    const owe = (name) => {
        owed.add(name);
        latestRun.set(name, ++statsRuns);
        return statsRuns;
    };
    // The line a refused stat update left above the rows (after an undo or Give everyone), with the character it was
    // for; it goes once that character's update runs, as does the reason in its row (another failure there, such as a
    // refused undo, stays).
    let owedLine = null;
    const sayOwed = (name, caught) => {
        bulkSaid.say("failed", caught.message);
        owedLine = { name, said: bulkSaid.said.val };
    };
    const updateStats = async (name) => {
        const wasOwed = owed.has(name);
        const run = owe(name);
        try {
            await executeCheatAction(STATS_CHEAT);
        } catch (caught) {
            // A newer update that worked already cleared the debt: this failure is no longer true.
            if (owed.has(name)) throw caught;
            return;
        }
        if (latestRun.get(name) !== run) return;
        owed.delete(name);
        if (owedLine?.name === name) {
            if (bulkSaid.said.val === owedLine.said) bulkSaid.clear();
            owedLine = null;
        }
        const state = rowStates.get(name);
        if (wasOwed && state?.write.status.val === "error" && !slotWrites(state.character.val, state.draft.val).length)
            state.write.cancel();
    };

    // After attire changed: the game works out the stats of the character in play again when that one changed.
    // The game is read again however it ends, so the row and the worn badge show what landed; a read that fails after
    // a change that worked is said, as the page may still show the old attire.
    const afterChange = async (changed) => {
        let failed = null;
        try {
            const inPlay = changed.find((character) => character.active);
            if (inPlay) await updateStats(inPlay.name);
        } catch (caught) {
            failed = caught;
        }
        try {
            await readStatus();
        } catch (caught) {
            failed ??= new Error(`saved, but the page couldn't read the game again: ${caught.message}`);
        }
        if (failed) throw failed;
    };

    // One character's pick, saved at once. Returns { cancelled: true } when the game already has it and no stat
    // update is owed. Only the copies that lack the pick are written, under the character in play when they were
    // planned (#109): the game writes nothing if another one is in play by then, and the refusal says who is.
    const wear = async (name, item) => {
        const status = await readStatus();
        const character = status.characters.find((entry) => entry.name === name);
        if (!character || !changeable(character)) throw new Error("can't change this character here");
        const writes = slotWrites(character, item);
        if (!writes.length) {
            if (!(character.active && owed.has(name))) return { cancelled: true };
            return updateStats(name);
        }
        // A write that failed may have landed in part: the stat update is owed, and the row shows what the game holds.
        await writeManyVerified(writes, { character: status.current }).catch(async (caught) => {
            if (character.active) owe(name);
            await readStatus().catch(() => {});
            throw caught;
        });
        await afterChange([character]);
    };

    // The attire a pick can give: none, or an outfit the game lists.
    const attireChoices = () => [
        { id: NO_ATTIRE, label: "No attire" },
        ...outfits.val.map((outfit) => ({ id: outfit.id, label: outfit.name })),
    ];
    // Attire the outfit list doesn't know (EquipmentGown0, say) is an unlisted outfit, and can't be picked again.
    const attireName = (item) =>
        item === NO_ATTIRE
            ? "No attire"
            : (outfits.val.find((outfit) => outfit.id === item)?.name ?? "Unlisted outfit");

    // A character: its name, the attire it wears under it (the row's title opens the pick, like a chip slot's),
    // "In play" for the one in play. A pick saves at once.
    const renderRow = (name) => {
        const state = rowStates.get(name);
        const pick = PickInPlace({
            name: `Attire for ${name}`,
            look: "row",
            label: () => attireName(state.draft.val),
            // The character names the line; what it wears is the quiet line under it, and why it can't change.
            opener: RowTitles({
                name,
                note: () =>
                    [
                        attireName(state.draft.val),
                        !state.character.val.available
                            ? "No attire slot to change"
                            : !changeable(state.character.val)
                              ? "This name can't be changed from here"
                              : null,
                    ]
                        .filter(Boolean)
                        .join(" · "),
            }),
            options: attireChoices,
            picked: () => state.draft.val,
            onPick: (id) => {
                state.draft.val = id;
                void state.write.save();
            },
            search: true,
            disabled: () => loading.val || !changeable(state.character.val),
            panelClass: "row-detail",
        });
        const row = AccountRow({
            rowClass: () => saveStateClass(state.write.status.val, state.write.undo),
            rowProps: { ...state.write.handlers, "data-change-label": `${name} attire` },
            info: pick.opener,
            badge: () => (state.character.val.active ? "In play" : ""),
            controls: SaveState(state.write),
        });
        row.append(pick.panel);
        return row;
    };

    // Everyone gets one outfit: picked in the tray, then asked about there, since it replaces what they wear.
    const askGiveEveryone = async (item, ask, from) => {
        if (busy()) return;
        bulkSaid.clear();
        let targets;
        let inPlay;
        try {
            const { characters, current } = await readStatus();
            inPlay = current;
            targets = characters.filter((character) => changeable(character) && slotWrites(character, item).length);
        } catch (caught) {
            bulkSaid.say("failed", caught.message);
            return;
        }
        if (!targets.length) {
            if (owed.has(inPlay))
                return bulkWrite.run(() => updateStats(inPlay), { onError: (caught) => sayOwed(inPlay, caught) });
            bulkSaid.say("refused", `Everyone already wears ${attireName(item)}.`);
            return;
        }
        const names = () => targets.map((character) => character.name);
        const n = targets.length;
        ask({
            question: `Give ${n} character${n === 1 ? "" : "s"} ${attireName(item)}? What they wear now isn't stored.`,
            confirmLabel: n === 1 ? "Give it" : "Give them",
            from,
            lowers: names,
            again: () => askGiveEveryone(item, ask, from),
            onConfirm: () => giveEveryone(item, names(), inPlay, () => askGiveEveryone(item, ask, from)),
        });
    };

    // Its failure is said on the tray's line by its own words (bulkSaid), which go once an owed stat update runs (a
    // Refresh, a pick), so it isn't left as the tray tool's failure, which only its next try would clear.
    // The attire is read again on the answer: a character given the outfit meanwhile is left alone, and one more to
    // change than the question named, another character in play, or no one left to change goes back to the question.
    const giveEveryone = async (item, asked, inPlay, askAgain) => {
        let wrote = false;
        let again = false;
        const result = await bulkWrite.run(async () => {
            try {
                const { characters, current } = await readStatus();
                const targets = characters.filter(
                    (character) => changeable(character) && slotWrites(character, item).length
                );
                if (
                    current !== inPlay ||
                    !targets.length ||
                    targets.some((character) => !asked.includes(character.name))
                ) {
                    again = true;
                    return { cancelled: true };
                }
                await writeManyVerified(
                    targets.flatMap((character) => slotWrites(character, item)),
                    { character: inPlay }
                ).catch((caught) => {
                    if (targets.some((character) => character.active)) owe(inPlay);
                    throw caught;
                });
                wrote = true;
                await afterChange(targets);
            } catch (caught) {
                // Everyone has the outfit and only the stat update failed: the line goes once one runs.
                if (wrote && owed.has(inPlay)) sayOwed(inPlay, caught);
                else bulkSaid.say("failed", caught.message);
                void readStatus().catch(() => {});
                return { cancelled: true };
            }
        });
        // Asked once the write status is free again (the question's tool is busy while it runs).
        if (again) await askAgain();
        return result;
    };

    // The tray's tool: "Give everyone", a pick of the attire that opens in place under the tray's tools.
    const everyoneTool = (ask) => {
        const pick = PickInPlace({
            name: "Give everyone",
            opener: "Give everyone",
            options: attireChoices,
            onPick: (id) => void askGiveEveryone(id, ask, pick.opener),
            search: true,
            disabled: () => busy() || !outfits.val.length,
            panelClass: "pick-in-place--columns attire-everyone__list",
        });
        // The list opens in place under the tray's tools (the panel's edge would cut off a list laid over the rows).
        return [pick.opener, pick.panel];
    };

    // An undo of a change made here (from its row, Undo all or History) puts old attire back: the stats of the
    // character in play are worked out again, as after the change itself.
    const place = currentPlace();
    let undone = reloadPlace.rawVal;
    van.derive(() => {
        const target = reloadPlace.val;
        if (!target || target === undone) return;
        undone = target;
        if (target.view !== place.view || target.page !== place.page) return;
        // The character the update runs for owes it, though another may be in play by the time it fails.
        const name = current.rawVal;
        void updateStats(name).catch((caught) =>
            sayOwed(name, new Error(`Undone, but the stats weren't worked out again: ${caught.message}`))
        );
    });

    // Refresh also runs the stat update the character in play still owes (Refresh is where a player tries again).
    const load = () =>
        runLoad(async () => {
            const { current: inPlay } = await readStatus();
            if (owed.has(inPlay)) await updateStats(inPlay).catch(() => {});
            await readChoice();
        });
    load();

    const characterCount = () => rowStates.size;
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Attire Rack",
        description: "Outfit bonuses as if worn, and the attire each character wears. No bonus in dungeons.",
        actions: RefreshButton({ onRefresh: load, disabled: busy }),
        state: { loading, error },
        loadingText: "Reading the attire rack",
        errorTitle: "Couldn't read the attire rack",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Attire Rack",
                page: "account.attire-rack",
                busy,
                tabs: [
                    { id: "bonuses", label: "Outfit bonuses", content: cards },
                    { id: "appearance", label: "Appearance", content: rows },
                ],
                tools: toolsPerTab({
                    // All on only gives, so it runs on one press; All off takes them away, so it asks.
                    bonuses: (ask) =>
                        div(
                            { class: "tabbed-list__tool-group" },
                            ActionButton({
                                label: "All on",
                                status: choiceWrite.status,
                                disabled: () => busy() || !outfits.val.length || (allChosen.val && enabled.val),
                                onClick: (e) => {
                                    e.preventDefault();
                                    return writeChoice(() => new Set(outfits.val.map(({ id }) => id)));
                                },
                            }),
                            ActionButton({
                                label: "All off",
                                variant: "danger",
                                status: choiceWrite.status,
                                disabled: () => busy() || (!chosen.val.size && !enabled.val),
                                onClick: (e) => {
                                    e.preventDefault();
                                    clearChoice(e.currentTarget, ask);
                                },
                            })
                        ),
                    appearance: everyoneTool,
                }),
                toolsLabel: (activeId) => {
                    if (activeId.val === "bonuses") return choiceSaid.said.val?.text ?? choiceLabel();
                    const n = (outfits.val, characterCount());
                    return bulkSaid.said.val?.text ?? `All ${n} character${n === 1 ? "" : "s"}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "account.attire-rack",
    world: "account",
    system: "Player",
    tab: "Attire Rack",
    description: "Outfit bonuses from every outfit, and the attire each character wears.",
    keywords: ["Attire Rack", "Character appearance", "Outfit bonuses", "Outfits", "wide attire"],
    component: AttireRackPage,
});
