import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { captureGesture } from "../../../services/changeLog.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { parseNumber } from "../../../utils/numberFormat.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    adjustFormattedIntInput,
    cleanName,
    largeFormatter,
    largeParser,
    oneAtATime,
    unwrapH,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { getNumberInputLiveRaw, NumberInput, setNumberInputValue } from "../../../components/NumberInput.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { clickAgain } from "../../../components/inPlace.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { createCharacterSelector } from "../../../components/views/account/components/CharacterSelector.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

const slotLocation = (character, kind, slot) =>
    kind === "sample" && slot >= 5
        ? { array: "PrinterXtra", index: 10 * character + 2 * (slot - 5) }
        : { array: "Printer", index: (kind === "print" ? 15 : 5) + 14 * character + 2 * slot };

/**
 * Edit stored 3D Printer samples and active prints. The character is picked on the line under the title; its prints
 * and samples are one list. A slot's item is its title (pressing it opens the items in place, with a search), the
 * amount sits in the number column, and Stop or Clear at the end saves at once, with Undo in the row.
 */
const PrinterTab = () => {
    // Slot writes queued or running, and a Refresh. An Undo's reload waits for them, so it can't put an older value back.
    const busy = van.state(0);
    const { loading, error, pending, run: runLoad } = useAccountLoad({ label: "Printer", busy: () => busy.val > 0 });
    // Slot saves and Clears write one at a time, in the order asked, so a press made while another slot saves waits
    // its turn instead of being dropped. Each still writes under its own row's History action (captureGesture), so
    // every slot keeps its Undo even while another slot's action is open, waiting its turn.
    // ponytail: the queue is the page's, not useAutoSave's; a row's own saves still take turns there first.
    const queue = oneAtATime();
    const inTurn = (task) => {
        const inAction = captureGesture();
        busy.val++;
        return queue(() => {
            // A write that waited behind one that failed: the page shows old values until a Refresh.
            if (error.val || !snapshot.val) throw new Error("Refresh before editing Printer.");
            return task(inAction);
        }).finally(() => busy.val--);
    };
    const snapshot = van.state(null);
    const selected = van.state(-1);
    const rows = new Map();
    const panels = new Map();
    const panelsNode = div();
    const isBusy = () => loading.val || busy.val > 0;
    const characterSelector = createCharacterSelector({
        id: "printer-character",
        disabled: () => isBusy() || !snapshot.val,
        selected,
        getValue: (_name, index) => index,
        onChange: (event) => {
            if (isBusy()) return;
            selected.val = Number(event.target.value);
            showCharacter();
        },
        info: null,
    });
    let accountIdentity = "";
    let cachedCatalogue = null;

    // Not `busy`: a save asked for while another slot saves waits its turn (inTurn), so no press is lost. But not while
    // an Undo's reload waits for them: the rows still show what the Undo put back.
    const cannotWrite = () => loading.val || Boolean(error.val) || !snapshot.val || pending.val;
    // A slot's drafts: the picked item, the quantity as typed, and the stored quantity the field showed then (its
    // rounded form, "16.2K", stands for exactly that one, even once a save in between has changed what's stored).
    const draftsOf = (state) => ({
        item: state.item.val,
        rawQty: getNumberInputLiveRaw(state.quantity) ?? state.quantity.val,
        shownQty: state.baseline.qty,
    });
    const showsQty = ({ rawQty, shownQty }) => rawQty === String(shownQty) || rawQty === largeFormatter(shownQty);
    const isDirty = (state, drafts = draftsOf(state)) => {
        state.dirty.val;
        const { item, rawQty } = drafts;
        // The field shows a rounded quantity ("16.2K"); left as shown, it is the quantity it stood for.
        if (showsQty(drafts)) {
            return item !== state.baseline.item || String(drafts.shownQty) !== String(state.baseline.qty);
        }
        const parsed = parseNumber(rawQty);
        const qtyChanged = Number.isFinite(parsed)
            ? Math.round(parsed) !== Number(state.baseline.qty)
            : rawQty !== String(state.baseline.qty);
        return item !== state.baseline.item || qtyChanged;
    };
    const hasDrafts = () => [...rows.values()].some((state) => isDirty(state));
    const isAllowedItem = (item, state, snap = snapshot.val) =>
        Boolean(snap?.ids?.has(item)) || (item !== "Blank" && item === state.baseline.item);

    const getCatalogue = async () => {
        if (cachedCatalogue) return cachedCatalogue;
        const [monsters, fishPools, drops, nonAfk] = await Promise.all([
            gga("MonsterDefinitionsGET.h"),
            gga("CustomMaps.h.FishPools"),
            gga("CustomMaps.h.MonsterDrops"),
            readCList("NonAFKmonsters"),
        ]);
        if (!monsters || !fishPools || !drops || !nonAfk) {
            throw new Error("Printer catalogue definitions are unavailable.");
        }

        const candidates = new Set();
        const excluded = new Set(toIndexedArray(nonAfk));
        const pools = unwrapH(fishPools);
        const monsterDrops = unwrapH(drops);
        for (const [target, rawDefinition] of Object.entries(unwrapH(monsters))) {
            if (excluded.has(target)) continue;
            const definition = unwrapH(rawDefinition);
            if (["MINING", "CHOPPIN", "CATCHING", "SPELUNKING"].includes(definition.AFKtype)) candidates.add(target);
            else if (definition.AFKtype === "FISHING") {
                for (const id of toIndexedArray(toIndexedArray(pools[target])[0])) candidates.add(id);
            } else if (definition.AFKtype === "FIGHTING") {
                const firstDrop = toIndexedArray(monsterDrops[target])
                    .slice(0, 4)
                    .map(toIndexedArray)
                    .find((row) => row[3] === "N/A" && row[0] !== "COIN" && !String(row[0]).includes("Cards"));
                if (firstDrop) candidates.add(firstDrop[0]);
            }
        }

        const definitions = await readGgaEntries("ItemDefinitionsGET.h", [...candidates], ["displayName"]);
        const named = [...candidates]
            .filter((id) => definitions[id])
            .map((id) => ({ id, name: cleanName(unwrapH(definitions[id]).displayName, id) }));
        // Two items with one name keep their ids, so the pick tells them apart.
        const nameCount = new Map();
        named.forEach(({ name }) => nameCount.set(name, (nameCount.get(name) ?? 0) + 1));
        const catalogue = named
            .map((entry) => ({ ...entry, twin: nameCount.get(entry.name) > 1 }))
            .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        if (!catalogue.length) throw new Error("Printer item catalogue is unavailable.");
        const namesById = new Map(catalogue.map((entry) => [entry.id, entry.name]));
        cachedCatalogue = {
            catalogue,
            ids: new Set(catalogue.map(({ id }) => id)),
            namesById,
        };
        return cachedCatalogue;
    };

    const readSnapshot = async () => {
        const [rawNames, current, unlocked, gems, printer, extra, catalogueResult] = await Promise.all([
            gga("GetPlayersUsernames"),
            gga("UserInfo[0]"),
            gga("TowerInfo[0]"),
            gga("GemItemsPurchased"),
            gga("Printer"),
            gga("PrinterXtra"),
            getCatalogue(),
        ]);
        const names = toIndexedArray(rawNames).filter(
            (name) => typeof name === "string" && name.trim().length > 0 && !name.startsWith("__")
        );
        if (
            !names.length ||
            new Set(names).size !== names.length ||
            !Number.isInteger(Number(unlocked)) ||
            Number(unlocked) < 0 ||
            !printer ||
            !extra ||
            !gems
        ) {
            throw new Error("Printer data is unavailable or invalid. Refresh to try again.");
        }

        const { catalogue, ids, namesById } = catalogueResult;
        return {
            names,
            current,
            unlocked: Math.min(Number(unlocked), names.length),
            gems: toIndexedArray(gems),
            Printer: toIndexedArray(printer),
            PrinterXtra: toIndexedArray(extra),
            catalogue,
            ids,
            namesById,
        };
    };

    const updateRow = (state, item, qty, resetDraft = false) => {
        const drafts = draftsOf(state);
        const retainDraft = !resetDraft && isDirty(state, drafts);
        // A kept draft keeps only the half the player changed; the other shows what the game holds now.
        const keepItem = retainDraft && drafts.item !== state.baseline.item;
        const keepQty = retainDraft && !showsQty(drafts);
        state.saved.val = { item, qty };
        // A kept draft is compared with what the game holds now.
        state.baseline = { item, qty };
        if (!keepItem) state.item.val = item;
        if (!keepQty) setNumberInputValue(state.quantity, String(qty));
        state.dirty.val++;
    };

    const syncSnapshot = (next, resetDrafts = false) => {
        snapshot.val = next;
        for (let character = 0; character < next.names.length; character++) {
            for (const kind of ["print", "sample"]) {
                for (let slot = 0; slot < (kind === "print" ? 2 : 10); slot++) {
                    const key = `${character}:${kind}:${slot}`;
                    const location = slotLocation(character, kind, slot);
                    const values = next[location.array];
                    const present = values[location.index] !== undefined && values[location.index + 1] !== undefined;
                    if (!rows.has(key)) {
                        rows.set(key, {
                            character,
                            kind,
                            slot,
                            location,
                            baseline: { item: "Blank", qty: 0 },
                            saved: van.state({ item: "Blank", qty: 0 }),
                            item: van.state("Blank"),
                            quantity: van.state("0"),
                            dirty: van.state(0),
                        });
                        const created = rows.get(key);
                        // The item and quantity save together on Enter or on leaving the row.
                        created.write = useAutoSave({
                            // The drafts as they were at the commit, so a later one can't save in its place.
                            capture: () => draftsOf(created),
                            prepare: (drafts) => prepareSlot(created, drafts),
                            revert: () => {
                                updateRow(created, created.baseline.item, created.baseline.qty, true);
                                created.syncOptions?.();
                            },
                        });
                    }
                    const state = rows.get(key);
                    updateRow(
                        state,
                        present ? values[location.index] : "Blank",
                        present ? values[location.index + 1] : 0,
                        resetDrafts
                    );
                    if (state.syncOptions) state.syncOptions();
                }
            }
        }
        showCharacter();
    };

    const readFresh = async () => {
        try {
            const next = await readSnapshot();
            if (JSON.stringify(next.names) !== accountIdentity) {
                throw new Error("The account or character list changed. Refresh before editing Printer.");
            }
            syncSnapshot(next);
            return next;
        } catch (caughtError) {
            error.val = `Refresh before editing Printer. ${caughtError.message}`;
            throw caughtError;
        }
    };

    const applyWrites = async (writes) => {
        try {
            await writeManyVerified(writes);
        } catch (caughtError) {
            try {
                await readFresh();
            } catch (readError) {
                error.val = `Printer could not be reread. Refresh before editing. ${readError.message}`;
            }
            throw new Error(`Some changes may have applied or could not be verified. ${caughtError.message}`);
        }
    };

    // A slot's save: nothing when the draft matches the game, the reason when it can't be saved.
    const prepareSlot = (state, drafts = draftsOf(state)) => {
        if (cannotWrite() || !isDirty(state, drafts)) return { unchanged: true };
        const { item, rawQty } = drafts;
        const parsed = Math.round(parseNumber(rawQty));
        if (!isAllowedItem(item, state)) throw new Error("pick an item");
        if (!Number.isFinite(parsed)) throw new Error("not a number");
        if (parsed <= 0) throw new Error("min 1");
        const qty = showsQty(drafts)
            ? drafts.shownQty
            : parsed === Number(state.baseline.qty)
              ? state.baseline.qty
              : typeof state.baseline.qty === "string"
                ? String(parsed)
                : parsed;
        return { write: () => inTurn((inAction) => writeSlot(state, item, qty, false, inAction, drafts)) };
    };

    // Stop and Clear take one thing out of a slot: they save at once, and the row offers Undo. The drafts at the press
    // go with it, so an item picked while it runs stays for its own save.
    const clearSlot = (state) => {
        if (cannotWrite()) return;
        const drafts = draftsOf(state);
        return state.write.run(() => inTurn((inAction) => writeSlot(state, "Blank", 0, true, inAction, drafts)));
    };

    // `inAction`: runs the write under the History action of the row that asked for it. `committed`: the drafts the
    // save was asked with.
    const writeSlot = async (state, item, qty, clear, inAction, committed = null) => {
        try {
            const next = await readFresh();
            const cap = Math.round(
                (state.kind === "print" ? 1 : 4) + Number(next.gems[state.kind === "print" ? 111 : 112] ?? 0)
            );
            if (state.character >= next.unlocked) throw new Error("This character's Printer is locked.");
            if (!clear && (state.slot >= cap || !isAllowedItem(item, state, next))) {
                throw new Error("This slot or item is no longer available. Refresh and check the draft.");
            }
            const { array, index } = state.location;
            if (!(clear && next[array][index] === "Blank" && Number(next[array][index + 1]) === 0)) {
                await inAction(() =>
                    applyWrites([
                        { path: `${array}[${index}]`, value: item },
                        { path: `${array}[${index + 1}]`, value: qty },
                    ])
                );
            }
            const now = draftsOf(state);
            if (committed && (now.item !== committed.item || now.rawQty !== committed.rawQty)) {
                // Typed while this save waited: the newer draft stays, for its own Enter to save.
                state.saved.val = { item, qty };
                state.baseline = { item, qty };
                state.dirty.val++;
            } else updateRow(state, item, qty, true);
            state.syncOptions();
        } catch (caughtError) {
            error.val = caughtError.message;
            throw caughtError;
        }
    };

    const renderSlot = (state, name) => {
        const slotName = `${state.kind === "print" ? "Print" : "Sample"} ${state.slot + 1}`;
        const lockedCharacter = () => state.character >= (snapshot.val?.unlocked ?? 0);
        const lockedSlot = () => {
            const kindCap = Math.round(
                (state.kind === "print" ? 1 : 4) + Number(snapshot.val?.gems?.[state.kind === "print" ? 111 : 112] ?? 0)
            );
            return state.slot >= kindCap;
        };
        const locked = () => lockedCharacter() || lockedSlot();
        // Fields and buttons stay enabled while a save runs (the save checks again), so they keep focus.
        const uneditable = () => loading.val || Boolean(error.val) || !snapshot.val || lockedCharacter();
        const itemName = () => {
            const id = state.item.val;
            if (!id || id === "Blank") return "Empty";
            const entry = snapshot.val?.catalogue?.find((item) => item.id === id);
            return entry ? (entry.twin ? `${entry.name} (${id})` : entry.name) : String(id);
        };
        // The item is the row's title; pressing it opens the items in place under the row, with a search.
        const pick = PickInPlace({
            name: `${name} ${slotName} item`,
            look: "row",
            label: itemName,
            opener: RowTitles({ bonus: itemName, name: slotName }),
            options: () =>
                (snapshot.val?.catalogue ?? []).map(({ id, name: label, twin }) => ({
                    id,
                    label: twin ? `${label} (${id})` : label,
                })),
            picked: () => state.item.val,
            onPick: (id) => {
                state.item.val = id;
                state.dirty.val++;
                // A pick is a change made: it saves at once, with the amount the field shows.
                void state.write.save();
            },
            search: true,
            disabled: () => uneditable() || lockedSlot(),
            panelClass: "row-detail",
        });
        // The picks follow the game's catalogue by themselves; nothing to rebuild.
        state.syncOptions = () => {};
        const row = AccountRow({
            rowClass: () => `printer-row ${saveStateClass(state.write.status.val, state.write.undo)}`,
            rowProps: state.write.handlers,
            info: pick.opener,
            controls: [
                SaveState(state.write),
                // A slot the game hasn't unlocked says so where its controls would be.
                span({ class: "printer-row__locked", hidden: () => !locked() }, "Locked"),
                div(
                    { class: "printer-row__controls", hidden: locked },
                    NumberInput({
                        value: state.quantity,
                        mode: "int",
                        formatter: largeFormatter,
                        parser: largeParser,
                        "aria-label": `${name} ${slotName} quantity`,
                        disabled: () => uneditable() || lockedSlot(),
                        oninput: () => {
                            state.dirty.val++;
                        },
                        onDecrement: () => {
                            if (uneditable() || lockedSlot()) return;
                            const raw = getNumberInputLiveRaw(state.quantity) ?? state.quantity.val;
                            state.quantity.val = String(adjustFormattedIntInput(raw, -1, 0, { min: 0 }));
                            state.dirty.val++;
                        },
                        onIncrement: () => {
                            if (uneditable() || lockedSlot()) return;
                            const raw = getNumberInputLiveRaw(state.quantity) ?? state.quantity.val;
                            state.quantity.val = String(adjustFormattedIntInput(raw, 1, 0, { min: 0 }));
                            state.dirty.val++;
                        },
                    }),
                    ActionButton({
                        label: state.kind === "print" ? "Stop" : "Clear",
                        variant: "danger",
                        className: "printer-row__clear",
                        disabled: () =>
                            uneditable() || (state.saved.val.item === "Blank" && !Number(state.saved.val.qty)),
                        onClick: (e) => {
                            e.preventDefault();
                            return clearSlot(state);
                        },
                    })
                ),
            ],
        });
        row.append(pick.panel);
        return div({ "data-printer-slot": `${state.kind}-${state.slot + 1}` }, row);
    };

    const showCharacter = () => {
        const next = snapshot.val;
        if (!next || selected.val < 0 || panels.has(selected.val)) return;
        const character = selected.val;
        const name = next.names[character];
        const panel = div(
            {
                class: () => `printer-character${selected.val === character ? "" : " hidden"}`,
                "data-printer-character": name,
            },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({
                        title: "Prints",
                        body: [0, 1].map((slot) => renderSlot(rows.get(`${character}:print:${slot}`), name)),
                    }),
                    AccountSection({
                        title: "Samples",
                        body: Array.from({ length: 10 }, (_, slot) =>
                            renderSlot(rows.get(`${character}:sample:${slot}`), name)
                        ),
                    }),
                ],
            })
        );
        panels.set(character, panel);
        panelsNode.append(panel);
    };

    // A Refresh discards the drafts (it asked first); the reload after an undo elsewhere keeps them.
    let discardDrafts = false;
    // `e`: REFRESH's click, which asks in place before it throws drafts away (#77).
    const load = async (e) => {
        if (
            busy.val ||
            (!loading.val &&
                hasDrafts() &&
                !clickAgain(e.currentTarget, "refresh Printer and discard every character's drafts."))
        )
            return;
        busy.val++;
        discardDrafts = true;
        try {
            await runLoad(async () => {
                const next = await readSnapshot();
                const identity = JSON.stringify(next.names);
                if (identity !== accountIdentity) {
                    rows.clear();
                    panels.clear();
                    panelsNode.replaceChildren();
                }
                if (identity !== accountIdentity || selected.val < 0) {
                    const currentIdx = next.names.indexOf(next.current);
                    selected.val = currentIdx >= 0 ? currentIdx : 0;
                }
                accountIdentity = identity;
                characterSelector.setCharacters(next.names);
                syncSnapshot(next, discardDrafts);
            });
        } finally {
            busy.val--;
            discardDrafts = false;
        }
    };

    load();
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "3D Printer",
        description: "Each character's prints and stored samples, with their items and amounts.",
        actions: RefreshButton({ onRefresh: load, disabled: isBusy }),
        toolbar: characterSelector.node,
        state: { loading, error },
        loadingText: "Reading the 3D printer",
        errorTitle: "Couldn't read the 3D printer",
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, panelsNode),
    });
};

export default definePage({
    id: "w3.printer",
    world: 3,
    system: "3D Printer",
    description: "Stored printer samples and active prints.",
    keywords: ["Printer", "Samples", "Prints"],
    component: PrinterTab,
});
