/**
 * W5 - Sailing › Captains
 *
 * Data sources:
 *   gga.Captains[c][0]          - rarity (0 to 6; -1 is an empty slot)
 *   gga.Captains[c][1], [2]     - the kind of its first and second bonus (an index into CaptainBonuses)
 *   gga.Captains[c][3], [4]     - level and EXP
 *   gga.Captains[c][5], [6]     - the first and second bonus's amount
 *   cList.CaptainBonuses[k][3]  - the bonus kind in the game's words ("+{%_Boat_Speed")
 *
 * Slots 0-29 are the captains you have, 30 and up the Recruitment pool's offers. One line per captain, its bonuses
 * first; its name opens the two bonus kinds in place, each a step picker that saves on a pick. A bonus amount stops at
 * the most its rarity rolls for that kind.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    createStaticRowReconciler,
    toInt,
    toNum,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";

const { button, div, span } = van.tags;

const OWNED_SLOTS = 30;
// The most each rarity (0 to 6) rolls for each bonus kind, as the game rolls it.
const BONUS_MAX = [
    [4, 11, 18, 26, 33, 40, 47],
    [7, 19, 31, 43, 55, 67, 79],
    [7, 19, 31, 43, 55, 67, 79],
    [3, 9, 15, 21, 27, 33, 39],
    [3, 7, 12, 17, 22, 27, 31],
];
const FIELDS = [
    { key: "rarity", label: "Rarity", index: 0, max: 6 },
    { key: "level", label: "Level", index: 3 },
    { key: "exp", label: "EXP", index: 4, formatted: true, quiet: true },
    { key: "bonus1", label: "Bonus 1", index: 5, kind: 1 },
    { key: "bonus2", label: "Bonus 2", index: 6, kind: 2 },
];
const KIND_PICKS = [
    { slot: 1, label: "First bonus" },
    { slot: 2, label: "Second bonus" },
];

// "+{%_Cloud_Discover_Rate" -> "Cloud Discover Rate %"
const kindName = (raw, index) => bonusText(raw) || `Bonus ${index + 1}`;

const CaptainsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Captains" });
    const kinds = van.state([]);
    const states = new Map();
    const stateOf = (slot) => {
        if (!states.has(slot))
            states.set(slot, {
                ...Object.fromEntries(FIELDS.map((field) => [field.key, van.state(0)])),
                kind1: van.state(0),
                kind2: van.state(0),
            });
        return states.get(slot);
    };
    const openSlot = van.state(-1);
    const poolCount = van.state(0);
    const ownedNode = div();
    const poolNode = div();
    const reconcileOwned = createStaticRowReconciler(ownedNode);
    const reconcilePool = createStaticRowReconciler(poolNode);

    // A kind in a word or two ("Boat Speed"): the title holds two of them.
    const kindLabel = (index) => kinds.val[index]?.short ?? `Bonus ${index + 1}`;

    // A bonus kind: a step picker that saves on a pick, like a sigil's tier.
    const KindRow = (slot, pick) => {
        const kindState = stateOf(slot)[`kind${pick.slot}`];
        const picked = van.state(kindState.val);
        const path = `Captains[${slot}][${pick.slot}]`;
        const { status, reason, save, handlers, undo } = useAutoSave({
            capture: () => picked.val,
            prepare: (kind = picked.val) => {
                if (kind === kindState.val) return { unchanged: true };
                return {
                    write: async () => {
                        try {
                            await writeVerified(path, kind);
                        } catch (saveError) {
                            // The picker shows the kind the game holds, so the same pick can be tried again.
                            kindState.val = toInt(await gga(path).catch(() => kindState.val), { min: 0 });
                            if (picked.val === kind) picked.val = kindState.val;
                            throw saveError;
                        }
                        kindState.val = kind;
                    },
                };
            },
            revert: () => (picked.val = kindState.val),
        });
        van.derive(() => (picked.val = kindState.val));
        return AccountRow({
            rowClass: () => saveStateClass(status.val, undo),
            rowProps: handlers,
            info: span({ class: "account-row__name" }, pick.label),
            controls: [
                SaveState({ status, reason, undo }),
                StepPicker({
                    name: `Captain ${slot + 1} ${pick.label.toLowerCase()}`,
                    className: "captain-kinds",
                    steps: kinds.val.map((kind) => ({ value: kind.index, label: kind.short })),
                    picked: () => picked.val,
                    onPick: (kind) => {
                        picked.val = kind;
                        void save();
                    },
                }),
            ],
        });
    };

    const CaptainRow = (slot) => {
        const state = stateOf(slot);
        const name = `Captain ${slot + 1}`;
        const isOpen = () => openSlot.val === slot;
        const at = (field) => `Captains[${slot}][${field.index}]`;
        const row = ValueTableRow({
            name,
            info: button(
                {
                    type: "button",
                    class: "row-opener",
                    "aria-expanded": () => String(isOpen()),
                    onclick: () => (openSlot.val = isOpen() ? -1 : slot),
                },
                RowTitles({
                    bonus: () => `${kindLabel(state.kind1.val)} · ${kindLabel(state.kind2.val)}`,
                    name,
                })
            ),
            fields: FIELDS.map((field) => ({
                ...field,
                valueState: state[field.key],
                paths: [at(field)],
                max: field.kind
                    ? () => BONUS_MAX[state[`kind${field.kind}`].val]?.[state.rarity.val] ?? Infinity
                    : field.max,
            })),
            read: async () => {
                const values = await Promise.all(FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(
                    FIELDS.map((field, i) => [
                        field.key,
                        field.formatted ? toNum(values[i], 0) : toInt(values[i], { min: 0 }),
                    ])
                );
            },
        });
        row.append(
            div({ class: "row-detail", hidden: () => !isOpen() }, ...KIND_PICKS.map((pick) => KindRow(slot, pick)))
        );
        return row;
    };

    const load = async () =>
        run(async () => {
            const [rawCaptains, rawKinds] = await Promise.all([gga("Captains"), readCList("CaptainBonuses")]);
            kinds.val = toIndexedArray(rawKinds ?? []).map((raw, index) => {
                const label = kindName(toIndexedArray(raw ?? [])[3], index);
                // The picker's word: the kind without its "%" and its trailing "Rate"/"Chance".
                return { index, label, short: label.replace(/ %$/, "").replace(/ (Rate|Chance)$/, "") };
            });
            const captains = toIndexedArray(rawCaptains ?? []).map((raw) => toIndexedArray(raw ?? []));
            // An empty slot (rarity -1) holds no captain.
            const hired = captains
                .map((captain, slot) => ({ slot, captain }))
                .filter((c) => toNum(c.captain[0], -1) >= 0);
            const owned = hired.filter((c) => c.slot < OWNED_SLOTS);
            const pool = hired.filter((c) => c.slot >= OWNED_SLOTS);
            reconcileOwned(owned.map((c) => c.slot).join("|"), () => owned.map((c) => CaptainRow(c.slot)));
            reconcilePool(pool.map((c) => c.slot).join("|"), () => pool.map((c) => CaptainRow(c.slot)));
            poolCount.val = pool.length;
            for (const { slot, captain } of hired) {
                const state = stateOf(slot);
                FIELDS.forEach((field) => {
                    const raw = captain[field.index];
                    state[field.key].val = field.formatted ? toNum(raw, 0) : toInt(raw, { min: 0 });
                });
                state.kind1.val = toInt(captain[1], { min: 0 });
                state.kind2.val = toInt(captain[2], { min: 0 });
            }
        });

    load();

    const head = () => ValueTableHead({ name: "Captain", columns: FIELDS.map((field) => field.label) });

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container sailing-table-tab sailing-captains-tab",
        title: "Captains",
        description: "Your captains and the Recruitment pool: rarity, level and bonuses.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the captains",
        errorTitle: "Couldn't read the captains",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: [
                    AccountSection({ title: "Captains", body: [head(), ownedNode] }),
                    div(
                        { hidden: () => !poolCount.val },
                        AccountSection({ title: "Recruitment pool", body: [head(), poolNode] })
                    ),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.sailing.captains",
    world: 5,
    system: "Sailing",
    tab: "Captains",
    description: "Captain rarity, level, EXP and bonuses.",
    keywords: ["Recruitment", "Captain bonus", "Boat Speed", "Artifact Find"],
    component: CaptainsTab,
});
