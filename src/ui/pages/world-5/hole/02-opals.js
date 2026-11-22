/**
 * W5 - Hole › Opals
 *
 * Data sources:
 *   gga.Holes[7][c]          - opals found in cavern c
 *   cList.HolesInfo[68][c]   - the cavern's name ("THE_WELL"); "BRUH" marks a cavern still to come
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { normalCase, toNum } from "../../../components/views/account/accountShared.js";

const OpalsTab = () =>
    SimpleAccountListPage({
        title: "Opals",
        description: "The opals found in each cavern.",
        label: "Opals",
        loadingText: "Reading the opals",
        errorTitle: "Couldn't read the opals",
        loadEntries: async () => {
            const [rawHoles, rawCaverns] = await Promise.all([gga("Holes"), readCList("HolesInfo[68]")]);
            const opals = toIndexedArray(toIndexedArray(rawHoles ?? [])[7] ?? []);
            return toIndexedArray(rawCaverns ?? [])
                .map((raw, c) => {
                    const name = normalCase(raw);
                    return name && name !== "Bruh"
                        ? { key: String(c), name, path: `Holes[7][${c}]`, value: toNum(opals[c], 0), formatted: false }
                        : null;
                })
                .filter(Boolean);
        },
    });

export default definePage({
    id: "w5.hole.opals",
    world: 5,
    system: "Hole",
    group: "Villagers",
    tab: "Opals",
    description: "Opals found in each cavern.",
    keywords: ["Caverns", "Explorer"],
    component: OpalsTab,
});
