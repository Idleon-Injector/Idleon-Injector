/**
 * The fake game's data. `gga` is gameAttributes.h (CustomLists.h is cList); `computed[method][name]` answers
 * events(N)[method](name, ...). Fixed values only (no Math.random, no Date), so every run looks the same.
 * A page that shows little gets its data here: the report's `misses` lists what pages asked for and didn't get.
 */
const list = (length, value) => Array.from({ length }, (_, i) => value(i));

export const fakeGameData = () => ({
    gga: {
        ItemDefinitionsGET: { h: {} },
        MonsterDefinitionsGET: { h: {} },
        BundlesReceived: { h: { bun_a: 1 } },
        CustomLists: {
            h: {
                ClassNames: ["Blank", "Beginner", "Journeyman", "Maestro", "Warrior", "Barbarian", "Archer", "Mage"],
                SkillNames: ["Blank", "Mining", "Smithing", "Chopping", "Fishing", "Alchemy", "Catching"],
                HolesInfo: list(68, (i) => (i === 67 ? ["Gem_One|a|b|First gem", "Gem_Two|a|b|Second gem"] : [])),
                StatueInfo: ["Power", "Speed", "Mining", "Feasty", "Health", "Kachow", "Lumberbob", "Thicc_Skin"].map(
                    (name) => [`${name}_Statue`, "1", "desc"]
                ),
                BribeDescriptions: [
                    "Insider_Trading",
                    "Tracking_Chips",
                    "Mandatory_Fire_Sale",
                    "Sleeping_On_the_Job",
                ].map((name, i) => [name, "Lowers the cost of things", String(100 * (i + 1)), "1"]),
            },
        },
        OptionsListAccount: list(700, (i) => (i * 13) % 50),
        StampLevel: list(3, (tab) => list(30, (i) => (i * 7 + tab * 3) % 60)),
        StampLevelMAX: list(3, () => list(30, () => 60)),
        StatueLevels: list(8, (i) => [i * 12 + 1, i * 345]),
        StatueG: list(8, (i) => i % 3),
        BribeStatus: [1, 1, 0, 0],
        // [4]: exalted stamp codes; [22]: statue flair levels; [2][78]: flair unlocked.
        Compass: list(5, (i) => (i === 4 ? ["_1", "a0", "b4"] : [])),
        RoyalG: list(23, (i) =>
            i === 22 ? list(8, (j) => j % 5) : i === 2 ? list(79, (k) => (k === 78 ? 1 : 0)) : []
        ),
        GetPlayersUsernames: ["Lumi_Main", "Lumi_Alt"],
        Number2Letter: "_abcdefghijklmnopqrstuvwxyz".split(""),
        AnvilPAstats: [12, 40, 30, 20, 5, 3],
        FurnaceLevels: [5, 10, 15, 20, 25, 30],
    },
    computed: {},
    bundleMessages: {},
    cheatStates: { godlike: { reach: true, crit: true }, w1: { companion: true } },
});
