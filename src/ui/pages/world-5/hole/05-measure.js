import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { cleanNameEffect, toNum } from "../../../components/views/account/accountShared.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";

const MeasureTab = () =>
    SimpleAccountListPage({
        title: "MEASURE",
        description: "Edit Villager Measure upgrade levels from Holes[22].",
        label: "Hole Measure",
        sectionTitle: "MEASURE UPGRADES",
        loadEntries: async () => {
            const [holes, effects] = await Promise.all([gga("Holes"), readCList("HolesInfo[54]")]);
            const values = toIndexedArray(toIndexedArray(holes)[22]);
            const names = toIndexedArray(effects ?? []);
            return values
                .map((value, index) => {
                    const name = cleanNameEffect(names[index], "")
                        .replace(/\u8bbf/g, "&")
                        .trim();
                    if (!name) return null;
                    return {
                        key: `measure-${index}`,
                        index,
                        name,
                        path: `Holes[22][${index}]`,
                        value: toNum(value, 0),
                    };
                })
                .filter(Boolean);
        },
    });

export default definePage({
    id: "w5.hole.measure",
    world: 5,
    system: "Hole",
    tab: "Measure",
    description: "Villager Measure upgrade levels.",
    component: MeasureTab,
});
