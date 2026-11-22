/**
 * W5 - Hole › The Cove
 *
 * Data sources (all gga.OptionsListAccount):
 *   [630 + n]        - Crystal Glunko upgrade n's level; cList.RandoListo2[11][n] its name, [12][n] its bonus
 *   [654 + s]        - how many of shape s you have (0-5 blue, 6-11 purple); ItemDefinitionsGET.h.HoleGshape{s} names it
 *   [666], [667]     - the blue and purple shape in focus (0 none, 1-6 a shape)
 *   [604]            - upgrades bought today
 *   [668]            - Crystal Glunko kills
 */

import { definePage } from "../../../menu/menuModel.js";
import { readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleAccountListPage } from "../../../components/views/account/components/SimpleAccountListPage.js";
import { bonusText, cleanName, toInt, toNum, unwrapH } from "../../../components/views/account/accountShared.js";

const UPGRADE_START = 630;
const SHAPE_START = 654;
const SHAPES = 12;
const PER_COLOUR = 6;
const FOCUS = [
    { option: 666, colour: "Blue", from: 0 },
    { option: 667, colour: "Purple", from: PER_COLOUR },
];
const BOUGHT_TODAY = 604;
const KILLS = 668;

const TheCoveTab = () =>
    SimpleAccountListPage({
        title: "The Cove",
        description: "Crystal Glunko upgrades, shapes and the shapes in focus.",
        label: "The Cove",
        loadingText: "Reading the cove",
        errorTitle: "Couldn't read the cove",
        loadEntries: async () => {
            const [rawNames, rawBonuses] = await Promise.all([
                readCList("RandoListo2[11]"),
                readCList("RandoListo2[12]"),
            ]);
            const names = toIndexedArray(rawNames ?? []);
            const bonuses = toIndexedArray(rawBonuses ?? []);
            const shapeIds = Array.from({ length: SHAPES }, (_, s) => `HoleGshape${s}`);
            const optionKeys = [
                ...names.map((_, n) => UPGRADE_START + n),
                ...shapeIds.map((_, s) => SHAPE_START + s),
                ...FOCUS.map((focus) => focus.option),
                BOUGHT_TODAY,
                KILLS,
            ].map(String);
            const [options, items] = await Promise.all([
                readGgaEntries("OptionsListAccount", optionKeys),
                readGgaEntries("ItemDefinitionsGET.h", shapeIds, ["displayName"]),
            ]);
            const option = (index) => options[String(index)] ?? 0;
            const shapeName = (s) => cleanName(unwrapH(items[shapeIds[s]])?.displayName, `Shape ${s + 1}`);
            return [
                ...names
                    .map((raw, n) => {
                        const name = cleanName(raw);
                        // The game's placeholder for an upgrade still to come ("World 7 Skill 3 my man, not yet").
                        if (!name || /not yet/i.test(String(bonuses[n] ?? ""))) return null;
                        return {
                            key: `upgrade-${n}`,
                            section: "Upgrades",
                            name,
                            bonus: bonusText(bonuses[n]),
                            path: `OptionsListAccount[${UPGRADE_START + n}]`,
                            value: toInt(option(UPGRADE_START + n), { min: 0 }),
                            formatted: false,
                        };
                    })
                    .filter(Boolean),
                ...shapeIds.map((_, s) => ({
                    key: `shape-${s}`,
                    section: s < PER_COLOUR ? "Blue shapes" : "Purple shapes",
                    name: shapeName(s),
                    path: `OptionsListAccount[${SHAPE_START + s}]`,
                    value: toNum(option(SHAPE_START + s), 0),
                    float: true,
                })),
                ...FOCUS.map((focus) => ({
                    key: `focus-${focus.option}`,
                    section: "Focus",
                    name: `${focus.colour} shape in focus`,
                    path: `OptionsListAccount[${focus.option}]`,
                    value: toInt(option(focus.option), { min: 0 }),
                    // 0 is none; 1 to 6 pick a shape of that colour, named before the field.
                    min: 0,
                    max: PER_COLOUR,
                    formatted: false,
                    badge: (picked) => (Number(picked) > 0 ? shapeName(focus.from + Number(picked) - 1) : "None"),
                })),
                {
                    key: "today",
                    section: "Focus",
                    name: "Upgrades bought today",
                    path: `OptionsListAccount[${BOUGHT_TODAY}]`,
                    value: toInt(option(BOUGHT_TODAY), { min: 0 }),
                    formatted: false,
                },
                {
                    key: "kills",
                    section: "Focus",
                    name: "Crystal Glunko kills",
                    path: `OptionsListAccount[${KILLS}]`,
                    value: toNum(option(KILLS), 0),
                },
            ];
        },
    });

export default definePage({
    id: "w5.hole.crystalcove",
    world: 5,
    system: "Hole",
    tab: "The Cove",
    description: "Crystal Glunko Cove upgrades, shapes, focus and kills.",
    keywords: ["Crystal Cove", "Crystal Glunko Cove", "Cglunko", "Shapes"],
    component: TheCoveTab,
});
