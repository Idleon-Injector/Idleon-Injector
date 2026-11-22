/**
 * W2 - Pay 2 Win Tab (Alchemy P2W)
 *
 * Data paths:
 *   CauldronP2W[0][f + 3*e] -> Brewing cauldrons
 *   CauldronP2W[1][f + 2*e] -> Liquid cauldrons
 *   CauldronP2W[2][e]       -> Vial upgrades
 *   CauldronP2W[3][e]       -> Player boosts
 *   OptionsListAccount[123] -> Draconic cauldron count
 *
 * Max levels are read via readComputedMany("alchemy", "CauldronLvMAX", ...).
 *
 * The game's groups are tabs: Cauldrons and Liquids are tables (a line per cauldron, its upgrades in columns), Vials
 * and Player lists. The Draconic count closes the Liquids tab.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { writeVerified } from "../../../components/views/account/accountShared.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

// The game's groups, each a tab. A table tab has a line per cauldron (or liquid), its upgrades in columns; a list tab a
// row per upgrade. `bucket` is CauldronP2W's list; an upgrade's place in it is column + stride × line.
const GROUPS = [
    {
        id: "cauldrons",
        label: "Cauldrons",
        thing: "Cauldron",
        bucket: 0,
        stride: 3,
        lines: [
            { label: "Power Cauldron", tone: "brew-power" },
            { label: "Quicc Cauldron", tone: "brew-quicc" },
            { label: "High-IQ Cauldron", tone: "brew-high-iq" },
            { label: "Kazam Cauldron", tone: "brew-kazam" },
        ],
        columns: ["Speed", "New bubble", "Boost req"],
    },
    {
        id: "liquids",
        label: "Liquids",
        thing: "Liquid",
        bucket: 1,
        stride: 2,
        lines: [
            { label: "Water Droplets", tone: "water-droplets" },
            { label: "Liquid Nitrogen", tone: "liquid-nitrogen" },
            { label: "Trench Seawater", tone: "trench-seawater" },
            { label: "Toxic Mercury", tone: "toxic-mercury" },
        ],
        columns: ["Regen", "Capacity"],
    },
    { id: "vials", label: "Vials", bucket: 2, rows: ["Attempts", "RNG"] },
    { id: "player", label: "Player", bucket: 3, rows: ["Alchemy speed", "Extra EXP"] },
];
const DRACONIC = { label: "Draconic cauldrons", max: 4, writePath: "OptionsListAccount[123]" };

const P2WRow = ({ label, valueState, maxState, writePath }) =>
    EditableNumberRow({
        valueState,
        // A value pulled into range is refused with the bound (useFieldEditor), so nothing past the max is written.
        normalize: (rawValue) => {
            const parsed = Math.max(0, Math.round(Number(rawValue)));
            const max = Number(maxState.val);
            if (Number.isNaN(parsed)) return null;
            // A count the game holds above the max may come down step by step (Lower); nothing goes up past the max.
            if (max > 0 && parsed > max && parsed < Number(valueState.val ?? 0)) return parsed;
            return max > 0 ? Math.min(max, parsed) : parsed;
        },
        write: async (nextValue) => writeVerified(writePath, nextValue),
        renderInfo: () => span({ class: "account-row__name" }, label),
        // The max level, where −/+ stop; none until it's read.
        cap: () => (maxState.val > 0 ? maxState.val : null),
        adjustInput: (rawValue, delta, currentValue) => {
            const base = Number(rawValue);
            const next = Number.isFinite(base) ? base : Number(currentValue ?? 0);
            const max = Number(maxState.val);
            const updated = Math.max(0, next + delta);
            // A count the game holds past the max: Raise leaves it, Lower takes one off and saves it.
            if (max > 0 && next > max) return delta > 0 ? next : updated;
            return max > 0 ? Math.min(max, updated) : updated;
        },
        inputMode: "int",
    });

const Pay2WinTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Pay 2 Win" });
    // Each group's values and max levels: one state per upgrade, at its place in the group's bucket.
    const slots = (group) => (group.lines ? group.lines.length * group.stride : group.rows.length);
    const valueStates = GROUPS.map((group) => Array.from({ length: slots(group) }, () => van.state(0)));
    const maxStates = GROUPS.map((group) => Array.from({ length: slots(group) }, () => van.state(0)));
    const draconic = { value: van.state(0), max: van.state(DRACONIC.max) };

    const load = async () =>
        run(async () => {
            const [rawP2W, rawDraconic] = await Promise.all([gga("CauldronP2W"), gga("OptionsListAccount[123]")]);
            const p2w = toIndexedArray(rawP2W ?? []);
            // What the game holds, even past the max, so the row never hides it.
            const count = Number(rawDraconic ?? 0);
            draconic.value.val = Number.isFinite(count) ? count : 0;

            const maxTargets = [];
            GROUPS.forEach((group, g) => {
                const bucket = toIndexedArray(p2w[group.bucket] ?? []);
                valueStates[g].forEach((state, at) => {
                    state.val = Number(bucket[at] ?? 0);
                    // The game asks for a max by group, line and column ("0" for a list's row).
                    const args = group.lines
                        ? [group.bucket, Math.floor(at / group.stride), String(at % group.stride)]
                        : [group.bucket, at, "0"];
                    maxTargets.push({ args, apply: (value) => (maxStates[g][at].val = Number(value ?? 0)) });
                });
            });

            const maxResults = await readComputedMany(
                "alchemy",
                "CauldronLvMAX",
                maxTargets.map((entry) => entry.args)
            );
            maxTargets.forEach((entry, index) => {
                if (!maxResults[index]?.ok) {
                    throw new Error(
                        `CauldronLvMAX failed for target ${index} (args=${JSON.stringify(entry.args)}): ${maxResults[index]?.error ?? "unknown"}`
                    );
                }
                entry.apply(maxResults[index].value);
            });
        });

    const tableRows = (group, g) =>
        group.lines.map((line, l) => {
            const at = (column) => column + group.stride * l;
            return ValueTableRow({
                name: line.label,
                info: span({ class: `account-row__name liquid-name liquid-name--${line.tone}` }, line.label),
                fields: group.columns.map((label, column) => ({
                    key: String(column),
                    label,
                    valueState: valueStates[g][at(column)],
                    max: () => maxStates[g][at(column)].val,
                    paths: [`CauldronP2W[${group.bucket}][${at(column)}]`],
                })),
                read: async () => {
                    const bucket = toIndexedArray((await gga(`CauldronP2W[${group.bucket}]`)) ?? []);
                    return Object.fromEntries(
                        group.columns.map((_, column) => [String(column), Number(bucket[at(column)] ?? 0)])
                    );
                },
            });
        });

    const tabContent = (group, g) =>
        group.lines
            ? div(
                  { class: "account-page-pane" },
                  ValueTableHead({ name: group.thing, columns: group.columns }),
                  ...tableRows(group, g),
                  // The Draconic count is the liquid cauldrons' own: it closes their tab.
                  group.id === "liquids"
                      ? P2WRow({
                            label: DRACONIC.label,
                            valueState: draconic.value,
                            maxState: draconic.max,
                            writePath: DRACONIC.writePath,
                        })
                      : null
              )
            : div(
                  { class: "account-page-pane" },
                  ...group.rows.map((label, at) =>
                      P2WRow({
                          label,
                          valueState: valueStates[g][at],
                          maxState: maxStates[g][at],
                          writePath: `CauldronP2W[${group.bucket}][${at}]`,
                      })
                  )
              );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Pay 2 Win",
        description: "Pay 2 Win upgrades for cauldrons, liquids, vials and players, each up to its max.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading Pay 2 Win",
        errorTitle: "Couldn't read Pay 2 Win",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Pay 2 Win",
                tabs: GROUPS.map((group, g) => ({ id: group.id, label: group.label, content: tabContent(group, g) })),
            })
        ),
    });
};

export default definePage({
    id: "w2.cauldrons.p2w",
    world: 2,
    system: "Cauldrons",
    tab: "Pay 2 Win",
    description: "Pay 2 Win cauldron, liquid, vial and player levels, and Draconic cauldrons.",
    keywords: ["Alchemy", "P2W", "Draconic"],
    component: Pay2WinTab,
});
