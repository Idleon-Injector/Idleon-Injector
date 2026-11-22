/**
 * W2 - Vials Tab (Alchemy Vials)
 *
 * Vial definitions: cList.AlchemyDescription[4]
 *   entry[0] = internal name key (for example "COPPER_CORONA")
 *   entry[9] = the bonus in the game's words ("Monsters_drop_+{%_more_money.")
 *
 * Levels stored in: CauldronInfo[4]
 * Level range: 0-13 (integer)
 *
 * One list in the game's order. Set all sits in the tray and acts on the vials the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { SetAllNumberControl, refuseSetAll } from "../../../components/views/account/BulkActionBar.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    createIndexedStateGetter,
    createStaticRowReconciler,
    normalCase,
    readLevelDefinitions,
    resolveNumberInput,
    runBulkSet,
    toNum,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const MAX_VIAL_LEVEL = 13;

const VialRow = ({ vial, levelState }) =>
    ClampedLevelRow({
        valueState: levelState,
        writePath: `CauldronInfo[4][${vial.index}]`,
        max: MAX_VIAL_LEVEL,
        integerMode: "round",
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${vial.index}`),
            RowTitles({ bonus: vial.bonus, name: vial.name }),
        ],
    });

const VialTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Vials" });
    const setAllInput = van.state("");
    const bulk = useWriteStatus();
    const vialDefs = van.state([]);
    const getLevelState = createIndexedStateGetter();
    const listNode = div({ class: "account-page-pane" });
    const reconcileRows = createStaticRowReconciler(listNode);
    // Each vial's row, so the tools act only on the vials the top bar's search shows.
    const rowOf = new Map();

    const load = async () =>
        run(async () => {
            const nextVialDefs = await readLevelDefinitions({
                levelsPath: "CauldronInfo",
                definitionsPath: "AlchemyDescription",
                selectLevels: (_, levels) => levels[4],
                selectDefinitions: (_, definitions) => definitions[4],
                mapEntry: ({ definition, rawLevel, index }) => {
                    const name = normalCase(definition[0] ?? "");
                    if (name.toUpperCase() === "VIAL" || name === "") return null;
                    return { name, bonus: bonusText(definition[9]), index, level: toNum(rawLevel) };
                },
            });

            nextVialDefs.forEach((vial) => {
                getLevelState(vial.index).val = vial.level;
            });

            vialDefs.val = nextVialDefs.map(({ name, bonus, index }) => ({ name, bonus, index }));
            reconcileRows(vialDefs.val.map((vial) => `${vial.index}:${vial.name}:${vial.bonus}`).join("|"), () =>
                vialDefs.val.map((vial) => {
                    const row = VialRow({ vial, levelState: getLevelState(vial.index) });
                    rowOf.set(vial.index, row);
                    return row;
                })
            );
        });

    const shown = () => vialDefs.val.filter((vial) => shownBySearch(rowOf.get(vial.index)));
    const vialWord = (n) => `vial${n === 1 ? "" : "s"}`;

    const tools = (_activeId, ask) => {
        const writeLevels = (vials, level) =>
            bulk.run(() =>
                runBulkSet({
                    entries: vials,
                    getTargetValue: () => level,
                    getValueState: (vial) => getLevelState(vial.index),
                    getPath: (vial) => `CauldronInfo[4][${vial.index}]`,
                })
            );
        // Lowering takes levels away, so it asks first (in the tray); raising runs on one click.
        const setAll = () => {
            const level = resolveNumberInput(setAllInput.val, { min: 0, max: MAX_VIAL_LEVEL, fallback: null });
            if (level === null) return refuseSetAll(setAllInput);
            const vials = shown();
            const lowered = vials.filter((vial) => Number(getLevelState(vial.index).val) > level).length;
            if (!lowered) return writeLevels(vials, level);
            ask({
                question: `Lower ${lowered} ${vialWord(lowered)} to level ${level}?`,
                confirmLabel: lowered === 1 ? "Lower it" : "Lower them",
                from: setAllControl.querySelector(".account-btn"),
                onConfirm: () => writeLevels(vials, level),
            });
            return undefined;
        };
        const setAllControl = SetAllNumberControl({
            label: "",
            placeholder: "Level",
            value: setAllInput,
            status: bulk.status,
            max: MAX_VIAL_LEVEL,
            onApply: setAll,
        });
        return setAllControl;
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Vials",
        description: "Vial levels, each up to 13.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading vials",
        errorTitle: "Couldn't read vials",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body: listNode,
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${vialWord(n)}` : `All ${n} ${vialWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w2.vials",
    world: 2,
    system: "Alchemy",
    tab: "Vials",
    description: "Vial levels.",
    keywords: ["Alchemy"],
    component: VialTab,
});
