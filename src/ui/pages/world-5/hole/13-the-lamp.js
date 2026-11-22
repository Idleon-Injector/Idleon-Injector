/**
 * W5 - Hole › The Lamp
 *
 * Data sources:
 *   gga.Holes[21][n]        - wish n's level; cList.LampWishes[n][0] its name
 *   gga.Holes[11][24]       - how many of the Lamp's bonuses are unlocked (up to 11)
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { cleanName, toNum } from "../../../components/views/account/accountShared.js";

const BONUSES_MAX = 11;

const TheLampTab = () =>
    SimpleAccountListPage({
        title: "The Lamp",
        description: "The Lamp's wishes, and how many of its bonuses are unlocked.",
        label: "The Lamp",
        loadingText: "Reading the lamp",
        errorTitle: "Couldn't read the lamp",
        loadEntries: async () => {
            const [rawHoles, rawWishes] = await Promise.all([gga("Holes"), readCList("LampWishes")]);
            const holes = toIndexedArray(rawHoles ?? []);
            const wishes = toIndexedArray(holes[21] ?? []);
            return [
                {
                    key: "bonuses",
                    section: "Lamp",
                    name: "Bonuses unlocked",
                    path: "Holes[11][24]",
                    value: toNum(toIndexedArray(holes[11] ?? [])[24], 0),
                    max: BONUSES_MAX,
                    formatted: false,
                },
                ...toIndexedArray(rawWishes ?? [])
                    .map((raw, n) => {
                        const wish = toIndexedArray(raw ?? []);
                        const name = cleanName(wish[0]);
                        return name
                            ? {
                                  key: `wish-${n}`,
                                  section: "Wishes",
                                  name,
                                  path: `Holes[21][${n}]`,
                                  value: toNum(wishes[n], 0),
                              }
                            : null;
                    })
                    .filter(Boolean),
            ];
        },
    });

export default definePage({
    id: "w5.hole.lamp",
    world: 5,
    system: "Hole",
    tab: "The Lamp",
    description: "Lamp wishes and how many lamp bonuses are unlocked.",
    keywords: ["Lamp", "Wishes"],
    component: TheLampTab,
});
