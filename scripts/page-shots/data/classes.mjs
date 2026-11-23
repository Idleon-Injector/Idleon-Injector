/**
 * The Classes pages: the masterclasses' upgrades with the game's own lists (classes-game.mjs), their levels, and the
 * bones, dust, tachyons and royal resources they spend.
 */
import { list } from "./helpers.mjs";
import {
    ARCANE_UPG,
    ARMORY_ORDER,
    ARMORY_UPG,
    COMPASS_UPG,
    GRIMOIRE_UPG,
    ORBLET_MARKET,
    ROYAL_RESOURCES,
    ROYAL_STATUES,
} from "./classes-game.mjs";

// A level that looks played: an upgrade with a max is often maxed, one without is somewhere along the way.
const levels = (defs, maxAt) =>
    defs.map((row, i) => {
        const max = Number(row[maxAt]);
        if (i % 6 === 4) return 0;
        if (max < 999999) return i % 3 === 0 ? max : Math.min(max, 1 + ((i * 7) % max));
        return 5 + ((i * 37) % 240);
    });

export default () => ({
    gga: {
        Grimoire: levels(GRIMOIRE_UPG, 4),
        Arcane: levels(ARCANE_UPG, 4),
        Compass: { 0: levels(COMPASS_UPG, 4) },
        // [0] royal statues, [1] royal resources, [2] armory, [4] node collected, [5] node grades, [23] Lil' Orblet Shop.
        RoyalG: {
            0: [3, 1, 0, 7, 0, 0, 0, 0],
            1: list(40, (i) => (i % 10 > 7 ? 0 : (i * 1777) % 25000)),
            2: levels(ARMORY_UPG, 4),
            4: list(80, (i) => (i % 4 === 0 ? -1 : (i * 97) % 600)),
            5: list(80, (i) => i % 4),
            23: levels(ORBLET_MARKET, 3),
        },
        // 329-333: bones (total, femur, ribcage, cranium, bovinae), 367: AFK Bones; 357-362: dust; 388-394: tachyons.
        OptionsListAccount: {
            329: 61950,
            330: 48200,
            331: 9100,
            332: 650,
            333: 0,
            357: 182000,
            358: 41500,
            359: 7300,
            360: 980,
            361: 12,
            362: 231792,
            367: 1,
            388: 820000,
            389: 155000,
            390: 31000,
            391: 4200,
            392: 640,
            393: 9,
            394: 1010849,
        },
        CustomLists: {
            h: {
                GrimoireUpg: GRIMOIRE_UPG,
                ArcaneUpg: ARCANE_UPG,
                CompassUpg: COMPASS_UPG,
                ArmoryUpg: ARMORY_UPG,
                OrbletMarket: ORBLET_MARKET,
                RoyalResources: ROYAL_RESOURCES,
                Research: { 40: ROYAL_STATUES[0], 41: ROYAL_STATUES[1], 42: ROYAL_STATUES[2], 43: ARMORY_ORDER },
            },
        },
    },
});
