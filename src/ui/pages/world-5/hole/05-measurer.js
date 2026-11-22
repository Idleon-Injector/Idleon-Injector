/**
 * W5 - Hole › Measurer
 *
 * Data sources:
 *   gga.Holes[22][n]          - measurement n's level
 *   cList.HolesInfo[54][n]    - what it boosts, in the game's capitals ("+{%_VILLAGER|EXP_GAIN"; "访" stands for "&")
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, normalCase, toNum } from "../../../components/views/account/accountShared.js";

const MeasurerTab = () =>
    SimpleAccountListPage({
        title: "Measurer",
        description: "The Measurer's measurements, each with what it boosts.",
        label: "Measurer",
        loadingText: "Reading the measurements",
        errorTitle: "Couldn't read the measurements",
        loadEntries: async () => {
            const [rawHoles, rawBonuses] = await Promise.all([gga("Holes"), readCList("HolesInfo[54]")]);
            const levels = toIndexedArray(toIndexedArray(rawHoles ?? [])[22] ?? []);
            return toIndexedArray(rawBonuses ?? [])
                .map((raw, n) => {
                    const bonus = normalCase(bonusText(String(raw ?? "").replace(/\u8bbf/g, "&")));
                    return bonus
                        ? {
                              key: String(n),
                              name: `Measurement ${n + 1}`,
                              bonus,
                              path: `Holes[22][${n}]`,
                              value: toNum(levels[n], 0),
                              formatted: false,
                          }
                        : null;
                })
                .filter(Boolean);
        },
    });

export default definePage({
    id: "w5.hole.measure",
    world: 5,
    system: "Hole",
    tab: "Measurer",
    description: "Measurement levels.",
    keywords: ["Measure", "Measurements"],
    component: MeasurerTab,
});
