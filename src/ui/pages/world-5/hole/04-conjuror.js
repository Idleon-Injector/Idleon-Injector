/**
 * W5 - Hole › Conjuror
 *
 * Data sources:
 *   gga.Holes[4 + g][n]       - Majik n's level in group g (Hole, Village, Idleon)
 *   cList.CosmoUpgrades[g][n] - [2] the Majik's name, [3] what it does in the game's words
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, cleanName, toNum } from "../../../components/views/account/accountShared.js";

const GROUPS = ["Hole Majik", "Village Majik", "Idleon Majik"];

const ConjurorTab = () =>
    SimpleAccountListPage({
        title: "Conjuror",
        description: "The Conjuror's Majiks, in the game's three groups.",
        label: "Conjuror",
        loadingText: "Reading the Majiks",
        errorTitle: "Couldn't read the Majiks",
        loadEntries: async () => {
            const [rawHoles, rawDefs] = await Promise.all([gga("Holes"), readCList("CosmoUpgrades")]);
            const holes = toIndexedArray(rawHoles ?? []);
            const defs = toIndexedArray(rawDefs ?? []);
            return GROUPS.flatMap((section, g) => {
                const levels = toIndexedArray(holes[4 + g] ?? []);
                return toIndexedArray(defs[g] ?? []).map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    const name = cleanName(def[2], `${section} ${n + 1}`);
                    return {
                        key: `${g}-${n}`,
                        section,
                        name,
                        bonus: bonusText(def[3]),
                        path: `Holes[${4 + g}][${n}]`,
                        value: toNum(levels[n], 0),
                        formatted: false,
                    };
                });
            });
        },
    });

export default definePage({
    id: "w5.hole.cosmo",
    world: 5,
    system: "Hole",
    tab: "Conjuror",
    description: "Hole, Village and Idleon Majik levels.",
    keywords: ["Cosmo", "Majiks", "Hole Majik", "Village Majik", "Idleon Majik"],
    component: ConjurorTab,
});
