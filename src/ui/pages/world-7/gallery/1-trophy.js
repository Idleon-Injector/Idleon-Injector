/**
 * W7 - Gallery: Trophy
 *
 * One list of every trophy the game has, each with an In gallery switch, then any slot value the game doesn't know
 * (the Hat Rack's way). On puts the trophy in the first empty slot; off empties its slot. Empty slots stay where they
 * are. Add all sits in the tray and fills empty slots with the trophies the top bar's search shows.
 *
 * Data sources:
 *   gga.Spelunk[16][s]       - gallery slot s: a trophy's number, or -1 when empty
 *   gga.ItemDefinitionsGET.h - TrophyN item definitions, for names
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga } from "../../../services/api.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    oneAtATime,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div, span } = van.tags;

const TROPHY_SLOTS_PATH = "Spelunk[16]";
const ITEM_DEFS_PATH = "ItemDefinitionsGET.h";
const TROPHY_KEY_PATTERN = /^Trophy(\d+)$/;
const EMPTY = -1;

const normalizeSlotValues = (rawSlots) =>
    toIndexedArray(rawSlots ?? []).map((entry) => {
        const numeric = Number(entry);
        return Number.isFinite(numeric) ? Math.round(numeric) : entry;
    });

const buildTrophyCatalog = (rawItemDefs) =>
    Object.entries(rawItemDefs && typeof rawItemDefs === "object" ? rawItemDefs : {})
        .map(([itemId, raw]) => {
            const match = itemId.match(TROPHY_KEY_PATTERN);
            if (!match) return null;
            const def = unwrapH(raw);
            return {
                key: itemId,
                value: Number(match[1]),
                name: cleanName(def?.displayName || def?.DisplayName || def?.name || def?.Name || def?.desc_line1, ""),
                known: true,
            };
        })
        .filter((entry) => entry?.name)
        .sort((a, b) => a.value - b.value);

// One trophy: its name, and an In gallery switch. A slot value the game doesn't know says so before its switch.
const TrophyRow = ({ trophy, isOn, onFlip }) =>
    AccountRow({
        info: span({ class: "account-row__name" }, trophy.name),
        badge: trophy.known ? null : "Not a known trophy",
        controls: StateSwitch({
            checked: isOn,
            words: ["In gallery", ""],
            name: `${trophy.name} in gallery`,
            ownStatus: true,
            onFlip,
        }),
    });

const TrophyTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Trophies" });
    const slots = van.state([]);
    const trophies = van.state([]);
    const bulk = useWriteStatus();
    // Changes run one at a time, each from the slots the game holds when its turn comes.
    const inTurn = oneAtATime();
    const listNode = div();
    const rowOf = new Map();
    let catalog = [];

    const inGallery = (trophy) => slots.val.includes(trophy.value);

    const applySlots = (rawSlots) => {
        slots.val = normalizeSlotValues(rawSlots);
        // Every trophy the game has, then any slot value it doesn't know.
        const known = new Set(catalog.map((trophy) => trophy.value));
        const next = [
            ...catalog,
            ...slots.val
                .filter((value) => value !== EMPTY && !known.has(value))
                .map((value) => ({ key: `slot:${value}`, value, name: `Trophy ${value}`, known: false })),
        ];
        // Rows are kept by trophy, so a switch keeps its focus and its save's state.
        const keys = new Set(next.map((trophy) => trophy.key));
        for (const [key, row] of rowOf) {
            if (keys.has(key)) continue;
            row.remove();
            rowOf.delete(key);
        }
        let at = listNode.firstChild;
        for (const trophy of next) {
            if (!rowOf.has(trophy.key))
                rowOf.set(
                    trophy.key,
                    TrophyRow({
                        trophy,
                        isOn: () => inGallery(trophy),
                        onFlip: (on) => (on ? addTrophies([trophy]) : clearTrophy(trophy)),
                    })
                );
            const row = rowOf.get(trophy.key);
            if (row === at) at = at.nextSibling;
            else listNode.insertBefore(row, at);
        }
        trophies.val = next;
    };

    const load = () =>
        run(async () => {
            catalog = buildTrophyCatalog(await gga(ITEM_DEFS_PATH));
            applySlots(await gga(TROPHY_SLOTS_PATH));
        });

    // Every change starts from the slots the game holds now, so nothing it filled since the page read them is written
    // over; after any outcome the page shows what the game holds.
    const change = (task) =>
        inTurn(async () => {
            try {
                return (await task(normalizeSlotValues(await gga(TROPHY_SLOTS_PATH)))) ?? { ok: true };
            } finally {
                try {
                    applySlots(await gga(TROPHY_SLOTS_PATH));
                } catch {
                    // ponytail: the picture stays as it was; the next change reads the game again before it writes.
                }
            }
        });

    // Each trophy not in the gallery yet goes in the first empty slot, in order.
    const addTrophies = (list) =>
        change(async (now) => {
            const toAdd = list.filter((trophy) => !now.includes(trophy.value));
            if (!toAdd.length) return { cancelled: true };
            if (!now.includes(EMPTY)) throw new Error("No empty slot left.");
            let slot = 0;
            for (const trophy of toAdd) {
                while (slot < now.length && now[slot] !== EMPTY) slot++;
                if (slot >= now.length) break;
                await writeVerified(`${TROPHY_SLOTS_PATH}[${slot}]`, trophy.value);
                now[slot] = trophy.value;
            }
            return { ok: true };
        });

    const clearTrophy = (trophy) =>
        change(async (now) => {
            const slot = now.indexOf(trophy.value);
            if (slot < 0) return { cancelled: true };
            await writeVerified(`${TROPHY_SLOTS_PATH}[${slot}]`, EMPTY);
            return { ok: true };
        });

    // The trophies the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => trophies.val.filter((trophy) => shownBySearch(rowOf.get(trophy.key)));
    const missing = () => shown().filter((trophy) => trophy.known && !inGallery(trophy));
    const emptySlots = () => slots.val.filter((value) => value === EMPTY).length;
    const trophyWord = (n) => `troph${n === 1 ? "y" : "ies"}`;

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Trophy",
        description: "The trophies in your gallery. One goes in the first empty slot.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the gallery",
        errorTitle: "Couldn't read the gallery",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                empty: () => (trophies.val.length ? null : "No trophies found"),
                // Adding only fills empty slots, so it runs on one press.
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Add all",
                            status: bulk.status,
                            disabled: () => loading.val || !missing().length || !emptySlots(),
                            onClick: (e) => {
                                e.preventDefault();
                                const list = missing();
                                return bulk.run(() => addTrophies(list));
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    const empty = emptySlots();
                    return `${isSearching() ? `${n} matching ${trophyWord(n)}` : `All ${n} ${trophyWord(n)}`} · ${empty} empty slot${empty === 1 ? "" : "s"}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w7.gallery.trophy",
    world: 7,
    system: "Gallery",
    tab: "Trophy",
    description: "The trophies in your gallery slots.",
    keywords: ["Trophies"],
    component: TrophyTab,
});
