/**
 * W5 - Hole › Librarian
 *
 * Data sources:
 *   gga.Holes[26][c]          - the Librarian's study level for cavern c
 *   cList.HolesInfo[68][c]    - the cavern's name ("THE_WELL"); "BRUH" marks a cavern still to come
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { normalCase, toNum } from "../../../components/views/account/accountShared.js";

const LibrarianTab = () =>
    SimpleAccountListPage({
        title: "Librarian",
        description: "The Librarian's study level for each cavern.",
        label: "Librarian",
        loadingText: "Reading the studies",
        errorTitle: "Couldn't read the studies",
        loadEntries: async () => {
            const [rawHoles, rawCaverns] = await Promise.all([gga("Holes"), readCList("HolesInfo[68]")]);
            const levels = toIndexedArray(toIndexedArray(rawHoles ?? [])[26] ?? []);
            return toIndexedArray(rawCaverns ?? [])
                .map((raw, c) => {
                    const name = normalCase(raw);
                    return name && name !== "Bruh"
                        ? {
                              key: String(c),
                              name,
                              path: `Holes[26][${c}]`,
                              value: toNum(levels[c], 0),
                              formatted: false,
                          }
                        : null;
                })
                .filter(Boolean);
        },
    });

export default definePage({
    id: "w5.hole.studies",
    world: 5,
    system: "Hole",
    group: "Villagers",
    tab: "Librarian",
    description: "Study levels for each cavern.",
    keywords: ["Studies", "Study"],
    component: LibrarianTab,
});
