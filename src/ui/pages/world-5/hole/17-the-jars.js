/**
 * W5 - Hole › The Jars
 *
 * Data sources:
 *   gga.Holes[9][20 + n]            - how many of rupie n you have
 *   gga.Holes[11][38], [39]         - white and black rupies found in all
 *   gga.Holes[24][n]                - collectible n's level; cList.HolesInfo[67][n] "NAME|base|Filler|bonus"
 *   gga.Holes[11][40 + n]           - jars of kind n destroyed
 *   gga.OptionsListAccount[355]     - Rupie Slugs (a past gem shop buy): each multiplies Jar Rupie value by 1.5
 *                                     (_customBlock_Holes: Math.pow(1.5, OLA[355])), and one slug walks the cavern
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, normalCase, toNum } from "../../../components/views/account/accountShared.js";

const RUPIES = 10;
const COLLECTIBLES = 40;
const JARS = ["Simple", "Tall", "Ornate", "Great", "Enchanted", "Artisan", "Epic", "Gilded", "Ceremony", "Heirloom"];

const TheJarsTab = () =>
    SimpleAccountListPage({
        title: "The Jars",
        description: "Rupies, collectibles and the jars you've broken.",
        label: "The Jars",
        loadingText: "Reading the jars",
        errorTitle: "Couldn't read the jars",
        loadEntries: async () => {
            const [rawHoles, rawCollectibles, slugs] = await Promise.all([
                gga("Holes"),
                readCList("HolesInfo[67]"),
                gga("OptionsListAccount[355]"),
            ]);
            const holes = toIndexedArray(rawHoles ?? []);
            const amounts = toIndexedArray(holes[9] ?? []);
            const stats = toIndexedArray(holes[11] ?? []);
            const levels = toIndexedArray(holes[24] ?? []);
            const collectibles = toIndexedArray(rawCollectibles ?? []).slice(0, COLLECTIBLES);
            return [
                {
                    key: "slugs",
                    section: "Gem shop",
                    name: "Rupie Slugs",
                    bonus: "1.5x Jar Rupie value each",
                    path: "OptionsListAccount[355]",
                    value: toNum(slugs, 0),
                    formatted: false,
                },
                ...Array.from({ length: RUPIES }, (_, n) => ({
                    key: `rupie-${n}`,
                    section: "Rupies",
                    name: `Rupie ${n + 1}`,
                    path: `Holes[9][${20 + n}]`,
                    value: toNum(amounts[20 + n], 0),
                    float: true,
                })),
                {
                    key: "white",
                    section: "Rupies",
                    name: "White rupies found",
                    path: "Holes[11][38]",
                    value: toNum(stats[38], 0),
                },
                {
                    key: "black",
                    section: "Rupies",
                    name: "Black rupies found",
                    path: "Holes[11][39]",
                    value: toNum(stats[39], 0),
                },
                ...collectibles.map((raw, n) => {
                    const [name, , , bonus] = String(raw ?? "").split("|");
                    return {
                        key: `collectible-${n}`,
                        section: "Collectibles",
                        name: normalCase(name || `Collectible ${n + 1}`),
                        bonus: bonusText(bonus),
                        path: `Holes[24][${n}]`,
                        value: toNum(levels[n], 0),
                        formatted: false,
                    };
                }),
                ...JARS.map((jar, n) => ({
                    key: `jar-${n}`,
                    section: "Jars broken",
                    name: `${jar} Jars`,
                    path: `Holes[11][${40 + n}]`,
                    value: toNum(stats[40 + n], 0),
                })),
            ];
        },
    });

export default definePage({
    id: "w5.hole.jar",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "The Jars",
    description: "Rupies, collectibles, jars broken and Rupie Slugs.",
    keywords: ["Jar", "Rupies", "Collectibles", "Rupie Slugs", "Rupie Slug", "Gem shop", "Limited", "Fomo"],
    component: TheJarsTab,
});
