/**
 * W5 - Hole › The Well
 *
 * Data sources:
 *   gga.Holes[9][n]   - how much of layer resource n you have (Gravel, Goldust, ...)
 *   gga.Holes[8][n]   - how many of the Well's bars for resource n are filled
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { toNum } from "../../../components/views/account/accountShared.js";

const RESOURCES = [
    "Gravel",
    "Goldust",
    "Redstone",
    "Mythril",
    "Cobaltine",
    "Bruntine",
    "Freezium",
    "Sweetium",
    "Rad Coral",
    "Hyper Coral",
];

const TheWellTab = () =>
    SimpleAccountListPage({
        title: "The Well",
        description: "The resources you've dug up, and the Well's filled bars.",
        label: "The Well",
        loadingText: "Reading the well",
        errorTitle: "Couldn't read the well",
        loadEntries: async () => {
            const holes = toIndexedArray((await gga("Holes")) ?? []);
            const amounts = toIndexedArray(holes[9] ?? []);
            const bars = toIndexedArray(holes[8] ?? []);
            return [
                ...RESOURCES.map((name, n) => ({
                    key: `amount-${n}`,
                    section: "Resources",
                    name,
                    path: `Holes[9][${n}]`,
                    value: toNum(amounts[n], 0),
                    float: true,
                })),
                ...RESOURCES.map((name, n) => ({
                    key: `bars-${n}`,
                    section: "Bars filled",
                    name,
                    path: `Holes[8][${n}]`,
                    value: toNum(bars[n], 0),
                })),
            ];
        },
    });

export default definePage({
    id: "w5.hole.well",
    world: 5,
    system: "Hole",
    group: "Caverns",
    tab: "The Well",
    description: "Layer resources and the Well's filled bars.",
    keywords: ["Well", "Ores", "Gravel", "Bars"],
    component: TheWellTab,
});
