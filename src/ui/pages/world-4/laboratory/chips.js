/**
 * W4 - Laboratory › Chips
 *
 * Data sources:
 *   gga.GetPlayersUsernames     - the characters, in the game's order
 *   gga.Lab[1 + c][s]           - the chip in character c's slot s (-1: empty), seven slots each
 *   gga.Lab[15][n]              - how many of chip n the account owns
 *   cList.ChipDesc[n][0, 1]     - the chip's name and its bonus in the game's words
 *
 * The character is picked on the line under the title, like 3D Printer. One list: that character's seven slots, each
 * slot's chip as its title (pressing it opens the chips in place, with a search, and a pick saves at once), then every
 * chip the account owns, the bonus first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { createCharacterSelector } from "../../../components/views/account/components/CharacterSelector.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    toInt,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const OWNED_PATH = "Lab[15]";
const SLOT_COUNT = 7;
const EMPTY = -1;
const slotPath = (character, slot) => `Lab[${1 + character}][${slot}]`;

const ChipsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Lab chips" });
    const chips = van.state([]);
    const characters = van.state([]);
    const selected = van.state(0);
    const getOwnedState = createIndexedStateGetter(0);
    // Each character's slots, made the first time that character shows; a read sets the chips in them.
    const slotStates = new Map();
    const slotsOf = (character) => {
        if (!slotStates.has(character)) {
            slotStates.set(
                character,
                Array.from({ length: SLOT_COUNT }, () => van.state(EMPTY))
            );
        }
        return slotStates.get(character);
    };
    const slotNode = div();
    const ownedNode = div();
    // Each character's seven rows, made the first time that character shows and kept: a row switched away from while it
    // saves (or offers Undo) still has its save when it shows again.
    const slotRows = new Map();
    const reconcileOwned = createStaticRowReconciler(ownedNode);
    const uneditable = () => loading.val || Boolean(error.val);

    const chipOf = (id) => chips.val.find((chip) => chip.index === id);

    const SlotRow = (character, slot) => {
        const chipState = slotsOf(character)[slot];
        const slotName = `Slot ${slot + 1}`;
        let draft = EMPTY;
        const write = useAutoSave({
            capture: () => draft,
            prepare: (next = draft) =>
                next === chipState.val
                    ? { unchanged: true }
                    : {
                          write: async () => {
                              await writeVerified(slotPath(character, slot), next);
                              chipState.val = next;
                              return next;
                          },
                      },
        });
        const chipName = () =>
            chipState.val === EMPTY ? "Empty" : (chipOf(chipState.val)?.name ?? `Chip ${chipState.val + 1}`);
        // The slot's chip by what it does first, like every row with a bonus; an empty slot says so.
        const chipBonus = () => (chipState.val === EMPTY ? "Empty" : (chipOf(chipState.val)?.short ?? chipName()));
        const slotLine = () => (chipState.val === EMPTY ? slotName : `${slotName} · ${chipName()}`);
        const pick = PickInPlace({
            name: `${characters.val[character] ?? "Character"} ${slotName} chip`,
            look: "row",
            label: chipName,
            opener: RowTitles({ bonus: chipBonus, name: slotLine }),
            options: () => [
                { id: String(EMPTY), label: "Empty" },
                ...chips.val.map((chip) => ({ id: String(chip.index), label: chip.name, note: chip.bonus })),
            ],
            picked: () => String(chipState.val),
            onPick: (id) => {
                draft = Number(id);
                void write.save();
            },
            search: true,
            disabled: uneditable,
            panelClass: "row-detail",
        });
        const row = AccountRow({
            rowClass: () => `chip-slot-row ${saveStateClass(write.status.val, write.undo)}`,
            rowProps: write.handlers,
            info: pick.opener,
            controls: SaveState(write),
        });
        row.append(pick.panel);
        return row;
    };

    const showCharacter = () => {
        const character = selected.val;
        const key = `${character}:${characters.val[character] ?? ""}`;
        if (!slotRows.has(key)) {
            slotRows.set(
                key,
                Array.from({ length: SLOT_COUNT }, (_, slot) => SlotRow(character, slot))
            );
        }
        const rows = slotRows.get(key);
        if (rows.some((row, i) => slotNode.childNodes[i] !== row)) slotNode.replaceChildren(...rows);
    };

    const characterSelector = createCharacterSelector({
        id: "chips-character",
        selected,
        getValue: (_name, index) => index,
        disabled: () => loading.val,
        onChange: (event) => {
            selected.val = Number(event.target.value);
            showCharacter();
        },
    });

    const load = async () =>
        run(async () => {
            const [rawNames, rawLab, rawChips] = await Promise.all([
                gga("GetPlayersUsernames"),
                gga("Lab"),
                readCList("ChipDesc"),
            ]);
            const lab = toIndexedArray(rawLab ?? []);
            const names = toIndexedArray(rawNames ?? []).map(String);
            const owned = toIndexedArray(lab[15] ?? []);
            const nextChips = toIndexedArray(rawChips ?? [])
                .map((raw, index) => {
                    const def = toIndexedArray(raw ?? []);
                    const rawName = String(def[0] ?? "").trim();
                    if (!rawName) return null;
                    const bonus = bonusText(def[1]);
                    // "*Can Only Equip 1 per player*" stays in the pick's list, where it matters; the row keeps the bonus.
                    const short = bonus.replace(/\s*\*[^*]*\*\s*/g, " ").trim();
                    return { index, name: cleanName(rawName, `Chip ${index + 1}`), bonus, short };
                })
                .filter(Boolean);

            chips.val = nextChips;
            characters.val = names;
            characterSelector.setCharacters(names);
            if (selected.val >= names.length) selected.val = 0;
            names.forEach((_, character) => {
                const slots = toIndexedArray(lab[1 + character] ?? []);
                slotsOf(character).forEach((state, slot) => (state.val = toInt(slots[slot] ?? EMPTY, { min: EMPTY })));
            });
            showCharacter();

            reconcileOwned(nextChips.map((chip) => `${chip.index}:${chip.name}`).join("|"), () =>
                nextChips.map((chip) =>
                    ClampedLevelRow({
                        valueState: getOwnedState(chip.index),
                        writePath: `${OWNED_PATH}[${chip.index}]`,
                        max: Infinity,
                        integerMode: "trunc",
                        name: chip.name,
                        renderInfo: () => RowTitles({ bonus: chip.short, name: chip.name }),
                    })
                )
            );
            nextChips.forEach((chip) => (getOwnedState(chip.index).val = toInt(owned[chip.index], { min: 0 })));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Chips",
        description: "Each character's chip slots, and the chips the account owns.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        toolbar: characterSelector.node,
        state: { loading, error },
        loadingText: "Reading the chips",
        errorTitle: "Couldn't read the chips",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({ title: "Slots", body: slotNode }),
                    AccountSection({ title: "Owned", body: ownedNode }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w4.lab.chips",
    world: 4,
    system: "Laboratory",
    tab: "Chips",
    description: "Lab chip amounts and the chips each character has equipped.",
    keywords: ["Lab", "Chip slots"],
    component: ChipsTab,
});
