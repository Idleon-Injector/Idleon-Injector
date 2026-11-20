/**
 * Account - Player: Attire Rack (#89, ported from VoidKitten's #3)
 *
 * Outfit bonuses: a card per outfit; a click turns its bonus on or off. The choice is
 * cheatConfig.wide.attire.outfits ("all" once every outfit is on, so outfits a game update adds count too), applied
 * to the session and saved to config.custom.js on each click, as the Pets page saves its pets. `wide attire` is on,
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
    gga,
    readComputed,
    saveConfigFile,
    updateSessionConfig,
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

    // Slot fields a write couldn't verify (the game kept another value), by path, with the character and attire they
    // were for and the value the game kept. Another try at that attire writes them again, though the copy already
    // holds its id; the fields that landed stay as they are, so upgrades added since aren't wiped. A field the game no
    // longer holds as it kept it (she changed it in the game since) is forgotten before a write (`recheck`), so a retry
    // never puts the old value over a newer one.
    const unverified = new Map();
    const recheck = async () => {
        const paths = [...unverified.keys()];
        const now = await Promise.all(paths.map((path) => gga(path)));
        paths.forEach((path, index) => {
            if (JSON.stringify(now[index]) !== JSON.stringify(unverified.get(path).kept)) unverified.delete(path);
        });
    };
    const writesFor = (character, item) => {
        const writes = slotWrites(character, item).map((entry) => ({ ...entry, name: character.name }));
        for (const [path, field] of unverified) {
            const copy = path.startsWith("PlayerDATABASE") ? character.saved : character.active;
            if (copy && field.name === character.name && field.item === item && !writes.some((w) => w.path === path))
                writes.push({ path, value: field.value, name: character.name });
        }
        return writes;
    };
    const writeSlots = (writes, item) =>
        writeManyVerified(writes.map(({ path, value }) => ({ path, value }))).then(
            (result) => {
                for (const entry of writes) unverified.delete(entry.path);
                return result;
            },
            (caught) => {
                writes.forEach((entry, index) => {
                    const result = caught.results?.[index];
                    // Only a field whose kept value the game sent back: without it, a later change can't be told.
                    if (result?.ok === false && "actual" in result)
                        unverified.set(entry.path, { name: entry.name, item, value: entry.value, kept: result.actual });
                    else unverified.delete(entry.path);
                });
                throw caught;
            }
        );

    // --- Outfit bonuses ---

    // A choice saved since this read began is newer than what it read: the read drops its answer.
    let choiceSaves = 0;
    const readChoice = async () => {
        const saves = choiceSaves;
        const [config, cheatStates] = await Promise.all([fetchConfig(), fetchCheatStates()]);
        if (saves !== choiceSaves) return;
        enabled.val = Boolean(cheatStates?.data?.wide?.attire);
        const saved = config?.cheatConfig?.wide?.attire?.outfits ?? "all";
        const ids = outfits.val.map(({ id }) => id);
        allChosen.val = saved === "all";
        chosen.val = new Set(
            allChosen.val
                ? ids
                : String(saved)
                      .split(",")
                      .map((id) => id.trim())
                      .filter((id) => ids.includes(id))
        );
    };

    // /api/config/save rewrites config.custom.js from what it is handed, so it gets the whole config. `onAtStart`:
    // chosen outfits also turn the cheat on at every start; none takes it off that list. Startup cheats toggle, so a
    // list that already has "wide" (every account-wide cheat) gets no "wide attire", which would turn it back off.
    const persistConfig = async (onAtStart) => {
        const config = await fetchConfig();
        if (!config?.cheatConfig) throw new Error("Could not read the config back to save it");
        const startup = config.startupCheats ?? [];
        const listed = startup.includes(ATTIRE_CHEAT) || startup.includes("wide");
        await saveConfigFile({
            startupCheats: onAtStart
                ? listed
                    ? startup
                    : [...startup, ATTIRE_CHEAT]
                : startup.filter((command) => command !== ATTIRE_CHEAT),
            cheatConfig: config.cheatConfig,
            injectorConfig: config.injectorConfig,
        });
    };

    // `next(chosen)`: the outfits to give, from the saved choice. Built after a fresh read, so a choice saved from the
    // Config page meanwhile isn't overwritten. `write`: the status it runs under (the cards have their own).
    const writeChoice = (next, write = choiceWrite) =>
        write.run(
            async () => {
                choiceSaid.clear();
                await readChoice();
                const ids = outfits.val.map(({ id }) => id);
                const wanted = next(new Set(chosen.val));
                const value =
                    ids.length && ids.every((id) => wanted.has(id))
                        ? "all"
                        : ids.filter((id) => wanted.has(id)).join(",");
                const result = await updateSessionConfig({ cheatConfig: { wide: { attire: { outfits: value } } } });
                if (result.message !== "Configuration updated successfully") {
                    throw new Error(result.details || result.message || "The game didn't take the outfit choice");
                }
                await executeCheatAction(ATTIRE_CHEAT, value !== "");
                enabled.val = value !== "";
                allChosen.val = value === "all";
                chosen.val = new Set(value === "all" ? ids : ids.filter((id) => wanted.has(id)));
                choiceSaves++;
                await persistConfig(value !== "");
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
                        !(statsOwed && state.character.val.active) &&
                        !(state.write.status.val === "error" && writesFor(state.character.val, state.draft.val).length)
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

    const readStatus = async () => {
        const status = await readComputed("attire", "status");
        if (!status || !Array.isArray(status.outfits)) throw new Error("The game didn't send its outfits");
        show(status);
        return status;
    };

    // The stats of the character in play are owed from a change whose write landed but whose stat update failed.
    // A retry finds the game already holds the pick, so it runs the update instead of stopping there.
    let statsOwed = false;
    // Each change that owes the stats, and each update, is newer than the last. An older update answering late neither
    // clears a newer one's failure nor says its own failure once a newer one worked.
    let statsDebt = 0;
    const oweStats = () => {
        statsOwed = true;
        return ++statsDebt;
    };
    // The line a refused stat update left above the rows (after an undo or Give everyone); it goes once an owed update
    // runs, as does the in-play row's reason when its pick is what the game holds.
    let owedLine = null;
    const updateStats = async () => {
        const debt = oweStats();
        try {
            await executeCheatAction(STATS_CHEAT);
        } catch (caught) {
            // A newer update that worked already cleared the debt: this failure is no longer true.
            if (statsOwed) throw caught;
            return;
        }
        if (debt !== statsDebt) return;
        statsOwed = false;
        if (owedLine && bulkSaid.said.val === owedLine) bulkSaid.clear();
        owedLine = null;
        const inPlay = rowStates.get(current.val);
        if (inPlay?.write.status.val === "error" && !writesFor(inPlay.character.val, inPlay.draft.val).length)
            inPlay.write.cancel();
    };

    // After attire changed: the game works out the stats of the character in play again when that one changed.
    // The game is read again however it ends, so the row and the worn badge show what landed; a read that fails after
    // a change that worked is said, as the page may still show the old attire.
    const afterChange = async (changed) => {
        let failed = null;
        try {
            if (changed.some((character) => character.active)) await updateStats();
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
    // update is owed.
    const wear = async (name, item) => {
        const status = await readStatus();
        await recheck();
        const character = status.characters.find((entry) => entry.name === name);
        if (!character || !changeable(character)) throw new Error("can't change this character here");
        const writes = writesFor(character, item);
        if (!writes.length) {
            if (!statsOwed) return { cancelled: true };
            return updateStats();
        }
        // A write that lands only in part still changed the character in play: its stat update is owed, from when the
        // write ended, so an update that ran meanwhile (a Refresh, an undo) doesn't count for it.
        await writeSlots(writes, item).catch(async (caught) => {
            if (character.active) oweStats();
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
        try {
            const { characters } = await readStatus();
            await recheck();
            targets = characters.filter((character) => changeable(character) && writesFor(character, item).length);
        } catch (caught) {
            bulkSaid.say("failed", caught.message);
            return;
        }
        if (!targets.length) {
            if (statsOwed)
                return bulkWrite.run(updateStats, { onError: (caught) => bulkSaid.say("failed", caught.message) });
            bulkSaid.say("refused", `Everyone already wears ${outfitName(item)}.`);
            return;
        }
        const count = `${targets.length} character${targets.length === 1 ? "" : "s"}`;
        const question = `give ${count} ${outfitName(item)}. The attire they wear now is replaced, not moved to storage.`;
        if (!clickAgain(buttonNode, question, { targets: targets.map(({ name }) => name) })) return;
        let wrote = false;
        await bulkWrite.run(
            async () => {
                await writeSlots(
                    targets.flatMap((character) => writesFor(character, item)),
                    item
                ).catch((caught) => {
                    if (targets.some((character) => character.active)) oweStats();
                    throw caught;
                });
                wrote = true;
                await afterChange(targets);
            },
            {
                onError: (caught) => {
                    bulkSaid.say("failed", caught.message);
                    // Everyone has the outfit and only the stat update failed: the line goes once one runs.
                    if (wrote && statsOwed) owedLine = bulkSaid.said.val;
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
        if (target.view === place.view && target.page === place.page)
            void updateStats().catch((caught) => {
                bulkSaid.say("failed", `Undone, but the stats weren't worked out again: ${caught.message}`);
                owedLine = bulkSaid.said.val;
            });
    });

    // Refresh also runs a stat update still owed (Refresh is where a player tries again).
    const load = () =>
        runLoad(async () => {
            if (statsOwed) await updateStats().catch(() => {});
            await readStatus();
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
                    tooltip: "Give every outfit's bonus, including outfits a game update adds",
                    onClick: () => writeChoice(() => new Set(outfits.val.map(({ id }) => id))),
                },
                // Removes: a danger button that asks in place.
                {
                    label: "No outfits",
                    variant: "danger",
                    status: choiceWrite.status,
                    disabled: busy,
                    tooltip: "Stop giving outfit bonuses, now and at start",
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
                        tooltip: "Every character wears the chosen outfit",
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
