/**
 * W5 - Hole › Justice
 *
 * Data sources:
 *   gga.Holes[14][2]              - the Monument of Justice's AFK hours
 *   gga.Holes[11][12]             - time since its last run
 *   gga.Holes[15][10 + n]          - its bonus n's level; cList.HolesInfo[32][10 + n] that bonus in the
 *                                    game's words ("+{%|Mining|Efficiency")
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, toNum } from "../../../components/views/account/accountShared.js";

const MONUMENT = 1;
const BONUSES = 10;

const JusticeTab = () =>
    SimpleAccountListPage({
        title: "Justice",
        description: "The Monument of Justice: its AFK hours and its bonuses.",
        label: "Justice",
        loadingText: "Reading the Monument of Justice",
        errorTitle: "Couldn't read the Monument of Justice",
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
    id: "w5.hole.justice",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "Justice",
    description: "The Monument of Justice's AFK hours and bonuses.",
    keywords: ["Monument", "Monument of Justice"],
    component: JusticeTab,
});
