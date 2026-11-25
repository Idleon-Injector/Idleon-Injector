/**
 * W7 - Sushi Station: Station
 *
 * The game's station: 15 by 8 slots, each showing the tier of the sushi on it, its plate on its edge, and the
 * fireplaces under them (read only). A slot picked opens its row under the board, in the same panel (the cog board's
 * way, #251): the plate's word, then the tier up to the highest the game has. Typing 0 empties the slot. The same slot
 * again or Escape closes it.
 *
 * Data sources:
 *   gga.Sushi[0][s]        - the sushi on slot s, as its tier's index (-1 for none)
 *   gga.Sushi[1][s]        - slot s's plate (-1 not unlocked, 0 normal, 1 red, 2 blue, 3 gold)
 *   gga.Sushi[3][c]        - fireplace c, under column c
 *   cList.Research[30]     - the sushi tiers, for the highest tier
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { createBoardEditor } from "../../../components/views/account/components/BoardEditor.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { toInt, writeVerified } from "../../../components/views/account/accountShared.js";

const { button, div, span } = van.tags;

const STATION_WIDTH = 15;
const STATION_HEIGHT = 8;
const STATION_SLOT_COUNT = STATION_WIDTH * STATION_HEIGHT;
const SUSHI_SLOT_PATH = "Sushi[0]";
const SUSHI_PLATE_PATH = "Sushi[1]";
const SUSHI_FIREPLACE_PATH = "Sushi[3]";

const PLATES = { 0: "Normal plate", 1: "Red plate", 2: "Blue plate", 3: "Gold plate" };
const plateWord = (type) => PLATES[type] ?? `Plate ${type}`;

// The page counts tiers from 1, the game from 0 (-1 for an empty slot): tier 0 here is an empty slot.
const tierOf = (raw, maxTier) => Math.min(maxTier, toInt(raw, { min: -1 })) + 1;

// A slot: its tier (nothing when empty), its plate on its edge. A slot not unlocked can't be picked.
const SlotTile = ({ index, slot, editor }) =>
    button(
        {
            ...editor.squareProps(index),
            class: () =>
                [
                    "sushi-station-tile",
                    `sushi-station-tile--plate-${slot.plate.val}`,
                    editor.picked.val === index && "sushi-station-tile--selected",
                ]
                    .filter(Boolean)
                    .join(" "),
            disabled: () => slot.plate.val === -1,
            "aria-label": () =>
                `Slot ${index + 1}, ${plateWord(slot.plate.val)}, ${slot.tier.val ? `tier ${slot.tier.val}` : "empty"}`,
        },
        () => (slot.tier.val ? String(slot.tier.val) : "")
    );

function SushiStationTab() {
    const { loading, error, run } = useAccountLoad({ label: "Sushi Station" });
    const slots = Array.from({ length: STATION_SLOT_COUNT }, () => ({
        tier: van.state(0),
        plate: van.state(-1),
    }));
    const fireplaceStates = Array.from({ length: STATION_WIDTH }, () => van.state(-1));
    // The highest tier the game has (its Research[30] names, counted from 1).
    const maxTier = van.state(0);

    const SlotRow = (index) => {
        const slot = slots[index];
        const path = `${SUSHI_SLOT_PATH}[${index}]`;
        return ClampedLevelRow({
            valueState: slot.tier,
            writePath: path,
            write: async (tier) => {
                // The game's tier is one less; an empty slot is -1. Saved and read back as the game holds it.
                const saved = await writeVerified(path, tier - 1);
                return Number(saved) + 1;
            },
            max: () => maxTier.val,
            integerMode: "round",
            name: "Tier",
            renderBadge: () => plateWord(slot.plate.val),
            maxAction: true,
            unset: 0,
        });
    };

    const editor = createBoardEditor({
        id: "sushi-station-editor",
        title: (index) => `Slot ${index + 1}`,
        row: SlotRow,
    });

    const load = async () =>
        run(async () => {
            const [rawSlots, rawPlates, rawFireplaces, rawKnowledgeNames] = await Promise.all([
                gga(SUSHI_SLOT_PATH),
                gga(SUSHI_PLATE_PATH),
                gga(SUSHI_FIREPLACE_PATH),
                readCList("Research[30]"),
            ]);
            const held = toIndexedArray(rawSlots ?? []);
            const plates = toIndexedArray(rawPlates ?? []);
            const fireplaces = toIndexedArray(rawFireplaces ?? []);
            maxTier.val =
                toIndexedArray(rawKnowledgeNames ?? []).reduce(
                    (maxIndex, rawName, index) => (String(rawName ?? "").trim() ? index : maxIndex),
                    -1
                ) + 1;

            for (let index = 0; index < STATION_SLOT_COUNT; index++) {
                slots[index].tier.val = tierOf(held[index] ?? -1, maxTier.val - 1);
                slots[index].plate.val = toInt(plates[index], { min: -1 });
            }
            for (let column = 0; column < STATION_WIDTH; column++)
                fireplaceStates[column].val = toInt(fireplaces[column], { min: -1 });
            if (editor.picked.val !== null && slots[editor.picked.val].plate.val === -1) editor.close();
        });

    load();

    const board = div(
        { class: "sushi-station-board-wrap" },
        div(
            { class: "sushi-station-board", style: `--sushi-station-width: ${STATION_WIDTH};` },
            ...slots.map((slot, index) => SlotTile({ index, slot, editor })),
            // The fireplaces under the columns, read only.
            ...fireplaceStates.map((fireplace, column) =>
                span(
                    {
                        class: () =>
                            ["sushi-fireplace-cell", fireplace.val === -1 && "sushi-fireplace-cell--empty"]
                                .filter(Boolean)
                                .join(" "),
                        "aria-label": () => `Fireplace ${column + 1}: ${fireplace.val}`,
                    },
                    () => (fireplace.val === -1 ? "" : String(fireplace.val))
                )
            )
        )
    );
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Station",
        automation: { page: "automation.sushi" },
        description: "The tier on each slot of the station. Pick a slot to set it; 0 empties it.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the station",
        errorTitle: "Couldn't read the station",
        initialWrapperClass: "account-list",
        body: div({ class: "account-list account-list--tabbed" }, ListPanel({ body: editor.wrap(board) })),
    });
}

export default definePage({
    id: "w7.sushistation.station",
    world: 7,
    system: "Sushi Station",
    tab: "Station",
    description: "The tier of each sushi slot, with plates and fireplaces shown.",
    keywords: ["Sushi", "Slots", "Plates"],
    component: SushiStationTab,
});
