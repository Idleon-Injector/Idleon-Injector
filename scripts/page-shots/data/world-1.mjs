/** World 1: stamps, anvil, forge, statues, star signs, pets, bribes, owl. */
import { h, list } from "./helpers.mjs";
import { BRIBES, COMPANIONS, COMPANION_SETS, PET_NAMES, STAMPS, STAR_QUESTS, STATUES } from "./world-1-game.mjs";
// Talent 281 adds this many Anvil points per 10 Smithing levels. Shared by every call, so two calls compare equal.
const talentNumber = (talent) => (talent === 281 ? 2 : 0);
// How many stamps each page has in the game (Combat, Skills, Misc).
const STAMP_COUNTS = ["A", "B", "C"].map((page) => Object.keys(STAMPS).filter((key) => key[5] === page).length);
const OWL_LEVELS = [14, 3, 9, 6, 2, 0, 1, 0, 0];
// One function for every read, so the data is the same each time it's built.
const owlCost = (i) => 25 * 6 ** i * 1.4 ** OWL_LEVELS[i];
const OWL_UPGRADES = [
    "Feather_Generation",
    "Bonuses_of_Orion",
    "Feather_Multiplier",
    "Feather_Cheapener",
    "Feather_Restart",
    "Super_Feather_Production",
    "Shiny_Feathers",
    "Super_Feather_Cheapener",
    "The_Great_Mega_Reset",
];
const POPPY_UPGRADES = [
    "Tasty_Fishbait",
    "Quick_Reeling",
    "Shiny_Lure",
    "Bonuses_of_Poppy",
    "Fishy_Discount",
    "Juicy_Worm",
    "Fisheroo_Reset",
    "Fishing_Buddy",
    "Lightning_Quickness",
    "Fisheroo_Investing",
    "Multihook_Fishing",
    "Greatest_Catch",
];
const TAR_PIT_UPGRADES = [
    "Tar_Bait",
    "Sticky_Reel",
    "Deep_Lure",
    "Tar_Discount",
    "Oily_Worm",
    "Pit_Buddy",
    "Black_Magnet",
    "Slick_Hook",
];

// The game's own Owlz [4] (the real-game bonus), [5] (the upgrade's line, with marks the menu fills in) and [6] (what a
// level adds), rows 0-28 in order, so the automation tab shows the game's words.
const OWL_TEXTS = [
    ["{/sec", "Generates_}_feather_per_second", "0"],
    ["+{%_Class_XP", "Gain_a_permanent_bonus_in_the_real_game!_This_upgrade_never_resets.", "0"],
    ["+{_Base_DMG", "Boosts_feather_generation_by_+}%", "0"],
    ["+{%_Total_DMG", "All_feather_upgrades_are_@%_cheaper", "0"],
    ["+{%_Skill_XP", "Reset_almost_all_Upgrades_and_Feathers._Generate_{x_Feathers", "0"],
    ["+{%_Drop_Rate", "Generates_+}_more_feathers_per_second", "0"],
    ["+{_All_Stat", "Rare_chance_for_a_Shiny_Feather,_each_one_gives_+}%_feather_generation", "0"],
    ["{", "All_feather_upgrades_are_}%_cheaper", "0"],
    ["Nah", "Reset_almost_everything._Gain_a_permanent_Megafeather", "0"],
    ["{/minute", "Catch_{_Fish_every_30_seconds", "10"],
    ["+{%_Fish_Efficiency", "Bluefin_fishing_speed_is_]x_Faster", "5"],
    ["+{_Defence", "Catch_Shiny_Fish_at_a_rate_of_{%/hr", "50"],
    ["+{%_Fishing_XP", "Gain_a_permanent_bonus_in_the_real_game!", "10"],
    ["+{%_Accuracy", "All_fish_upgrades_are_~%_cheaper", "10"],
    ["+{%_Total_DMG", "Catch_+{_more_Bluefin_Fish_each_time", "50"],
    ["+{%_AFK_Gains", "Reset_all_upgrades_and_fish_for_bonuses!", "1"],
    ["+{%_Cash", "Recruit_a_new_Bluefin_fisherman!", "1"],
    ["Nah", "Shiny_fishing_speed_is_]x_faster", "5"],
    ["Nah", "Next_Fisheroo_Reset_gives_+{_more_pts!", "1"],
    ["Nah", "Catch_+{_more_Bluefin_Fish_each_time", "200"],
    ["Nah", "Reset_it_all._Gain_a_permanent_Megafish", "5"],
    ["+{%_Accuracy", "Catch_+{_more_Bluefin_Fish_each_time", "100"],
    ["+{%_Total_DMG", "+?%_chance_for_extra_shiny_catches", "700"],
    ["+{%_AFK_Gains", "Boosts_the_amount_of_Bluefin_Fish_caught_by_+{%", "8"],
    ["+{%_Cash", "All_bluefin_fish_upgrades_are_~%_cheaper", "15"],
    ["Nah", "Catch_Tartar_Fish_]x_faster", "5"],
    ["Nah", "Next_Fisheroo_Reset_gives_+{_more_pts_to_spend!", "1"],
    ["Nah", "Multipliers_in_Shiny_Fishing_show_up_?%_more_often!", "30"],
    ["Nah", "Catch_+{_more_Bluefin_Fish_every_100_seconds", "1000"],
];

export default () => ({
    gga: {
        StampLevel: list(3, (tab) => list(STAMP_COUNTS[tab], (i) => (i * 7 + tab * 3) % 60)),
        StampLevelMAX: list(3, (tab) => list(STAMP_COUNTS[tab], () => 60)),
        StatueLevels: list(STATUES.length, (i) => [i * 12 + 1, i * 345]),
        StatueG: list(STATUES.length, (i) => i % 3),
        // Each stamp's name and bonus, as the game defines them.
        ItemDefinitionsGET: h(
            Object.fromEntries(
                Object.entries(STAMPS).map(([key, [displayName, desc]]) => [key, h({ displayName, desc_line1: desc })])
            )
        ),
        // Bribes owned (1), not owned (0) or locked (-1): sets 1 and 2 bought in part, set 3 open, the rest locked.
        BribeStatus: list(BRIBES.length, (i) => (i < 6 ? (i % 3 ? 1 : 0) : i < 13 ? i % 2 : i < 20 ? 0 : -1)),
        // [4]: exalted stamp codes; [22]: statue flair levels; [2][78]: flair unlocked.
        Compass: { 4: ["_1", "a0", "b4"] },
        RoyalG: { 2: list(79, (k) => (k === 78 ? 1 : 0)), 22: list(STATUES.length, (j) => j % 5) },
        // Points left = Smithing level (Lv0[2], 34) + SkillLevels[281] (67) + talent 281's number (2) × 3 + 40 + 30
        // − (90 + 50 + 25) = 12, as the game works it out.
        AnvilPAstats: [12, 40, 30, 90, 50, 25],
        FurnaceLevels: [5, 10, 15, 20, 25, 30],
        // Star signs: [players who finished it, as letters; claimed].
        StarSignProg: list(STAR_QUESTS.length, (i) => [["_ab", "_", "", "_abc"][i % 4], i % 3 === 0 ? 1 : 0]),
        // Pet bonus tokens picked, as "id,id". 253: feathers, 254-262: Orion's upgrade levels, 263: feathers produced
        // this run.
        OptionsListAccount: {
            606: "2,5",
            253: 4.2e9,
            ...Object.fromEntries(OWL_LEVELS.map((level, i) => [254 + i, level])),
            263: 6.5e10,
        },
        CustomLists: {
            h: {
                // The game's statues: [name in capitals, bonus, bar hue, bonus per level, world].
                StatueInfo: STATUES,
                BribeDescriptions: BRIBES,
                // [map, x, y, req, req, players needed, star points, description, type]
                StarQuests: STAR_QUESTS,
                CompanionDB: COMPANIONS,
                CompanionSetsInfo: COMPANION_SETS,
                // Rows 0-8 are Orion's upgrades (World 1), 9-20 Poppy's and 21-28 the Tar Pit's (World 2);
                // [name, ..., feathers or fish produced that unlock it, the game's texts].
                Owlz: [
                    ...OWL_UPGRADES.map((name, i) => [
                        name,
                        "0",
                        "0",
                        String(i === 0 ? 0 : 1e3 * 10 ** i),
                        ...OWL_TEXTS[i],
                    ]),
                    ...POPPY_UPGRADES.map((name, i) => [
                        name,
                        "0",
                        "0",
                        String(i === 0 ? 0 : 500 * 4 ** i),
                        ...OWL_TEXTS[9 + i],
                    ]),
                    ...TAR_PIT_UPGRADES.map((name, i) => [name, "0", "0", "0", ...OWL_TEXTS[21 + i]]),
                ],
            },
        },
        MonsterDefinitionsGET: h(
            Object.fromEntries(Object.entries(PET_NAMES).map(([key, Name]) => [key, h({ Name })]))
        ),
    },
    computed: {
        _customBlock_Stuff2: { PetBonusTokensOwned: 2 },
        _customBlock_GetTalentNumber: { 1: talentNumber },
        // Orion's next level: a price that grows with the row and its level; feathers made per second.
        _customBlock_Summoning: {
            OwlCost: owlCost,
            OwlFeatherRate: 3.1e6,
        },
    },
    companions: ["0,0,0,0,1", "1,0,0,0,0", "4,0,0,0,1", "9,0,0,0,0"],
});
