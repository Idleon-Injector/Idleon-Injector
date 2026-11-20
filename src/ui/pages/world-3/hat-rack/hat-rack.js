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
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AddFromListSection } from "../../../components/views/account/components/AddFromListSection.js";
import { RemovableStoredRow } from "../../../components/views/account/components/RemovableStoredRow.js";
import {
    cleanName,
    createKeptRows,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div } = van.tags;

const RACK_PATH = "Spelunk[46]";
const SLAB_HISTORY_PATH = "Cards[1]";
const ITEM_DEFS_PATH = "ItemDefinitionsGET.h";

const normalizeRackIds = (rawRack) =>
    toIndexedArray(rawRack ?? [])
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0);

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

const RackRow = ({ row, onRemove }) => {
    return RemovableStoredRow({
        index: row.index,
        primaryLabel: row.name,
        fallbackLabel: row.itemId,
        secondaryLabel: row.itemId,
        badge: "On rack",
        rowClass: "hat-rack-row",
        nameGroupClass: "hat-rack-row__name-group",
        onRemove,
        isBusy: onRemove.isBusy,
    });
};

const HatRackTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Hat Rack" });
    const currentRackIds = van.state([]);
    const rackRows = van.state([]);
    const missingOptions = van.state([]);
    const selectedAddItemId = van.state("");
    const eligibleCount = van.state(0);
    const onRackCount = van.state(0);
    const missingCount = van.state(0);
    const rackCount = van.state(0);
    const mutating = van.state(false);

    const { status: addStatus, run: runAdd } = useWriteStatus();
    let itemDefsCache = null;
    let scrollEl = null;

    const withPreservedScroll = (fn) => {
        const prevTop = scrollEl?.scrollTop ?? 0;
        fn();
        requestAnimationFrame(() => {
            if (scrollEl) scrollEl.scrollTop = prevTop;
        });
    };

    const applyRackState = (rackIds) => {
        const result = buildHatRackState(rackIds, itemDefsCache);
        currentRackIds.val = [...normalizeRackIds(rackIds)];
        rackRows.val = result.rack;
        missingOptions.val = result.missingFromRack;
        eligibleCount.val = result.eligible.length;
        onRackCount.val = result.onRack.length;
        missingCount.val = result.missingFromRack.length;
        rackCount.val = result.rack.length;

        if (!result.missingFromRack.some((item) => item.itemId === selectedAddItemId.val)) {
            selectedAddItemId.val = result.missingFromRack[0]?.itemId ?? "";
        }
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
            throw new Error("Hat Rack or Slab history is unavailable. Refresh to try again.");
        }
        return { rack: normalizeRackIds(rawRack), slab: normalizeRackIds(rawSlab) };
    };

    // After any outcome the page shows what the game holds. A row whose hat and place are unchanged keeps its node,
    // so a failed removal still has its row to say so.
    const showGame = async () => {
        try {
            const { rack } = await readLists();
            if (JSON.stringify(rack) !== JSON.stringify(currentRackIds.val)) {
                withPreservedScroll(() => applyRackState(rack));
            }
        } catch {
            // ponytail: the picture stays as it was; the next change reads the game again before it writes.
        }
    };

    const change = async (task) => {
        mutating.val = true;
        try {
            return await task(await readLists());
        } finally {
            await showGame();
            mutating.val = false;
        }
    };

    const appendToRack = async (baseRack, items) => {
        for (let i = 0; i < items.length; i++) {
            await writeVerified(`${RACK_PATH}[${baseRack.length + i}]`, items[i]);
        }
        await writeVerified(`${RACK_PATH}.length`, baseRack.length + items.length);
    };

    const removeAtIndex = async (index) => {
        if (mutating.val) return;
        const itemId = currentRackIds.val[index];
        if (itemId === undefined) return;

        await change(async ({ rack, slab }) => {
            // The Slab first: if the rack write then fails, the row is still on the page to say so.
            const nextSlab = slab.filter((id) => id !== itemId);
            if (nextSlab.length !== slab.length) await writeVerified(SLAB_HISTORY_PATH, nextSlab);
            const at = rack[index] === itemId ? index : rack.indexOf(itemId);
            const nextRack = rack.filter((_, i) => i !== at);
            if (at >= 0) await writeVerified(RACK_PATH, nextRack);
        });
    };
    removeAtIndex.isBusy = () => mutating.val;
    const keptRows = createKeptRows((row) => RackRow({ row, onRemove: removeAtIndex }));

    const addSelected = async () => {
        const itemId = selectedAddItemId.val;
        if (!itemId || mutating.val) return;

        await runAdd(() =>
            change(async ({ rack, slab }) => {
                if (rack.includes(itemId)) return { cancelled: true };
                await appendToRack(rack, [itemId]);
                if (!slab.includes(itemId)) await writeVerified(SLAB_HISTORY_PATH, [...slab, itemId]);
            })
        );
    };

    const addAllAvailable = async () => {
        if (mutating.val || missingOptions.val.length === 0) return;
        await runAdd(() =>
            change(async ({ rack, slab }) => {
                const toAdd = missingOptions.val.map((item) => item.itemId).filter((id) => !rack.includes(id));
                if (toAdd.length === 0) return { cancelled: true };
                await appendToRack(rack, toAdd);
                const newInSlab = toAdd.filter((id) => !slab.includes(id));
                if (newInSlab.length) await writeVerified(SLAB_HISTORY_PATH, [...slab, ...newInSlab]);
            })
        );
    };

    load();

    const body = div(
        {
            class: "scrollable-panel content-stack",
        },

        AddFromListSection({
            title: "Add eligible hat",
            note: () => `${missingCount.val} available to add`,
            selectLabel: "Select hat",
            selectedValue: selectedAddItemId,
            options: missingOptions,
            emptyOptionLabel: "No eligible hats left to add",
            getOptionValue: (item) => item.itemId,
            getOptionLabel: (item) => `${item.name} (${item.itemId})`,
            addStatus,
            addDisabled: () => mutating.val || !selectedAddItemId.val || missingOptions.val.length === 0,
            addAllDisabled: () => mutating.val || missingOptions.val.length === 0,
            onAdd: addSelected,
            onAddAll: addAllAvailable,
            rowClass: "tab-add-row tab-add-row--dual-action",
        }),

        AccountSection({
            title: "On rack",
            note: () => `${rackCount.val} on rack, ${onRackCount.val}/${eligibleCount.val} total`,
            body: () => div({ class: "hat-rack-rows" }, ...keptRows(rackRows.val)),
        })
    );
    scrollEl = body;

    return PersistentAccountListPage({
        title: "Hat Rack",
        description:
            "Manage Hat rack entries. Remove any rack hat, or add eligible premium helmets. Rack changes also sync Slab history (Cards[1]).",
        actions: RefreshButton({
            onRefresh: () => {
                if (mutating.val) return;
                load();
            },
            disabled: () => loading.val || mutating.val,
        }),
        state: { loading, error },
        loadingText: "Reading Hat Rack",
        errorTitle: "Hat Rack read failed",
        initialWrapperClass: "scrollable-panel",
        body,
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
