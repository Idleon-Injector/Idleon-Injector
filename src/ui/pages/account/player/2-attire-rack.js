/**
 * Account - Player: Attire Rack (#89, ported from VoidKitten's #3)
 *
 * Outfit bonuses: a card per outfit; a click turns its bonus on or off. The choice is
 * cheatConfig.wide.attire.outfits ("all" once every outfit is on, so outfits a game update adds count too), saved to
 * config.custom.js and the session on each click, as the Pets page saves its pets. `wide attire` is on,
 * now and at every start (a startup cheat), while any outfit is chosen. As on Pets, the cards show the saved choice
 * even while the cheat is off, and a click edits that choice.
 *
 * Appearance: the attire each character wears, slot 15 of its first equipment row (EquipmentOrder, EquipmentQuantity
 * and EquipmentMap), on the live copy of the character in play and on its PlayerDATABASE copy. Each change is one
 * saved action Undo can put back. After a change of the character in play, and after any undo of a change made here,
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
import { Said, clickAgain, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    createStaticRowReconciler,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span, button, select, option } = van.tags;

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
    // The cards' own saves, so their result doesn't light up All outfits or No outfits.
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
    const everyone = van.state("");
    // Character name -> { character, item, draft, write }.
    const rowStates = new Map();
    // Busy while an outfit choice saves, so assistive technology hears the cards are updating.
    const cards = div({
        class: "tier-grid",
        role: "group",
        "aria-label": "Outfit bonuses",
        "aria-busy": () => choiceSaving(),
    });
    const rows = div({ class: "account-list" });
    const everyoneHolder = span();
    const reconcileCards = createStaticRowReconciler(cards);
    const reconcileRows = createStaticRowReconciler(rows);
    const reconcileEveryone = createStaticRowReconciler(everyoneHolder);

    const busy = () => loading.val || choiceSaving() || bulkWrite.status.val === "loading";
    const isChosen = (id) => chosen.val.has(id);
    const outfitName = (id) =>
        id === NO_ATTIRE ? "no attire" : (outfits.val.find((outfit) => outfit.id === id)?.name ?? id);
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

    const clearChoice = (buttonNode) => {
        choiceSaid.clear();
        if (!chosen.val.size && !enabled.val) return choiceSaid.say("refused", "No outfit bonus is chosen.");
        const count = chosen.val.size === outfits.val.length ? "every" : String(chosen.val.size);
        if (!clickAgain(buttonNode, `stop giving ${count} outfit bonuses, now and at start.`)) return;
        return writeChoice(() => new Set());
    };

    // A click while a choice saves is dropped; the cards stay enabled so focus stays on the card. It does what the
    // card shows (on turns off), whatever the fresh read finds.
    const toggleOutfit = (id) => {
        if (busy()) return false;
        const turnOn = !isChosen(id);
        return writeChoice((on) => {
            if (turnOn) on.add(id);
            else on.delete(id);
            return on;
        }, cardWrite);
    };

    const renderCard = (outfit) =>
        button(
            {
                type: "button",
                class: "tier-card attire-card",
                "aria-pressed": () => isChosen(outfit.id),
                disabled: () => loading.val,
                title: () => `${isChosen(outfit.id) ? "Stop giving" : "Give"} the ${outfit.name} bonus`,
                onclick: () => toggleOutfit(outfit.id),
            },
            div({ class: "tier-card__header" }, span({ class: "tier-card__name" }, outfit.name), () =>
                wornNow() === outfit.id ? span({ class: "tier-card__badge" }, "worn") : span()
            ),
            statLine(outfit) ? div({ class: "attire-card__line" }, statLine(outfit)) : null,
            ...outfit.bonuses.map((bonus) => div({ class: "attire-card__line" }, `+${bonus.value}${words(bonus.key)}`))
        );

    const choiceNote = () => {
        if (!enabled.val)
            return chosen.val.size
                ? "The cheat is off, so the chosen bonuses aren't given. A click on an outfit turns it back on."
                : "Off. Click an outfit to give its bonus.";
        if (allChosen.val) return "Every outfit's bonus is on, including outfits a game update adds.";
        return `${chosen.val.size} of ${outfits.val.length} outfit bonuses are on.`;
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
        reconcileCards(JSON.stringify(ids), () => status.outfits.map(renderCard));
        reconcileRows(JSON.stringify([status.characters.map(({ name }) => name), ids]), () =>
            status.characters.map(({ name }) => renderRow(name))
        );
        reconcileEveryone(JSON.stringify(ids), renderEveryone);
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

    const renderRow = (name) => {
        const state = rowStates.get(name);
        const unknown = () => state.item.val !== NO_ATTIRE && !outfits.val.some(({ id }) => id === state.item.val);
        const options = [
            option({ value: NO_ATTIRE, selected: () => state.draft.val === NO_ATTIRE }, "No attire"),
            ...outfits.val.map((outfit) =>
                option({ value: outfit.id, selected: () => state.draft.val === outfit.id }, outfit.name)
            ),
            // Attire the outfit list doesn't know (EquipmentGown0, say) shows as it is, and can't be picked again.
            option(
                {
                    value: () => state.item.val,
                    disabled: true,
                    hidden: () => !unknown(),
                    selected: () => unknown() && state.draft.val === state.item.val,
                },
                () => state.item.val
            ),
        ];
        return AccountRow({
            // Wide controls: on a narrow window the picker gets its own line.
            rowClass: () => `account-row--wide-controls ${saveStateClass(state.write.status.val, state.write.undo)}`,
            rowProps: { ...state.write.handlers, "data-change-label": `${name} attire` },
            info: div({ class: "account-row__name-group" }, span({ class: "account-row__name" }, name), () =>
                !state.character.val.available
                    ? span({ class: "account-row__sub-label" }, "No attire slot to change")
                    : !changeable(state.character.val)
                      ? span({ class: "account-row__sub-label" }, "This name can't be changed from here")
                      : span()
            ),
            badge: () => (state.character.val.active ? "in play" : "saved"),
            controls: [
                SaveState(state.write),
                select(
                    {
                        class: "select-base",
                        "aria-label": `Attire for ${name}`,
                        disabled: () => loading.val || !changeable(state.character.val),
                        onchange: (event) => {
                            state.draft.val = event.target.value;
                            void state.write.save();
                        },
                    },
                    ...options
                ),
            ],
        });
    };

    // Everyone gets one outfit; the second click within a few seconds does it.
    const giveEveryone = async (buttonNode) => {
        const item = everyone.val;
        if (!item || busy()) return;
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
            bulkSaid.say("refused", `Everyone already wears ${outfitName(item)}.`);
            return;
        }
        const count = `${targets.length} character${targets.length === 1 ? "" : "s"}`;
        const question = `give ${count} ${outfitName(item)}. The attire they wear now is replaced, not moved to storage.`;
        if (!clickAgain(buttonNode, question, { targets: targets.map(({ name }) => name) })) return;
        let wrote = false;
        await bulkWrite.run(
            async () => {
                await writeManyVerified(
                    targets.flatMap((character) => slotWrites(character, item)),
                    { character: inPlay }
                ).catch((caught) => {
                    if (targets.some((character) => character.active)) owe(inPlay);
                    throw caught;
                });
                wrote = true;
                await afterChange(targets);
            },
            {
                onError: (caught) => {
                    // Everyone has the outfit and only the stat update failed: the line goes once one runs.
                    if (wrote && owed.has(inPlay)) sayOwed(inPlay, caught);
                    else bulkSaid.say("failed", caught.message);
                    void readStatus().catch(() => {});
                },
            }
        );
    };

    const renderEveryone = () =>
        select(
            {
                class: "select-base",
                "aria-label": "Outfit for every character",
                onchange: (event) => (everyone.val = event.target.value),
            },
            option({ value: "", selected: () => everyone.val === "" }, "Outfit for everyone"),
            option({ value: NO_ATTIRE, selected: () => everyone.val === NO_ATTIRE }, "No attire"),
            ...outfits.val.map((outfit) =>
                option({ value: outfit.id, selected: () => everyone.val === outfit.id }, outfit.name)
            )
        );

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

    return PersistentAccountListPage({
        title: "ATTIRE RACK",
        description:
            "Outfit bonuses as if worn, and the attire each character wears. The worn outfit counts once; there is no bonus in dungeons.",
        wrapActions: false,
        actions: BulkActionBar({
            actions: [
                // Adds: a quiet button (DESIGN.md).
                {
                    label: "All outfits",
                    variant: "quiet",
                    status: choiceWrite.status,
                    disabled: () => busy() || !outfits.val.length,
                    onClick: () => writeChoice(() => new Set(outfits.val.map(({ id }) => id))),
                },
                // Removes: a danger button that asks in place.
                {
                    label: "No outfits",
                    variant: "danger",
                    status: choiceWrite.status,
                    disabled: busy,
                    onClick: (event) => clearChoice(event.currentTarget),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING ATTIRE",
        errorTitle: "ATTIRE READ FAILED",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({
                title: "OUTFIT BONUSES",
                note: choiceNote,
                body: [Said({ said: choiceSaid.said, className: "said--line" }), cards],
            }),
            AccountSection({
                title: "APPEARANCE",
                note: "A new pick replaces the attire in that slot; it isn't moved to storage. Undo puts it back.",
                meta: [
                    everyoneHolder,
                    // It replaces the attire everyone wears, so it is a danger button that asks in place.
                    ActionButton({
                        label: "Give everyone",
                        variant: "danger",
                        status: bulkWrite.status,
                        disabled: () => busy() || !everyone.val,
                        onClick: (event) => giveEveryone(event.currentTarget),
                    }),
                ],
                body: [Said({ said: bulkSaid.said, className: "said--line" }), rows],
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
