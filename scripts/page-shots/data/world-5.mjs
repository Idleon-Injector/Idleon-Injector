/** World 5: sailing, divinity, gaming, the hole, slab, greenstack. */
import { fakeName, level, list, upgradeDefs } from "./helpers.mjs";
import { ITEMS } from "./shared.mjs";

const ISLANDS = 12;
const ARTIFACTS = 24;
const BOATS = 8;
const CAPTAINS = 10;
const GODS = 10;
const PALETTE = 37;
const SUPERBITS = 40;

export default () => ({
    gga: {
        // [0] islands unlocked, [1] loot per island, [3] artifact tiers.
        Sailing: [
            list(ISLANDS, (i) => (i < 8 ? 1 : 0)),
            list(ISLANDS, (i) => i * 3500),
            [],
            list(ARTIFACTS, (i) => i % 5),
        ],
        Boats: list(BOATS, (b) => [b % 4, b * 10 + 5, 20 + b * 3, 15 + b * 2, 0, 0, 0, 0]),
        Captains: list(CAPTAINS, (c) => [c % 6, c % 4, (c + 1) % 4, 30 + c * 4, 12.5 + c, 8 + c, 0]),
        // [25] progress toward the next god, [28..37] god levels.
        Divinity: list(40, (i) => (i === 25 ? 640 : i >= 28 && i < 38 ? level(i, 10) : (i * 3) % 12)),
        // [11] log book plants, [12] superbits unlocked (as letters), the rest numbers.
        Gaming: list(14, (i) => (i === 11 ? "jjjhhe" : i === 12 ? "_abcfgk" : 1000 * (i + 1) + i * 37.5)),
        // [33] rat king levels; the rest import slots.
        GamingSprout: list(34, (i) => (i === 33 ? [0, 12, 7, 3] : [i % 5, i * 10, i % 3, 0])),
        Research: { 11: list(10, (i) => i % 4) },
        // [9] palette levels, [49] palette stars.
        Spelunk: { 9: list(PALETTE, (i) => level(i, 25)), 49: list(PALETTE, (i) => i % 3) },
        // The hole keeps one long array per system.
        Holes: list(40, (system) => list(100, (j) => (system * 7 + j * 3) % 25)),
        GreenStacks: Object.keys(ITEMS).slice(0, 12),
        OptionsListAccount: { 192: 77 },
        CustomLists: {
            h: {
                // [0] name, ..., [?] loot per island.
                IslandInfo: list(ISLANDS, (i) => [`${fakeName(i + 4)}_Island`, "1", "10", "100", "5", "desc"]),
                ArtifactInfo: list(ARTIFACTS, (i) => [
                    `${fakeName(i)}_Relic`,
                    "1",
                    "10",
                    `+{%_${fakeName(i + 9)}`,
                    "0",
                    "0",
                ]),
                // [3]: bonus text.
                CaptainBonuses: list(8, (i) => ["0", "1", "10", `+{%_${fakeName(i + 2)}_speed`]),
                GodsInfo: list(GODS, (i) => [`${fakeName(i + 21)}_God`, "1", "1", `+{%_${fakeName(i)}`, "0"]),
                Spelunky: { 25: list(10, (i) => `+{%_${fakeName(i + 13)}_bonus`) },
                GamingUpgrades: upgradeDefs(6, 3),
                RandoListo2: {
                    1: list(10, (i) => `${fakeName(i + 25)}_Import`),
                    11: upgradeDefs(8, 2),
                    12: list(8, (i) => String(10 * (i + 1))),
                },
                GamingPalette: list(PALETTE, (i) => [
                    `${fakeName(i + 2)}_Hue`,
                    "1",
                    "10",
                    `+{%_${fakeName(i + 3)}`,
                    "0",
                ]),
                GamingUpg: list(SUPERBITS, (i) => [
                    `${fakeName(i + 6)}_Bit`,
                    String(i * 10),
                    `+{%_${fakeName(i)}`,
                    "0",
                ]),
                HolesInfo: list(70, (i) =>
                    i === 67
                        ? list(12, (g) => `${fakeName(g)}_Gem|a|b|A_shiny_gem`)
                        : list(30, (j) => `${fakeName(i + j)}_Thing`)
                ),
                HolesBuildings: upgradeDefs(20, 1),
                CosmoUpgrades: list(3, (s) => upgradeDefs(12, s)),
                HoleFountUPG: list(3, (s) => upgradeDefs(10, s + 4)),
                LampWishes: list(12, (i) => [`${fakeName(i + 8)}_Wish`, "1", "5", `+{%_${fakeName(i)}`]),
                SlabItemSort: Object.keys(ITEMS),
            },
        },
    },
});
