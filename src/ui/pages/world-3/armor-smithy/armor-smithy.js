/**
 * W3 - Smithy Tab (Armor Set Smithy)
 *
 * Reverse-engineered from:
 *   gga.CustomMaps(.h).EquipmentSets      - set definitions
 *   gga.CustomLists(.h).RANDOlist[113]    - smithy display/order list
 *   gga.EquipmentOrder[0/1]               - currently equipped parts
 *   gga.OptionsListAccount[379]           - permanently stored/unlocked set keys (comma list)
 *
 * One list of every set in the game's order, each with an Unlocked switch. Unlock all sits in the tray and unlocks the
 * sets the top bar's search shows.
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
    createStaticRowReconciler,
    oneAtATime,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { toIndexedArray } from "../../../utils/index.js";

const { div, span } = van.tags;

const EQUIP_SETS_PATHS = ["CustomMaps.h.EquipmentSets", "CustomMaps.EquipmentSets"];
const SET_ORDER_PATHS = ["CustomLists.h.RANDOlist[113]", "CustomLists.RANDOlist[113]"];
const STORED_SETS_PATH = "OptionsListAccount[379]";
const EQUIPPED_MAIN_PATH = "EquipmentOrder[0]";
const EQUIPPED_EXTRA_PATH = "EquipmentOrder[1]";

const cleanText = (txt, fallback = "") =>
    String(txt ?? fallback)
        .replace(/_SET$/i, "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();

const getSetDisplayName = (setKey) => `${cleanText(setKey)} Set`.replace(/\s+Set Set$/i, " Set");

const normalizeStringList = (raw) =>
    toIndexedArray(raw ?? [])
        .map((entry) => String(entry ?? "").trim())
        .filter((entry) => entry.length > 0);

const parseStoredSets = (raw) =>
    String(raw ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0 && entry !== "0");

const uniq = (arr) => {
    const out = [];
    const seen = new Set();
    for (const item of arr) {
        if (seen.has(item)) continue;
        seen.add(item);
        out.push(item);
    }
    return out;
};

const normalizeStoredSetKeys = (rawOrList) => {
    if (Array.isArray(rawOrList)) {
        return uniq(
            rawOrList.map((entry) => String(entry ?? "").trim()).filter((entry) => entry.length > 0 && entry !== "0")
        );
    }
    return uniq(parseStoredSets(rawOrList));
};

const toObject = (raw) => {
    const value = unwrapH(raw);
    return value && typeof value === "object" ? value : {};
};

const isSetCompletedNow = (setKey, equipSets, equippedMainSet, equippedExtraSet) => {
    const setData = toIndexedArray(unwrapH(equipSets?.[setKey]) ?? []);
    if (!Array.isArray(setData) || setData.length === 0) return false;

    const mainParts = normalizeStringList(unwrapH(setData[0]));
    const extraParts = normalizeStringList(unwrapH(setData[1]));
    const optionalParts = normalizeStringList(unwrapH(setData[2]));
    const meta = toIndexedArray(unwrapH(setData[3]) ?? []);

    const extraCap = Math.max(0, Number(meta[0] ?? 0) || 0);
    const needsOptionalOne = Number(meta[1] ?? 0) === 1;

    let partsOn = 0;
    let extraMatched = 0;

    for (const itemId of mainParts) {
        if (equippedMainSet.has(itemId)) partsOn++;
    }

    for (const itemId of extraParts) {
        if (equippedExtraSet.has(itemId) && extraMatched < extraCap) {
            partsOn++;
            extraMatched++;
        }
    }

    if (needsOptionalOne) {
        for (const itemId of optionalParts) {
            if (equippedMainSet.has(itemId)) {
                partsOn++;
                break;
            }
        }
    }

    const partsReq = mainParts.length + extraCap + (needsOptionalOne ? 1 : 0);
    return partsOn >= partsReq;
};

const buildSmithyState = ({ rawEquipSets, rawSetOrder, rawStoredSets, rawEquippedMain, rawEquippedExtra }) => {
    const equipSets = toObject(rawEquipSets);
    const storedSets = uniq(parseStoredSets(rawStoredSets));
    const storedSetKeys = new Set(storedSets);
    const equippedMainSet = new Set(normalizeStringList(rawEquippedMain));
    const equippedExtraSet = new Set(normalizeStringList(rawEquippedExtra));

    const normalizedSetOrder = normalizeStringList(rawSetOrder);
    const orderedSetKeys = uniq(normalizedSetOrder.length > 0 ? normalizedSetOrder : Object.keys(equipSets));

    const allSets = orderedSetKeys.map((setKey) => {
        const completedNow = isSetCompletedNow(setKey, equipSets, equippedMainSet, equippedExtraSet);
        const stored = storedSetKeys.has(setKey);
        return {
            setKey,
            displayName: getSetDisplayName(setKey),
            completedNow,
            stored,
            unlocked: stored || completedNow,
        };
    });

    const byKey = new Map(allSets.map((entry) => [entry.setKey, entry]));

    const storedRows = storedSets.map((setKey, index) => {
        const known = byKey.get(setKey);
        return {
            index,
            setKey,
            displayName: known?.displayName ?? getSetDisplayName(setKey),
            completedNow: known?.completedNow ?? false,
            known: Boolean(known),
        };
    });

    const addableSets = allSets.filter((entry) => !entry.stored);
    const unlockedCount = allSets.filter((entry) => entry.unlocked).length;

    return {
        allSets,
        storedRows,
        addableSets,
        storedSetKeys: storedSets,
        totalSetCount: allSets.length,
        unlockedCount,
        lockedCount: allSets.length - unlockedCount,
    };
};

const encodeStoredSets = (setKeys) => {
    const normalized = uniq(
        setKeys.map((setKey) => String(setKey ?? "").trim()).filter((setKey) => setKey.length > 0 && setKey !== "0")
    );
    return normalized.length > 0 ? ["0", ...normalized].join(",") : "0";
};

const readWithFallback = async (paths) => {
    let lastError = null;
    for (const path of paths) {
        try {
            return await gga(path);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError ?? new Error("Failed to read required game data");
};

// One set: its name, what it is now in plain words, and an Unlocked switch that stores it in the Smithy or takes it out.
const SmithyRow = ({ set, isOn, onFlip }) =>
    AccountRow({
        rowClass: "smithy-row",
        rowProps: { "data-set": set.setKey },
        info: span({ class: "account-row__name" }, set.displayName),
        // Worn in full, a set counts in the game even when the Smithy doesn't hold it.
        badge: set.completedNow ? "Equipped" : set.known ? null : "Not in game",
        controls: StateSwitch({
            checked: isOn,
            words: ["Unlocked", ""],
            name: `${set.displayName} unlocked`,
            ownStatus: true,
            onFlip,
        }),
    });

const SmithyTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Smithy" });
    const currentStoredSetKeys = van.state([]);
    const sets = van.state([]);
    const bulk = useWriteStatus();
    // Changes run one at a time, each from the sets the game holds when its turn comes.
    const inTurn = oneAtATime();
    const listNode = div({ class: "account-page-pane" });
    const reconcileRows = createStaticRowReconciler(listNode);
    const rowOf = new Map();

    const applySmithyState = (rawLoadedData) => {
        const result = buildSmithyState(rawLoadedData);
        currentStoredSetKeys.val = [...result.storedSetKeys];
        // Every set in the game's order, then any set the Smithy holds that the game no longer lists.
        const known = new Set(result.allSets.map((entry) => entry.setKey));
        const next = [
            ...result.allSets.map((entry) => ({ ...entry, known: true })),
            ...result.storedRows.filter((entry) => !known.has(entry.setKey)),
        ];
        reconcileRows(next.map((entry) => `${entry.setKey}:${entry.completedNow ? 1 : 0}`).join("|"), () =>
            next.map((entry) => {
                const row = SmithyRow({
                    set: entry,
                    isOn: () => currentStoredSetKeys.val.includes(entry.setKey),
                    onFlip: (on) =>
                        change((stored) =>
                            on
                                ? stored.includes(entry.setKey)
                                    ? stored
                                    : [...stored, entry.setKey]
                                : stored.filter((key) => key !== entry.setKey)
                        ),
                });
                rowOf.set(entry.setKey, row);
                return row;
            })
        );
        sets.val = next;
    };

    const load = async () => {
        return run(async () => {
            const [rawEquipSets, rawSetOrder, rawStoredSets, rawEquippedMain, rawEquippedExtra] = await Promise.all([
                readWithFallback(EQUIP_SETS_PATHS),
                readWithFallback(SET_ORDER_PATHS),
                gga(STORED_SETS_PATH),
                gga(EQUIPPED_MAIN_PATH),
                gga(EQUIPPED_EXTRA_PATH),
            ]);

            applySmithyState({
                rawEquipSets,
                rawSetOrder,
                rawStoredSets,
                rawEquippedMain,
                rawEquippedExtra,
            });
        });
    };

    // Every change starts from the sets the game holds now, so a set the game stored since the page read them is
    // kept. After any outcome the page reads the game again.
    const change = (build) =>
        inTurn(async () => {
            try {
                const stored = normalizeStoredSetKeys(await gga(STORED_SETS_PATH));
                const next = build(stored);
                if (next.length === stored.length) return { cancelled: true };
                await writeVerified(STORED_SETS_PATH, encodeStoredSets(next));
                return { ok: true };
            } finally {
                await load();
            }
        });

    // The sets the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => sets.val.filter((entry) => shownBySearch(rowOf.get(entry.setKey)));
    const locked = () => shown().filter((entry) => entry.known && !currentStoredSetKeys.val.includes(entry.setKey));
    const setWord = (n) => `set${n === 1 ? "" : "s"}`;

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Armor Smithy",
        description: "Armor sets unlocked in the Smithy. A set worn in full counts too.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the smithy",
        errorTitle: "Couldn't read the smithy",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                // Unlocking only adds, so it runs on one press.
                tools: () =>
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({
                            label: "Unlock all",
                            status: bulk.status,
                            disabled: () => loading.val || !locked().length,
                            onClick: (e) => {
                                e.preventDefault();
                                const keys = locked().map((entry) => entry.setKey);
                                return bulk.run(() =>
                                    change((stored) => [...stored, ...keys.filter((key) => !stored.includes(key))])
                                );
                            },
                        })
                    ),
                toolsLabel: () => {
                    const n = shown().length;
                    const on = shown().filter((entry) => currentStoredSetKeys.val.includes(entry.setKey)).length;
                    return `${isSearching() ? `${n} matching ${setWord(n)}` : `All ${n} ${setWord(n)}`} · ${on} unlocked`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w3.armorsmithy",
    world: 3,
    system: "Armor Smithy",
    description: "Armor sets unlocked in the Armor Smithy.",
    keywords: ["Smithy", "Armor sets"],
    component: SmithyTab,
});
