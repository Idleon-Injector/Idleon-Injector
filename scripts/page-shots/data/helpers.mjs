/** Small builders for the invented game data. Everything is a pure function of its index, so runs match. */

export const list = (length, value) => Array.from({ length }, (_, i) => value(i));

const FIRST = [
    "Copper",
    "Mossy",
    "Frost",
    "Ember",
    "Lucky",
    "Grand",
    "Tiny",
    "Royal",
    "Sleepy",
    "Golden",
    "Hollow",
    "Velvet",
];
const SECOND = ["Spark", "Bloom", "Stone", "Fang", "Drift", "Crown", "Lantern", "Pebble", "Whisker", "Tide", "Bramble"];

/** A made-up game name like "Frost_Fang" (underscores, as the game writes them). */
export const fakeName = (i) =>
    `${FIRST[i % FIRST.length]}_${SECOND[(i * 7 + Math.floor(i / FIRST.length)) % SECOND.length]}`;

/** The game's Haxe map wrapper. */
export const h = (value) => ({ h: value });

/** A level that looks played: a few zeros, a few maxed, the rest in between. */
export const level = (i, max) => (i % 7 === 3 ? 0 : i % 5 === 0 ? max : 1 + ((i * 13) % max));

/** Upgrade definitions as most shops write them: [name, cost, cost growth, ?, max level, description]. */
export const upgradeDefs = (count, seed = 0, maxAt = 4) =>
    list(count, (i) => {
        const row = [fakeName(i + seed), "10", "1.1", "0", "0", `+{%_${fakeName(i + seed + 1)}_bonus`, "0"];
        row[maxAt] = String([5, 10, 25, 50, 100][(i + seed) % 5]);
        return row;
    });

/** Levels for `upgradeDefs` rows: some zero, some maxed. */
export const upgradeLevels = (count, seed = 0) => list(count, (i) => level(i, [5, 10, 25, 50, 100][(i + seed) % 5]));
