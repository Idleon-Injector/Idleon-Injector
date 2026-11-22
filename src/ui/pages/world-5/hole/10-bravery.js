/**
 * W5 - Hole › Bravery
 *
 * Data sources:
 *   gga.Holes[14][0]              - the Monument of Bravery's AFK hours
 *   gga.Holes[11][11]             - time since its last run
 *   gga.Holes[15][0 + n]          - its bonus n's level; cList.HolesInfo[32][0 + n] that bonus in the
 *                                    game's words ("+{%|Mining|Efficiency")
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, toNum } from "../../../components/views/account/accountShared.js";

const MONUMENT = 0;
const BONUSES = 10;

const BraveryTab = () =>
    SimpleAccountListPage({
        title: "Bravery",
        description: "The Monument of Bravery: its AFK hours and its bonuses.",
        label: "Bravery",
        loadingText: "Reading the Monument of Bravery",
        errorTitle: "Couldn't read the Monument of Bravery",
        loadEntries: async () => {
            const [rawHoles, rawBonuses] = await Promise.all([gga("Holes"), readCList("HolesInfo[32]")]);
            const holes = toIndexedArray(rawHoles ?? []).map((part) => toIndexedArray(part ?? []));
            const bonuses = toIndexedArray(rawBonuses ?? []);
            return [
                {
                    key: "afk",
                    section: "Monument",
                    name: "AFK hours",
                    path: `Holes[14][${2 * MONUMENT}]`,
                    value: toNum(holes[14]?.[2 * MONUMENT], 0),
                    float: true,
                },
                {
                    key: "since",
                    section: "Monument",
                    name: "Time since the last run",
                    path: `Holes[11][${11 + MONUMENT}]`,
                    value: toNum(holes[11]?.[11 + MONUMENT], 0),
                },
                ...Array.from({ length: BONUSES }, (_, n) => {
                    const index = BONUSES * MONUMENT + n;
                    return {
                        key: `bonus-${index}`,
                        section: "Bonuses",
                        name: `Bonus ${n + 1}`,
                        bonus: bonusText(bonuses[index]),
                        path: `Holes[15][${index}]`,
                        value: toNum(holes[15]?.[index], 0),
                    };
                }),
            ];
        },
    });

export default definePage({
    id: "w5.hole.bravery",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "Bravery",
    description: "The Monument of Bravery's AFK hours and bonuses.",
    keywords: ["Monument", "Monument of Bravery"],
    component: BraveryTab,
});
