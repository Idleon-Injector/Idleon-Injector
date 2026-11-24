/**
 * W5 - Hole › Caverns
 *
 * The Hole's caverns, one tab each in the game's order. A cavern that has parts of its own (Fountain's coins, water
 * and three waters' upgrades) shows them as groups in its one list, never as tabs in a tab. One read of the game
 * fills every cavern.
 *
 * Data sources (gga.Holes is one list per system):
 *   Holes[9]            - resources: layer resources [0..9], harp notes [10..19], rupies [20..29], fountain coins [30..]
 *   Holes[8]            - the Well's bars filled
 *   Holes[11]           - counters: Motherlode [0, 1], Hive [2, 3], Evertree [4, 5], Trench [6, 7], Den [8],
 *                         monument runs [11..13], lamp bonuses [24], Grotto [26..28], white/black rupies [38, 39],
 *                         jars broken [40..49], Temple [55..63], Gambit [65..70], fountain [80, 81, 84]
 *   Holes[14][2m]       - monument m's AFK hours; Holes[15][10m + n] its bonus n (cList.HolesInfo[32] says what)
 *   Holes[16], [17]     - the Bell's improvement methods (HolesInfo[60]) and random bonuses (HolesInfo[59], pairs)
 *   Holes[19][2s]       - harp string s's level; [2s + 1] its EXP
 *   Holes[21]           - lamp wishes (cList.LampWishes names them)
 *   Holes[24]           - jar collectibles (cList.HolesInfo[67]: "NAME|base|Filler|bonus")
 *   Holes[30], [33]     - fountain lucky coins (-1 while locked) and each water's fill bar
 *   Holes[31][w], [32][w] - water w's upgrade levels and marbles (cList.HoleFountUPG[w][n]: [0] name, [7] bonus)
 *   OptionsListAccount  - [355] Rupie Slugs (a past gem shop buy: each is 1.5x Jar Rupie value,
 *                         _customBlock_Holes Math.pow(1.5, OLA[355])), [601] rubber duckies, and the Cove:
 *                         [630 + n] Crystal Glunko upgrades (RandoListo2[11] names, [12] bonuses), [654 + s] shapes
 *                         (ItemDefinitionsGET.h.HoleGshape{s}), [666], [667] the shapes in focus, [604] bought
 *                         today, [668] Glunko kills
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    normalCase,
    toInt,
    toNum,
    unwrapH,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const RESOURCES = [
    "Gravel",
    "Goldust",
    "Redstone",
    "Mythril",
    "Cobaltine",
    "Bruntine",
    "Freezium",
    "Sweetium",
    "Rad Coral",
    "Hyper Coral",
];
const NOTES = [
    "Crotchet Note",
    "Natural Note",
    "Bass Note",
    "Treble Note",
    "Eighth Note",
    "Quaver Note",
    "Sharp Note",
    "(F)Clef Note",
    "(G)Clef Note",
    "Sixteenth Note",
];
const STRINGS = ["C", "D", "E", "F", "G", "A"];
const JARS = ["Simple", "Tall", "Ornate", "Great", "Enchanted", "Artisan", "Epic", "Gilded", "Ceremony", "Heirloom"];
// The game draws its rupies and names none: these are the community wiki's names (idleon.wiki, Module:Caverns
// RUPIE_NAMES, 2026-11-24), rupie 1 first. Each keeps its number under its name, so "Rupie 3" still finds it.
const RUPIES = [
    "Basic Red Rupie",
    "Basic Green Rupie",
    "Basic Blue Rupie",
    "Decent Yellow Rupie",
    "Decent Pink Rupie",
    "Decent Green Rupie",
    "Elegant Orange Rupie",
    "Elegant Blue Rupie",
    "Elegant Purple Rupie",
    "Master Rupie",
];
const COINS = ["Bronze", "Silver", "Gold", "Dollar", "Credit", "Treasury", "Moolah", "Shilling", "Greane"];
const WATERS = ["Blue", "Yellow", "Green"];
const COVE_UPGRADES = 630;
const COVE_SHAPES = 654;
const SHAPES = 12;
const PER_COLOUR = 6;
const COVE_OPTIONS = [355, 601, 604, 666, 667, 668];

// A counter in Holes[11].
const counter = (data, index, name, extra = {}) => ({
    key: `c${index}`,
    name,
    path: `Holes[11][${index}]`,
    value: toNum(data.holes[11]?.[index], 0),
    ...extra,
});
const counters = (list) => (data) => list.map(([index, name]) => counter(data, index, name));

const monument = (m, name) => (data) => [
    {
        key: "afk",
        section: `Monument of ${name}`,
        name: "AFK hours",
        path: `Holes[14][${2 * m}]`,
        value: toNum(data.holes[14]?.[2 * m], 0),
        float: true,
    },
    counter(data, 11 + m, "Time since the last run", { section: `Monument of ${name}` }),
    ...Array.from({ length: 10 }, (_, n) => {
        const index = 10 * m + n;
        return {
            key: `bonus-${index}`,
            section: "Bonuses",
            name: `Bonus ${n + 1}`,
            bonus: bonusText(data.monuments[index]),
            path: `Holes[15][${index}]`,
            value: toNum(data.holes[15]?.[index], 0),
        };
    }),
];

const CAVERNS = [
    {
        id: "well",
        label: "The Well",
        rows: (data) => [
            ...RESOURCES.map((name, n) => ({
                key: `amount-${n}`,
                section: "Resources",
                name,
                path: `Holes[9][${n}]`,
                value: toNum(data.holes[9]?.[n], 0),
                float: true,
            })),
            ...RESOURCES.map((name, n) => ({
                key: `bars-${n}`,
                section: "Bars filled",
                name,
                path: `Holes[8][${n}]`,
                value: toNum(data.holes[8]?.[n], 0),
            })),
        ],
    },
    {
        id: "motherlode",
        label: "Motherlode",
        rows: counters([
            [0, "Ore mined this layer"],
            [1, "Layers completed"],
        ]),
    },
    { id: "den", label: "The Den", rows: counters([[8, "Highscore"]]) },
    { id: "bravery", label: "Bravery", rows: monument(0, "Bravery") },
    {
        id: "bell",
        label: "The Bell",
        rows: (data) => [
            ...data.bellMethods.map((raw, n) => ({
                key: `method-${n}`,
                section: "Improvement methods",
                name: `Method ${n + 1}`,
                bonus: bonusText(raw),
                path: `Holes[16][${n}]`,
                value: toNum(data.holes[16]?.[n], 0),
            })),
            ...data.bellRandom.map((raw, n) => ({
                key: `random-${n}`,
                section: "Random bonuses",
                name: `Bonus ${n + 1}`,
                // The game writes these in capitals ("BUCKET FILL RATE").
                bonus: normalCase(bonusText(raw)),
                path: `Holes[17][${n}]`,
                value: toNum(data.holes[17]?.[n], 0),
            })),
        ],
    },
    {
        id: "harp",
        label: "The Harp",
        rows: (data) => [
            ...NOTES.map((name, n) => ({
                key: `note-${n}`,
                section: "Notes",
                name,
                path: `Holes[9][${10 + n}]`,
                value: toNum(data.holes[9]?.[10 + n], 0),
                float: true,
            })),
            ...STRINGS.map((note, s) => ({
                key: `string-${s}`,
                section: "Strings",
                head: "String",
                name: `${note} string`,
                fields: [
                    {
                        key: "level",
                        label: "Level",
                        path: `Holes[19][${2 * s}]`,
                        value: toInt(data.holes[19]?.[2 * s], { min: 0 }),
                    },
                    {
                        key: "exp",
                        label: "EXP",
                        path: `Holes[19][${2 * s + 1}]`,
                        value: toNum(data.holes[19]?.[2 * s + 1], 0),
                        formatted: true,
                        quiet: true,
                    },
                ],
            })),
        ],
    },
    {
        id: "lamp",
        label: "The Lamp",
        rows: (data) => [
            counter(data, 24, "Bonuses unlocked", { section: "Lamp", max: 11, formatted: false }),
            ...data.wishes
                .map((raw, n) => {
                    const name = cleanName(toIndexedArray(raw ?? [])[0]);
                    return name
                        ? {
                              key: `wish-${n}`,
                              section: "Wishes",
                              name,
                              path: `Holes[21][${n}]`,
                              value: toNum(data.holes[21]?.[n], 0),
                          }
                        : null;
                })
                .filter(Boolean),
        ],
    },
    {
        id: "hive",
        label: "The Hive",
        rows: counters([
            [2, "Bugs caught this harvest"],
            [3, "Harvests completed"],
        ]),
    },
    {
        id: "grotto",
        label: "Grotto",
        rows: counters([
            [26, "Colonies cleared"],
            [27, "Gloomies killed this colony"],
            [28, "Gloomies killed in all"],
        ]),
    },
    { id: "justice", label: "Justice", rows: monument(1, "Justice") },
    {
        id: "jars",
        label: "The Jars",
        rows: (data) => [
            {
                key: "slugs",
                section: "Gem shop",
                name: "Rupie Slugs",
                bonus: "1.5x Jar Rupie value each",
                path: "OptionsListAccount[355]",
                value: toNum(data.options["355"], 0),
                formatted: false,
            },
            ...RUPIES.map((name, n) => ({
                key: `rupie-${n}`,
                section: "Rupies",
                name,
                subLabel: `Rupie ${n + 1}`,
                path: `Holes[9][${20 + n}]`,
                value: toNum(data.holes[9]?.[20 + n], 0),
                float: true,
            })),
            counter(data, 38, "White rupies found", { section: "Rupies" }),
            counter(data, 39, "Black rupies found", { section: "Rupies" }),
            ...data.collectibles.map((raw, n) => {
                const [name, , , bonus] = String(raw ?? "").split("|");
                return {
                    key: `collectible-${n}`,
                    section: "Collectibles",
                    name: normalCase(name || `Collectible ${n + 1}`),
                    bonus: bonusText(bonus),
                    path: `Holes[24][${n}]`,
                    value: toNum(data.holes[24]?.[n], 0),
                    formatted: false,
                };
            }),
            ...JARS.map((jar, n) => counter(data, 40 + n, `${jar} Jars`, { section: "Jars broken" })),
        ],
    },
    {
        id: "evertree",
        label: "Evertree",
        rows: counters([
            [4, "Everlog chopped this trunk"],
            [5, "Trunks whittled"],
        ]),
    },
    { id: "wisdom", label: "Wisdom", rows: monument(2, "Wisdom") },
    {
        id: "gambit",
        label: "Gambit",
        rows: counters([
            [65, "King's Gambit"],
            [66, "Horsey's Gambit"],
            [67, "Bishop's Gambit"],
            [68, "Queen's Gambit"],
            [69, "Castle's Gambit"],
            [70, "Noob's Gambit"],
        ]),
    },
    {
        id: "temple",
        label: "Temple",
        rows: counters([
            [56, "Torches"],
            [57, "Illuminate upgrades bought"],
            [58, "Search upgrade level"],
            [59, "Amplify upgrades bought"],
            [55, "Centurions killed"],
            [63, "Golems killed"],
        ]),
    },
    {
        id: "fountain",
        label: "Fountain",
        rows: (data) => [
            ...COINS.map((coin, c) => ({
                key: `coin-${c}`,
                section: "Coins",
                name: `${coin} coins`,
                path: `Holes[9][${30 + c}]`,
                value: toNum(data.holes[9]?.[30 + c], 0),
            })),
            ...COINS.map((coin, c) => ({
                key: `lucky-${c}`,
                section: "Lucky coins",
                name: `Lucky ${coin} coin`,
                path: `Holes[30][${c}]`,
                value: toNum(data.holes[30]?.[c], -1),
                min: -1,
                formatted: false,
                badge: (level) => (Number(level) === -1 ? "Locked" : ""),
            })),
            counter(data, 80, "Water in use", {
                section: "Water",
                max: WATERS.length - 1,
                formatted: false,
                badge: (water) => `${WATERS[Number(water)] ?? WATERS[0]} Water`,
            }),
            ...WATERS.map((water, w) => ({
                key: `bar-${w}`,
                section: "Water",
                name: `${water} Water fill bar`,
                path: `Holes[33][${w}]`,
                value: toNum(data.holes[33]?.[w], 0),
                float: true,
            })),
            counter(data, 81, "Marbles", { section: "Water" }),
            counter(data, 84, "Lanterns used", { section: "Water", max: 12, formatted: false }),
            {
                key: "duckies",
                section: "Water",
                name: "Rubber duckies",
                path: "OptionsListAccount[601]",
                value: toNum(data.options["601"], 0),
                formatted: false,
            },
            ...WATERS.flatMap((water, w) =>
                toIndexedArray(data.fountain[w] ?? []).map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    const name = cleanName(def[0], `${water} Water upgrade ${n + 1}`);
                    return {
                        key: `upgrade-${w}-${n}`,
                        section: `${water} Water upgrades`,
                        head: "Upgrade",
                        name,
                        bonus: bonusText(def[7]),
                        fields: [31, 32].map((group, i) => ({
                            key: i ? "marbles" : "level",
                            label: i ? "Marbles" : "Level",
                            path: `Holes[${group}][${w}][${n}]`,
                            value: toInt(toIndexedArray(data.holes[group]?.[w] ?? [])[n], { min: 0 }),
                        })),
                    };
                })
            ),
        ],
    },
    {
        id: "trench",
        label: "Trench",
        rows: counters([
            [6, "Fish caught this layer"],
            [7, "Layers completed"],
        ]),
    },
    {
        id: "cove",
        label: "The Cove",
        rows: (data) => {
            const option = (index) => data.options[String(index)] ?? 0;
            const shapeName = (s) => cleanName(unwrapH(data.shapes[`HoleGshape${s}`])?.displayName, `Shape ${s + 1}`);
            return [
                ...data.coveNames
                    .map((raw, n) => {
                        const name = cleanName(raw);
                        // The game's placeholder for an upgrade still to come ("... my man, not yet").
                        if (!name || /not yet/i.test(String(data.coveBonuses[n] ?? ""))) return null;
                        return {
                            key: `upgrade-${n}`,
                            section: "Upgrades",
                            name,
                            bonus: bonusText(data.coveBonuses[n]),
                            path: `OptionsListAccount[${COVE_UPGRADES + n}]`,
                            value: toInt(option(COVE_UPGRADES + n), { min: 0 }),
                            formatted: false,
                        };
                    })
                    .filter(Boolean),
                ...Array.from({ length: SHAPES }, (_, s) => ({
                    key: `shape-${s}`,
                    section: s < PER_COLOUR ? "Blue shapes" : "Purple shapes",
                    name: shapeName(s),
                    path: `OptionsListAccount[${COVE_SHAPES + s}]`,
                    value: toNum(option(COVE_SHAPES + s), 0),
                    float: true,
                })),
                ...[
                    [666, "Blue", 0],
                    [667, "Purple", PER_COLOUR],
                ].map(([index, colour, from]) => ({
                    key: `focus-${index}`,
                    section: "Focus",
                    name: `${colour} shape in focus`,
                    path: `OptionsListAccount[${index}]`,
                    value: toInt(option(index), { min: 0 }),
                    // 0 is none; 1 to 6 pick a shape of that colour, named before the field.
                    max: PER_COLOUR,
                    formatted: false,
                    badge: (picked) => (Number(picked) > 0 ? shapeName(from + Number(picked) - 1) : "None"),
                })),
                {
                    key: "today",
                    section: "Focus",
                    name: "Upgrades bought today",
                    path: "OptionsListAccount[604]",
                    value: toInt(option(604), { min: 0 }),
                    formatted: false,
                },
                {
                    key: "kills",
                    section: "Focus",
                    name: "Crystal Glunko kills",
                    path: "OptionsListAccount[668]",
                    value: toNum(option(668), 0),
                },
            ];
        },
    },
];

const readCaverns = async () => {
    const [rawHoles, lists, options] = await Promise.all([
        gga("Holes"),
        Promise.all(
            [
                "HolesInfo[32]",
                "HolesInfo[59]",
                "HolesInfo[60]",
                "LampWishes",
                "HolesInfo[67]",
                "HoleFountUPG",
                "RandoListo2[11]",
                "RandoListo2[12]",
            ].map((path) => readCList(path))
        ),
        readGgaEntries(
            "OptionsListAccount",
            [
                ...COVE_OPTIONS,
                ...Array.from({ length: 24 }, (_, n) => COVE_UPGRADES + n),
                ...Array.from({ length: SHAPES }, (_, s) => COVE_SHAPES + s),
            ].map(String)
        ),
    ]);
    const [monuments, bellRandom, bellMethods, wishes, collectibles, fountain, coveNames, coveBonuses] = lists.map(
        (list) => toIndexedArray(list ?? [])
    );
    const shapeIds = Array.from({ length: SHAPES }, (_, s) => `HoleGshape${s}`);
    return {
        holes: toIndexedArray(rawHoles ?? []).map((part) => toIndexedArray(part ?? [])),
        monuments,
        bellRandom: bellRandom.filter((_, i) => i % 2 === 0),
        bellMethods,
        wishes,
        collectibles: collectibles.slice(0, 40),
        fountain,
        coveNames,
        coveBonuses,
        options,
        shapes: await readGgaEntries("ItemDefinitionsGET.h", shapeIds, ["displayName"]),
    };
};

const CavernsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Caverns" });
    const lists = CAVERNS.map(() => NumberList());

    const load = () =>
        run(async () => {
            const data = await readCaverns();
            CAVERNS.forEach((cavern, i) => lists[i].show(cavern.rows(data)));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container hole-caverns-tab",
        title: "Caverns",
        description: "Every cavern of the Hole, in the game's order.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the caverns",
        errorTitle: "Couldn't read the caverns",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Caverns",
                page: "w5.hole.caverns",
                pick: "Cavern",
                setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
                tabs: CAVERNS.map((cavern, i) => ({
                    id: cavern.id,
                    label: cavern.label,
                    content: div({ class: "field-columns" }, lists[i].node),
                })),
            })
        ),
    });
};

export default definePage({
    id: "w5.hole.caverns",
    world: 5,
    system: "Hole",
    tab: "Caverns",
    tabs: CAVERNS.map(({ id, label }) => ({ id, label })),
    description:
        "Every Hole cavern: the Well, Motherlode, the Den, the monuments, the Bell, Harp, Lamp, Jars and more.",
    keywords: [
        "Dawg Den",
        "Skill",
        "Monument",
        "Crystal Cove",
        "Crystal Glunko Cove",
        "Lucky Coins",
        "Rupie Slugs",
        "Rupie Slug",
        "Gem shop",
        "Limited",
        "Fomo",
    ],
    component: CavernsTab,
});
