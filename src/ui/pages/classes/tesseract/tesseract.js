/**
 * Classes - Tesseract (Arcane Cultist)
 *
 * One page, the Tesseract's screens as its tabs: Upgrades, Tachyons, and Map Bonuses (the kills on each map's Arcane
 * Crystals).
 *
 * Data sources:
 *   gga.Arcane[n]                   - Tesseract upgrade n's level (cList.ArcaneUpg: [0] name, [4] max level, 999999 for
 *                                     none, [9] its line; "Boundless Energy" rows are pages still to come)
 *   gga.OptionsListAccount[388-394] - tachyons: Purple (Singulon), Brown (Doubulon), Green (Verdon), Red (Bludon),
 *                                     Silver (Massivon), Gold (Aurion), collected in all
 *   gga.MapBon[m][0-2]              - map m's crystal kills: purple (drop rate), yellow (EXP), blue (AFK)
 *   gga.DNSM.h.ArcMultBon           - the game's crystal sums, emptied after a save so the game works them out again
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { deleteGga, gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SetAllNumberControl, refuseSetAll } from "../../../components/views/account/BulkActionBar.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { MasterclassPage, UpgradesPart, plural } from "../../../components/views/account/masterclassParts.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    resolveFormattedIntInput,
    toInt,
    toNum,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// ---- Upgrades ----------------------------------------------------------------------------------------------------

const UpgradesTab = ({ pending, reload, bulk }) =>
    UpgradesPart({
        levelsPath: "Arcane",
        definitions: "ArcaneUpg",
        words: ["upgrade", "upgrades"],
        pending,
        reload,
        bulk,
    });

// ---- Tachyons ----------------------------------------------------------------------------------------------------

const TACHYONS = [
    ["Purple Tachyons", "Singulon"],
    ["Brown Tachyons", "Doubulon"],
    ["Green Tachyons", "Verdon"],
    ["Red Tachyons", "Bludon"],
    ["Silver Tachyons", "Massivon"],
    ["Gold Tachyons", "Aurion"],
];

const TachyonsTab = () => {
    const list = NumberList();
    const paths = [...TACHYONS.map((_, i) => `OptionsListAccount[${388 + i}]`), "OptionsListAccount[394]"];
    return {
        content: list.node,
        load: async () => {
            const values = await Promise.all(paths.map((path) => gga(path)));
            list.show(
                paths.map((path, i) => ({
                    key: path,
                    ...(TACHYONS[i] ? { bonus: TACHYONS[i][0], name: TACHYONS[i][1] } : { name: "Tachyons collected" }),
                    path,
                    value: toNum(values[i], 0),
                }))
            );
        },
    };
};

// ---- Map Bonuses -------------------------------------------------------------------------------------------------

const CRYSTALS = [
    { key: "purple", label: "Drop Rate" },
    { key: "yellow", label: "EXP" },
    { key: "blue", label: "AFK" },
];
const WORLDS = 7;
// A save that can't clear them fails, so the line says so; the next save of any value clears them.
const forgetSums = () => deleteGga("DNSM.h.ArcMultBon");

// The world a map is in: the world whose Death Note lists the map's monster, else its number's fifty.
const worldOf = (mapIndex, target, deathNoteMobs) => {
    const listed = deathNoteMobs.findIndex((mobs) => target && mobs.includes(target));
    if (listed >= 0) return listed + 1;
    if (mapIndex === 37) return 2;
    if (mapIndex === 166) return 4;
    return Math.min(WORLDS, Math.floor(mapIndex / 50) + 1);
};

// The tray's Set all button, for the question it asks (the change log names it).
const setAllButton = (node) =>
    String(node.nodeName).toLowerCase() === "button"
        ? node
        : ([...node.childNodes].map(setAllButton).find(Boolean) ?? null);

// `bulk` is the page's, so a map Set all and the Upgrades' Max all never run at once.
const MapBonusesTab = ({ pending, reload, bulk }) => {
    const killsInput = van.state("");
    const maps = van.state([]);
    const states = new Map();
    const stateOf = (m, key) => getOrCreateState(states, `${m}:${key}`);
    const rowOf = new Map();
    const worldNodes = Array.from({ length: WORLDS }, () => div());
    const reconcilers = worldNodes.map(createStaticRowReconciler);
    const counts = worldNodes.map(() => van.state(0));
    const pathOf = (m, c) => `MapBon[${m}][${c}]`;

    const MapRow = (map) => {
        const row = ValueTableRow({
            name: map.name,
            info: span({ class: "account-row__name" }, map.name),
            fields: CRYSTALS.map((crystal, c) => ({
                ...crystal,
                valueState: stateOf(map.m, crystal.key),
                paths: [pathOf(map.m, c)],
                formatted: true,
            })),
            read: async () => {
                const values = toIndexedArray((await gga(`MapBon[${map.m}]`)) ?? []);
                return Object.fromEntries(CRYSTALS.map((crystal, c) => [crystal.key, toInt(values[c], { min: 0 })]));
            },
            afterWrite: forgetSums,
        });
        rowOf.set(map.m, row);
        return row;
    };

    const shown = () => maps.val.filter((map) => shownBySearch(rowOf.get(map.m)));
    const word = ["map", "maps"];
    const setKills = async (entries, kills) => {
        const result = await bulk.run(async () => {
            const writes = entries.flatMap((map) =>
                CRYSTALS.map((crystal, c) => ({ map, crystal, path: pathOf(map.m, c) })).filter(
                    ({ map: { m }, crystal }) => stateOf(m, crystal.key).val !== kills
                )
            );
            if (!writes.length) return { cancelled: true };
            try {
                // ponytail: 60 writes a request, the size the old page used; one request would do if the server took it.
                for (let i = 0; i < writes.length; i += 60)
                    await writeManyVerified(writes.slice(i, i + 60).map(({ path }) => ({ path, value: kills })));
            } catch (error) {
                // Part of it may have landed: the sums go too, and the write's failure is the one said.
                await forgetSums().catch(() => {});
                throw error;
            }
            await forgetSums();
            // The lines show what the game holds now, not the number typed.
            const maps = [...new Set(writes.map(({ map }) => map))];
            const values = await Promise.all(maps.map((map) => gga(`MapBon[${map.m}]`)));
            // A map the game doesn't answer for shows the kills its write was read back with.
            maps.forEach((map, i) => {
                const now = values[i] === null || values[i] === undefined ? null : toIndexedArray(values[i]);
                CRYSTALS.forEach(
                    (crystal, c) => (stateOf(map.m, crystal.key).val = now ? toInt(now[c], { min: 0 }) : kills)
                );
            });
        });
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: div(
            { class: "tesseract-maps" },
            ...worldNodes.map((node, w) =>
                div(
                    { hidden: () => !counts[w].val },
                    AccountSection({
                        title: `World ${w + 1}`,
                        body: [ValueTableHead({ name: "Map", columns: CRYSTALS.map((c) => c.label) }), node],
                    })
                )
            )
        ),
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [rawMapBon, rawNames, rawTargets, rawDeathNote] = await Promise.all([
                gga("MapBon"),
                gga("CustomLists.h.MapDispName"),
                gga("CustomLists.h.MapAFKtarget"),
                gga("CustomLists.h.DeathNoteMobs"),
            ]);
            const names = toIndexedArray(rawNames ?? []);
            const targets = toIndexedArray(rawTargets ?? []);
            const deathNoteMobs = toIndexedArray(rawDeathNote ?? []).map((mobs) => toIndexedArray(mobs ?? []));
            const next = toIndexedArray(rawMapBon ?? [])
                .map((raw, m) => ({ m, values: toIndexedArray(raw ?? []), name: cleanName(names[m]) }))
                .filter(({ values, name }) => values.length >= 3 && name)
                .map((map) => ({ ...map, world: worldOf(map.m, targets[map.m], deathNoteMobs) }));
            worldNodes.forEach((_, w) => {
                const own = next.filter((map) => map.world === w + 1);
                reconcilers[w](own.map((map) => `${map.m}:${map.name}`).join("|"), () => own.map(MapRow));
                counts[w].val = own.length;
            });
            next.forEach((map) =>
                CRYSTALS.forEach((crystal, c) => (stateOf(map.m, crystal.key).val = toInt(map.values[c], { min: 0 })))
            );
            maps.val = next;
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${word[n === 1 ? 0 : 1]}` : `All ${plural(n, word)}`;
        },
        // Set all puts the kills on every crystal of the maps shown; lowering any asks first.
        tools: (ask) => {
            const lowered = (entries, kills) =>
                entries.filter((map) => CRYSTALS.some((crystal) => stateOf(map.m, crystal.key).val > kills));
            const askOrSet = (entries, kills) => {
                const n = lowered(entries, kills).length;
                if (!n) return setKills(entries, kills);
                ask({
                    question: `Lower the kills on ${plural(n, word)}?`,
                    confirmLabel: n === 1 ? "Lower it" : "Lower them",
                    from: setAllButton(control),
                    lowers: () => lowered(entries, kills),
                    again: () => askOrSet(entries, kills),
                    onConfirm: () => setKills(entries, kills),
                });
                return undefined;
            };
            const control = SetAllNumberControl({
                label: "",
                placeholder: "Kills",
                value: killsInput,
                status: bulk.status,
                disabled: pending,
                onApply: () => {
                    const kills = resolveFormattedIntInput(killsInput.val, null, { min: 0 });
                    if (kills === null) return refuseSetAll(killsInput);
                    return askOrSet(shown(), kills);
                },
            });
            return control;
        },
    };
};

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "upgrades", label: "Upgrades", part: UpgradesTab, keywords: ["Arcanist", "Tesseract upgrades"] },
    { id: "tachyons", label: "Tachyons", part: TachyonsTab, keywords: ["Singulon", "Aurion", "Tachyon"] },
    {
        id: "maps",
        label: "Map Bonuses",
        part: MapBonusesTab,
        keywords: ["Map Crystals", "Arcane Crystals", "Maps", "MapBon", "Crystal kills"],
    },
];

export default definePage({
    id: "classes.tesseract",
    world: "classes",
    system: "Tesseract",
    description: "The Arcane Cultist's Tesseract upgrades, tachyons and map bonuses.",
    keywords: ["Arcane Cultist", "Arcanist", "Masterclass"],
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: () =>
        MasterclassPage({
            name: "Tesseract",
            page: "classes.tesseract",
            description: "The Arcane Cultist's Tesseract upgrades, tachyons and map bonuses.",
            tabs: TABS,
        }),
});
