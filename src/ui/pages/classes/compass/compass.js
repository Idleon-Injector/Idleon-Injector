/**
 * Classes - Compass (Wind Walker)
 *
 * One page, the Compass's paths as its tabs (Elemental, Fighter, Survival, Nomadic, Abominations), then the dust that
 * buys them.
 *
 * Data sources:
 *   gga.Compass[0][n]               - Compass upgrade n's level (cList.CompassUpg: [0] name, [4] max level, 999999 for
 *                                     none, [10] its path, [11] its line; abominations past the last real one say
 *                                     "Titan_doesnt_exist")
 *   gga.OptionsListAccount[357-362] - dust: Stardust, Moondust, Solardust, Cooldust, Novadust, collected in all
 */

import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { MasterclassPage, UpgradesPart } from "../../../components/views/account/masterclassParts.js";
import { toNum } from "../../../components/views/account/accountShared.js";

// The paths in the game's order, by the number in an upgrade's [10].
const PATHS = [
    { id: "elemental", label: "Elemental", keywords: ["Pathfinder", "Elemental Path"] },
    { id: "fighter", label: "Fighter", keywords: ["Fighter Path", "Tempest Damage"] },
    { id: "survival", label: "Survival", keywords: ["Survival Path", "Tempest Defence"] },
    { id: "nomadic", label: "Nomadic", keywords: ["Nomadic Path", "Moon of"] },
    {
        id: "abominations",
        label: "Abominations",
        keywords: ["Abomination Slayer"],
        words: ["abomination", "abominations"],
    },
];

const pathTab = (path, p) => ({
    ...path,
    part: ({ pending, reload, bulk }) =>
        UpgradesPart({
            levelsPath: "Compass[0]",
            definitions: "CompassUpg",
            only: (def) => Number(def[10]) === p,
            words: path.words ?? [`${path.label} upgrade`, `${path.label} upgrades`],
            pending,
            reload,
            bulk,
        }),
});

const DUST = [
    { key: "stardust", name: "Stardust", index: 357 },
    { key: "moondust", name: "Moondust", index: 358 },
    { key: "solardust", name: "Solardust", index: 359 },
    { key: "cooldust", name: "Cooldust", index: 360 },
    { key: "novadust", name: "Novadust", index: 361 },
    { key: "total", name: "Dust collected", index: 362 },
];

const DustTab = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const values = await Promise.all(DUST.map((dust) => gga(`OptionsListAccount[${dust.index}]`)));
            list.show(
                DUST.map((dust, i) => ({
                    key: dust.key,
                    name: dust.name,
                    path: `OptionsListAccount[${dust.index}]`,
                    value: toNum(values[i], 0),
                }))
            );
        },
    };
};

const TABS = [...PATHS.map(pathTab), { id: "dust", label: "Dust", part: DustTab, keywords: ["Stardust", "Novadust"] }];

export default definePage({
    id: "classes.compass",
    world: "classes",
    system: "Compass",
    description: "The Wind Walker's Compass upgrades and dust.",
    keywords: ["Wind Walker", "Windwalker", "Tempest", "Masterclass"],
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: () =>
        MasterclassPage({
            name: "Compass",
            page: "classes.compass",
            description: "The Wind Walker's Compass upgrades and dust.",
            automation: { page: "automation.masterclasses", tab: "compass" },
            tabs: TABS,
        }),
});
