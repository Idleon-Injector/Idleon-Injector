/**
 * W3 - Hat Rack Tab
 *
 * Reverse-engineered from:
 *   gga.Spelunk[46] - current rack item ids
 *   gga.Cards[1] - slab history item ids
 *   gga.ItemDefinitionsGET.h - item definitions map
 *
 * Eligible hats:
 *   Type === "PREMIUM_HELMET" && typeGen === "aHelmetMTX"
 *
 * One list of every premium hat, each with an On rack switch, then any other hat the rack holds. Add all sits in the
 * tray and puts the hats the top bar's search shows on the rack.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import {
    cleanName,
    createStaticRowReconciler,
    oneAtATime,
    unwrapH,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div, span } = van.tags;

const RACK_PATH = "Spelunk[46]";
const SLAB_HISTORY_PATH = "Cards[1]";
const ITEM_DEFS_PATH = "ItemDefinitionsGET.h";

const normalizeRackIds = (rawRack) =>
    toIndexedArray(rawRack ?? [])
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0);

const isEligibleHat = (raw) => {
    const def = unwrapH(raw);
    return def?.Type === "PREMIUM_HELMET" && def?.typeGen === "aHelmetMTX";
};

const buildHatRackState = (rawRack, rawItemDefs) => {
    const itemDefs = rawItemDefs && typeof rawItemDefs === "object" ? rawItemDefs : {};
    const rack = normalizeRackIds(rawRack);

    const eligible = Object.entries(itemDefs)
        .map(([itemId, raw]) => {
            const def = unwrapH(raw);
            return {
                itemId,
                name: cleanName(def?.displayName || itemId, "", { stripMarker: true }),
                type: def?.Type,
                typeGen: def?.typeGen,
                id: def?.ID,
            };
        })
        .filter((x) => x.type === "PREMIUM_HELMET" && x.typeGen === "aHelmetMTX")
        .sort((a, b) => a.name.localeCompare(b.name));

    const rackSet = new Set(rack);
    const eligibleIds = new Set(eligible.map((x) => x.itemId));
    const eligibleMap = Object.fromEntries(eligible.map((x) => [x.itemId, x]));

    const onRack = eligible.filter((x) => rackSet.has(x.itemId));
    const missingFromRack = eligible.filter((x) => !rackSet.has(x.itemId));

    const rackTable = rack.map((itemId, index) => ({
        index,
        itemId,
        name: cleanName(unwrapH(itemDefs[itemId])?.displayName || itemId, "", { stripMarker: true }),
        eligible: eligibleIds.has(itemId),
        id: eligibleMap[itemId]?.id ?? unwrapH(itemDefs[itemId])?.ID ?? null,
    }));

    return {
        eligible,
        onRack,
        missingFromRack,
        rack: rackTable,
    };
};

// One hat: its name, and an On rack switch that puts it on the rack or takes it off.
const HatRow = ({ hat, isOn, onFlip }) =>
    AccountRow({
        rowClass: "hat-rack-row",
        rowProps: { "data-item": hat.itemId },
        info: span({ class: "account-row__name" }, hat.name),
        badge: hat.eligible ? null : "Not a premium hat",
        controls: StateSwitch({
            checked: isOn,
            words: ["On rack", ""],
            name: `${hat.name} on rack`,
            ownStatus: true,
            onFlip,
        }),
    });

const HatRackTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Hat Rack" });
    const currentRackIds = van.state([]);
    const hats = van.state([]);
    const bulk = useWriteStatus();
    // Changes run one at a time, each from the lists the game holds when its turn comes.
    const inTurn = oneAtATime();
    const listNode = div({ class: "account-page-pane" });
    const reconcileRows = createStaticRowReconciler(listNode);
    const rowOf = new Map();
    let itemDefsCache = null;

    const applyRackState = (rackIds) => {
        const result = buildHatRackState(rackIds, itemDefsCache);
        currentRackIds.val = [...normalizeRackIds(rackIds)];
        // Every premium hat, then any other hat the rack holds.
        const eligibleIds = new Set(result.eligible.map((entry) => entry.itemId));
        const next = [
            ...result.eligible.map((entry) => ({ itemId: entry.itemId, name: entry.name, eligible: true })),
            ...result.rack
                .filter((entry) => !eligibleIds.has(entry.itemId))
                .map((entry) => ({ itemId: entry.itemId, name: entry.name || entry.itemId, eligible: false })),
        ];
        reconcileRows(next.map((entry) => entry.itemId).join("|"), () =>
            next.map((entry) => {
                const row = HatRow({
                    hat: entry,
                    isOn: () => currentRackIds.val.includes(entry.itemId),
                    onFlip: (on) => (on ? addHats([entry.itemId]) : removeHat(entry.itemId)),
                });
                rowOf.set(entry.itemId, row);
                return row;
            })
        );
        hats.val = next;
    };

    const load = async () => {
        return run(async () => {
            let nextItemDefs = itemDefsCache;
            if (!nextItemDefs) {
                const defs = await gga(ITEM_DEFS_PATH);
                nextItemDefs = defs && typeof defs === "object" ? defs : {};
            }

            const rawRack = await gga(RACK_PATH);

            itemDefsCache = nextItemDefs;
            applyRackState(rawRack);
        });
    };

    // The rack and the Slab as the game holds them now. Every change starts from these, so nothing the game added
    // since the page read them is written over.
    const readLists = async () => {
        const [rawRack, rawSlab] = await Promise.all([gga(RACK_PATH), gga(SLAB_HISTORY_PATH)]);
        if (rawRack === null || rawRack === undefined || rawSlab === null || rawSlab === undefined) {
            throw new Error("Couldn't read the rack. Refresh.");
        }
        return { rack: normalizeRackIds(rawRack), slab: normalizeRackIds(rawSlab), slabRead: rawSlab };
    };

    // After any outcome the page shows what the game holds.
    const showGame = async () => {
        try {
            const { rack } = await readLists();
            if (JSON.stringify(rack) !== JSON.stringify(currentRackIds.val)) applyRackState(rack);
        } catch {
            // ponytail: the picture stays as it was; the next change reads the game again before it writes.
        }
    };

    const change = (task) =>
        inTurn(async () => {
            try {
                const outcome = await task(await readLists());
                return outcome ?? { ok: true };
            } finally {
                await showGame();
            }
        });

    const appendToRack = async (baseRack, items) => {
        for (let i = 0; i < items.length; i++) {
            await writeVerified(`${RACK_PATH}[${baseRack.length + i}]`, items[i]);
        }
        await writeVerified(`${RACK_PATH}.length`, baseRack.length + items.length);
    };

    // The game refuses the Slab write ("changed since") if it added to the Slab after the read, so nothing it added
    // is written over; the page reads the game again and the next flip starts from that.
    const writeSlab = (slabRead, next) =>
        writeManyVerified([{ path: SLAB_HISTORY_PATH, value: next, expect: slabRead }]);
    // Every eligible hat on the rack goes in the Slab, so one an earlier add placed but couldn't add there (it
    // failed between the two writes) is added by the next add.
    const addToSlab = async ({ slab, slabRead }, rack) => {
        const missing = rack.filter(
            (id, i) => rack.indexOf(id) === i && !slab.includes(id) && isEligibleHat(itemDefsCache?.[id])
        );
        if (missing.length) await writeSlab(slabRead, [...slab, ...missing]);
    };

    const removeHat = (itemId) =>
        change(async ({ rack, slab, slabRead }) => {
            // The Slab first: if the rack write then fails, the hat still shows on the rack, and the switch says why.
            const nextSlab = slab.filter((id) => id !== itemId);
            if (nextSlab.length !== slab.length) await writeSlab(slabRead, nextSlab);
            if (rack.includes(itemId))
                await writeVerified(
                    RACK_PATH,
                    rack.filter((id) => id !== itemId)
                );
        });

    const addHats = (itemIds) =>
        change(async (lists) => {
            const toAdd = itemIds.filter((id) => !lists.rack.includes(id));
            if (!toAdd.length) return { cancelled: true };
            await appendToRack(lists.rack, toAdd);
            await addToSlab(lists, [...lists.rack, ...toAdd]);
            return { ok: true };
        });

    // The hats the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => hats.val.filter((entry) => shownBySearch(rowOf.get(entry.itemId)));
    const offRack = () => shown().filter((entry) => entry.eligible && !currentRackIds.val.includes(entry.itemId));
    const hatWord = (n) => `hat${n === 1 ? "" : "s"}`;

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Hat Rack",
        description: "Premium hats on the Hat Rack. A change here also updates the Slab.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the hat rack",
        errorTitle: "Couldn't read the hat rack",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                // Adding only puts hats on, so it runs on one press.
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Add all",
                            status: bulk.status,
                            disabled: () => loading.val || !offRack().length,
                            onClick: (e) => {
                                e.preventDefault();
                                const ids = offRack().map((entry) => entry.itemId);
                                return bulk.run(() => addHats(ids));
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    const on = shown().filter((entry) => currentRackIds.val.includes(entry.itemId)).length;
                    return `${isSearching() ? `${n} matching ${hatWord(n)}` : `All ${n} ${hatWord(n)}`} · ${on} on the rack`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w3.hatrack",
    world: 3,
    system: "Hat Rack",
    description: "Premium hats on the Hat Rack.",
    keywords: ["Hats"],
    component: HatRackTab,
});
