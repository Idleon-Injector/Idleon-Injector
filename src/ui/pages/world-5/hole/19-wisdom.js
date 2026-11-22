/**
 * W5 - Hole › Wisdom
 *
 * Data sources:
 *   gga.Holes[14][4]              - the Monument of Wisdom's AFK hours
 *   gga.Holes[11][13]             - time since its last run
 *   gga.Holes[15][20 + n]          - its bonus n's level; cList.HolesInfo[32][20 + n] that bonus in the
 *                                    game's words ("+{%|Mining|Efficiency")
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, toNum } from "../../../components/views/account/accountShared.js";

const MONUMENT = 2;
const BONUSES = 10;

const WisdomTab = () =>
    SimpleAccountListPage({
        title: "Wisdom",
        description: "The Monument of Wisdom: its AFK hours and its bonuses.",
        label: "Wisdom",
        loadingText: "Reading the Monument of Wisdom",
        errorTitle: "Couldn't read the Monument of Wisdom",
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
    id: "w5.hole.wisdom",
    world: 5,
    system: "Hole",
    tab: "Wisdom",
    description: "The Monument of Wisdom's AFK hours and bonuses.",
    keywords: ["Monument", "Monument of Wisdom"],
    component: WisdomTab,
});
