/**
 * W5 - Gaming › Imports
 *
 * Data sources:
 *   gga.GamingSprout[25 + n][0]    - import n's level; cList.RandoListo2[1][n] its name ("Little_Sprinkler")
 *   gga.Gaming[8]                  - Dirty Shovel: the highest gold nugget
 *   gga.OptionsListAccount[192]    - Dirty Shovel: gold nuggets dug
 *   gga.Gaming[9]                  - Autumn Squirrel: acorns
 *   gga.Gaming[13]                 - Immortal Snail: snail mail
 *
 * The imports in the game's order, then what the Shovel, Squirrel and Snail hold, each under its import's name. The
 * King Rat's tokens and crowns have their own page (Rat King).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
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
    createStaticRowReconciler,
    toInt,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const IMPORT_START = 25;
// The game's filler names past its last import.
const FILLER = new Set(["idk", ""]);
const HOLDS = [
    {
        section: "Dirty Shovel",
        values: [
            { key: "nugget", name: "Highest gold nugget", path: "Gaming[8]", index: 8 },
            { key: "dug", name: "Gold nuggets dug", path: "OptionsListAccount[192]", option: "192" },
        ],
    },
    { section: "Autumn Squirrel", values: [{ key: "acorns", name: "Acorns", path: "Gaming[9]", index: 9 }] },
    { section: "Immortal Snail", values: [{ key: "mail", name: "Snail Mail", path: "Gaming[13]", index: 13 }] },
];

const ImportsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Imports" });
    const getLevelState = createIndexedStateGetter(0);
    const holdStates = new Map(HOLDS.flatMap((hold) => hold.values.map((value) => [value.key, van.state(0)])));
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const holdSections = HOLDS.map((hold) =>
        AccountSection({
            title: hold.section,
            body: hold.values.map((value) =>
                SimpleNumberRow({
                    entry: { name: value.name, path: value.path, float: true },
                    valueState: holdStates.get(value.key),
                })
            ),
        })
    );

    const load = async () =>
        run(async () => {
            const [rawSprouts, rawNames, rawGaming, options] = await Promise.all([
                gga("GamingSprout"),
                readCList("RandoListo2[1]"),
                gga("Gaming"),
                readGgaEntries("OptionsListAccount", ["192"]),
            ]);
            const sprouts = toIndexedArray(rawSprouts ?? []);
            const gaming = toIndexedArray(rawGaming ?? []);
            const imports = toIndexedArray(rawNames ?? [])
                .map((raw, index) => ({ index, name: cleanName(raw) }))
                .filter((item) => !FILLER.has(item.name));
            reconcileRows(imports.map((item) => item.name).join("|"), () =>
                imports.map((item) =>
                    ClampedLevelRow({
                        valueState: getLevelState(item.index),
                        writePath: `GamingSprout[${IMPORT_START + item.index}][0]`,
                        integerMode: "trunc",
                        name: item.name,
                    })
                )
            );
            imports.forEach(
                (item) =>
                    (getLevelState(item.index).val = toInt(
                        toIndexedArray(sprouts[IMPORT_START + item.index] ?? [])[0],
                        {
                            min: 0,
                        }
                    ))
            );
            for (const hold of HOLDS)
                for (const value of hold.values)
                    holdStates.get(value.key).val = toNum(
                        value.option ? options[value.option] : gaming[value.index],
                        0
                    );
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Imports",
        description: "Each import's level, and what the Shovel, Squirrel and Snail have found.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the imports",
        errorTitle: "Couldn't read the imports",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [AccountSection({ title: "Imports", body: listNode }), ...holdSections],
            })
        ),
    });
};

export default definePage({
    id: "w5.gaming.imports",
    world: 5,
    system: "Gaming",
    tab: "Imports",
    description: "Import levels, gold nuggets, acorns and snail mail.",
    keywords: ["Sprinkler", "Shovel", "Gold Nugget", "Squirrel", "Acorns", "Snail Mail", "Immortal Snail"],
    component: ImportsTab,
});
