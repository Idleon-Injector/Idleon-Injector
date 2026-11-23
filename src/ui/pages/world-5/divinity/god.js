/**
 * W5 - Divinity
 *
 * Data sources:
 *   gga.Divinity[25]        - how many gods are unlocked (up to 10); above 10 it counts God Rank
 *   gga.Divinity[28 + g]    - god g's blessing level (_customBlock_Divinity "BlesssBonus")
 *   cList.GodsInfo[g][0]    - the god's name; [6] its blessing bonus in the game's words
 *
 * One list: gods unlocked first, then each god's blessing, its bonus first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const UNLOCKED_PATH = "Divinity[25]";
const BLESSING_START = 28;
const GOD_COUNT = 10;

const DivinityTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Divinity" });
    const unlockedState = van.state(0);
    const getBlessingState = createIndexedStateGetter(0);
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);

    const unlockedRow = ClampedLevelRow({
        valueState: unlockedState,
        writePath: UNLOCKED_PATH,
        integerMode: "trunc",
        name: "Gods unlocked",
        // The number is in the field; the word says which it is.
        renderBadge: (value) => (toInt(value, { min: 0 }) > GOD_COUNT ? "God Rank" : ""),
    });

    const load = async () =>
        run(async () => {
            const [rawDivinity, rawGods] = await Promise.all([gga("Divinity"), readCList("GodsInfo")]);
            const divinity = toIndexedArray(rawDivinity ?? []);
            const gods = toIndexedArray(rawGods ?? [])
                .slice(0, GOD_COUNT)
                .map((raw, index) => {
                    const god = toIndexedArray(raw ?? []);
                    return { index, name: cleanName(god[0], `God ${index + 1}`), bonus: bonusText(god[6]) };
                });
            reconcileRows(gods.map((god) => god.name).join("|"), () =>
                gods.map((god) =>
                    ClampedLevelRow({
                        valueState: getBlessingState(god.index),
                        writePath: `Divinity[${BLESSING_START + god.index}]`,
                        integerMode: "trunc",
                        name: god.name,
                        renderInfo: () => RowTitles({ bonus: god.bonus, name: god.name }),
                    })
                )
            );
            unlockedState.val = toInt(divinity[25], { min: 0 });
            gods.forEach(
                (god) => (getBlessingState(god.index).val = toInt(divinity[BLESSING_START + god.index], { min: 0 }))
            );
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Divinity",
        description: "Which gods you have (past 10 it counts your God Rank), and each god's blessing.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading divinity",
        errorTitle: "Couldn't read divinity",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
                className: "field-columns",
                body: [
                    AccountSection({ title: "Gods", body: unlockedRow }),
                    AccountSection({ title: "Blessings", body: listNode }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "w5.divinity",
    world: 5,
    system: "Divinity",
    description: "Gods unlocked, God Rank and each god's blessing level.",
    keywords: ["God", "Gods", "Blessing", "God Rank"],
    component: DivinityTab,
});
