/**
 * W5 - Gaming › Garden
 *
 * Data sources:
 *   gga.Gaming[0]                 - Bits
 *   gga.Gaming[5]                 - DNA
 *   gga.Gaming[1..3]              - the sprout upgrades' levels; cList.GamingUpgrades[n][0] their names
 *   gga.Gaming[4]                 - mutations unlocked (up to 8)
 *   gga.Gaming[7]                 - the Evolve upgrade's level
 *   gga.Gaming[11]                - the Log Book: one letter per plant for how many of its 10 forms are found
 *                                   (Number2Letter: "_" none, "a" one ... "j" all ten); plants past the end have none
 *
 * The garden's own screen as one list: what it holds, its upgrades, then the Log Book, a plant a line.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    cleanName,
    createIndexedStateGetter,
    toInt,
    toNum,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const LETTERS = "_abcdefghij";
const PLANTS = 10;
const FORMS = LETTERS.length - 1;
const HELD = [
    { key: 0, name: "Bits" },
    { key: 5, name: "DNA" },
];
const UPGRADES = [1, 2, 3];

const GardenTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Garden" });
    const getState = createIndexedStateGetter(0);
    const getFoundState = createIndexedStateGetter(0);
    const upgradeNames = UPGRADES.map((_, i) => van.state(`Sprout upgrade ${i + 1}`));

    const heldRows = HELD.map((held) =>
        SimpleNumberRow({
            entry: { name: held.name, path: `Gaming[${held.key}]`, float: true },
            valueState: getState(held.key),
        })
    );
    const upgradeRows = UPGRADES.map((key, i) =>
        ClampedLevelRow({
            valueState: getState(key),
            writePath: `Gaming[${key}]`,
            integerMode: "trunc",
            name: () => upgradeNames[i].val,
        })
    );
    const mutationRows = [
        ClampedLevelRow({
            valueState: getState(4),
            writePath: "Gaming[4]",
            max: 8,
            integerMode: "trunc",
            name: "Mutations unlocked",
        }),
        ClampedLevelRow({ valueState: getState(7), writePath: "Gaming[7]", integerMode: "trunc", name: "Evolve" }),
    ];

    // A plant's forms found: its letter in the Log Book, rewritten from what the game holds now, so a plant found in
    // the game since the page read it keeps its letter.
    const writeFound = async (plant, found) => {
        const now = String((await gga("Gaming[11]")) ?? "")
            .padEnd(PLANTS, "_")
            .split("");
        now[plant] = LETTERS[found];
        await writeVerified("Gaming[11]", now.join("").replace(/_+$/, ""));
        return found;
    };
    const logBookRows = Array.from({ length: PLANTS }, (_, plant) =>
        ClampedLevelRow({
            valueState: getFoundState(plant),
            write: (found) => writeFound(plant, found),
            max: FORMS,
            integerMode: "trunc",
            name: `Plant ${plant + 1}`,
        })
    );

    const load = async () =>
        run(async () => {
            const [rawGaming, rawUpgrades] = await Promise.all([gga("Gaming"), readCList("GamingUpgrades")]);
            const gaming = toIndexedArray(rawGaming ?? []);
            const upgrades = toIndexedArray(rawUpgrades ?? []);
            UPGRADES.forEach((key, i) => {
                upgradeNames[i].val = cleanName(toIndexedArray(upgrades[i] ?? [])[0], `Sprout upgrade ${i + 1}`);
                getState(key).val = toInt(gaming[key], { min: 0 });
            });
            HELD.forEach((held) => (getState(held.key).val = toNum(gaming[held.key], 0)));
            [4, 7].forEach((key) => (getState(key).val = toInt(gaming[key], { min: 0 })));
            const book = String(gaming[11] ?? "");
            for (let plant = 0; plant < PLANTS; plant++)
                getFoundState(plant).val = Math.max(0, LETTERS.indexOf(book[plant] ?? "_"));
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Garden",
        description: "Bits, DNA, the sprout upgrades and the Log Book.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the garden",
        errorTitle: "Couldn't read the garden",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({ title: "Garden", body: heldRows }),
                    AccountSection({ title: "Upgrades", body: [...upgradeRows, ...mutationRows] }),
                    AccountSection({ title: "Log Book", body: logBookRows }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.gaming.garden",
    world: 5,
    system: "Gaming",
    tab: "Garden",
    description: "Bits, DNA, sprout upgrades, mutations and the Log Book.",
    keywords: ["General", "Bits", "DNA", "Sprout", "Mutations", "Log Book", "Evolve"],
    component: GardenTab,
});
