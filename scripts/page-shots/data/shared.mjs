/** What many pages read: the characters, monsters, maps and items. */
import { fakeName, h, list } from "./helpers.mjs";

export const PLAYERS = ["Lumi_Main", "Lumi_Alt", "Lumi_Third"];
export const MONSTERS = list(30, (i) => `mob${i}`);
/** Map ids run 50 per world; the first six of each world are real maps here. */
export const MAPS = list(350, (i) => i).filter((i) => i % 50 < 6);
const isMap = (i) => i % 50 < 6;
const mapMob = (map) => MONSTERS[(Math.floor(map / 50) * 4 + (map % 50)) % MONSTERS.length];
const MAP_WORDS = [
    ["Grassy", "Sandy", "Icy", "Starry", "Smoky", "Misty", "Coral"],
    ["Meadow", "Path", "Hollow", "Ridge", "Cave", "Shore"],
];

/** Items by id: ordinary drops, critters, refineries, premium hats, armor set pieces. */
export const ITEMS = {
    ...Object.fromEntries(
        list(30, (i) => [`item${i}`, { displayName: fakeName(i + 40), Type: "MATERIAL", typeGen: "dQuest" }])
    ),
    ...Object.fromEntries(
        list(6, (i) => [
            `Critter${i + 1}`,
            { displayName: `${fakeName(i + 9)}_Critter`, Type: "CRITTER", typeGen: "dCritters" },
        ])
    ),
    ...Object.fromEntries(
        list(9, (i) => [
            `Refinery${i + 1}`,
            {
                // The game's own salt names.
                displayName: [
                    "Redox_Salts",
                    "Explosive_Salts",
                    "Spontaneity_Salts",
                    "Dioxide_Synthesis",
                    "Purple_Salt",
                    "Nullo_Salt",
                    "Crosslink_Salt",
                    "Propagated_Salt",
                    "Anionic_Salt",
                ][i],
                Type: "MATERIAL",
                typeGen: "dRefine",
            },
        ])
    ),
    ...Object.fromEntries(
        list(12, (i) => [
            `EquipmentHatsPrem${i + 1}`,
            { displayName: `${fakeName(i + 20)}_Hat`, Type: "PREMIUM_HELMET", typeGen: "aHelmetMTX" },
        ])
    ),
    ...Object.fromEntries(
        list(12, (i) => [
            `SetPiece${i}`,
            { displayName: `${fakeName(i + 3)}_Plate`, Type: "HELMET", typeGen: "aHelmet" },
        ])
    ),
};

const skillLevels = (seed) => list(25, (i) => (i === 0 ? 120 + seed * 30 : (i * 17 + seed * 5) % 140));

const player = (seed) =>
    h({
        Lv0: skillLevels(seed),
        Exp0: list(25, (i) => (i * 7 + seed) % 90),
        ExpReq0: list(25, (i) => 100 + i * 10),
        Money: 1234567 * (seed + 1),
        CharacterClass: [7, 34, 6][seed],
        Prayers: list(12, (slot) => (slot < 2 ? slot * 2 + seed : -1)),
        // Kills still needed on each map, never more than the map's portal needs (MapDetails).
        KillsLeft2Advance: list(350, (map) => [Math.max(0, 10 + (map % 50) * 5 - ((map * 7 + seed * 3) % 12)), 0]),
        // [map, x, progress, critter, qty, trap type, time to finish, exp, rare chance]; map -1 = empty.
        PldTraps: list(4, (trap) =>
            trap === 3
                ? [-1, 0, 0, "", 0, 0, 0, 0, 0]
                : [
                      trap + 1,
                      300 + trap * 50,
                      1800 * (trap + 1),
                      `Critter${trap + seed + 1}`,
                      3 + trap,
                      trap,
                      7200,
                      40,
                      0.05,
                  ]
        ),
        PlayerStuff: [40 + seed * 25, 0, 0],
    });

export default () => ({
    gga: {
        UserInfo: [PLAYERS[0], 0, 0],
        GetPlayersUsernames: [...PLAYERS],
        PlayerDATABASE: h(Object.fromEntries(PLAYERS.map((name, seed) => [name, player(seed)]))),
        // The active character's own copies of its PlayerDATABASE fields.
        ...player(0).h,
        PrayersActive: player(0).h.Prayers,
        PlacedTraps: player(0).h.PldTraps,
        ItemDefinitionsGET: h(Object.fromEntries(Object.entries(ITEMS).map(([id, item]) => [id, h({ ...item })]))),
        MonsterDefinitionsGET: h(
            Object.fromEntries(
                MONSTERS.map((id, i) => [
                    id,
                    h({ Name: fakeName(i), MonsterHPTotal: 100 * (i + 1), AFKtype: "FIGHTING" }),
                ])
            )
        ),
        CustomLists: h({
            ClassNames: list(42, (i) => (i === 0 ? "Blank" : fakeName(i + 60))),
            SkillNames: ["Blank", "Mining", "Smithing", "Chopping", "Fishing", "Alchemy", "Catching"],
            MapDispName: list(350, (i) =>
                isMap(i) ? `${MAP_WORDS[0][Math.floor(i / 50)]}_${MAP_WORDS[1][i % 50]}` : "Filler"
            ),
            // Scene names; no character is in one (the fake engine's scene has no name), so automations wait.
            MapName: list(350, (i) => `Map${i}`),
            MapAFKtarget: list(350, (i) => (isMap(i) ? mapMob(i) : "Nothing")),
            // [0][0]: the map's kill requirement base.
            MapDetails: list(350, (i) => [[String(10 + (i % 50) * 5), "0", "0"]]),
            // The monsters of each world, in Death Note order.
            DeathNoteMobs: list(7, (w) => list(4, (i) => MONSTERS[(w * 4 + i) % MONSTERS.length])),
        }),
    },
});
