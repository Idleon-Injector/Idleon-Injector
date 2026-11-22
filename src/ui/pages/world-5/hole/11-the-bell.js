/**
 * W5 - Hole › The Bell
 *
 * Data sources:
 *   gga.Holes[16][n]          - improvement method n's level; cList.HolesInfo[60][n] its bonus ("+{%_Bell_Ring/hr")
 *   gga.Holes[17][n]          - random bonus n's level; cList.HolesInfo[59][2n] its bonus ("+{%_BUCKET|FILL_RATE")
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, normalCase, toNum } from "../../../components/views/account/accountShared.js";

const TheBellTab = () =>
    SimpleAccountListPage({
        title: "The Bell",
        description: "The Bell's improvement methods and its random bonuses.",
        label: "The Bell",
        loadingText: "Reading the bell",
        errorTitle: "Couldn't read the bell",
        loadEntries: async () => {
            const [rawHoles, rawRandom, rawMethods] = await Promise.all([
                gga("Holes"),
                readCList("HolesInfo[59]"),
                readCList("HolesInfo[60]"),
            ]);
            const holes = toIndexedArray(rawHoles ?? []);
            const methods = toIndexedArray(holes[16] ?? []);
            const random = toIndexedArray(holes[17] ?? []);
            const randomDefs = toIndexedArray(rawRandom ?? []).filter((_, i) => i % 2 === 0);
            return [
                ...toIndexedArray(rawMethods ?? []).map((raw, n) => ({
                    key: `method-${n}`,
                    section: "Improvement methods",
                    name: `Method ${n + 1}`,
                    bonus: bonusText(raw),
                    path: `Holes[16][${n}]`,
                    value: toNum(methods[n], 0),
                })),
                ...randomDefs.map((raw, n) => ({
                    key: `random-${n}`,
                    section: "Random bonuses",
                    name: `Bonus ${n + 1}`,
                    // The game writes these in capitals ("BUCKET FILL RATE").
                    bonus: normalCase(bonusText(raw)),
                    path: `Holes[17][${n}]`,
                    value: toNum(random[n], 0),
                })),
            ];
        },
    });

export default definePage({
    id: "w5.hole.bell",
    world: 5,
    system: "Hole",
    tab: "The Bell",
    description: "Bell improvement methods and random bonuses.",
    keywords: ["Bell", "Bell Ring", "Bell Clean", "Bell Ping"],
    component: TheBellTab,
});
