import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { bonusText, cleanName, toInt } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const LORE_LEVELS_PATH = "Spelunk[8]";
const LORE_PAGES_PER_CHAPTER = 4;

const LorePageRow = ({ entry }) =>
    SimpleNumberRow({
        entry: {
            name: `Page ${entry.pageNumber}`,
            info: RowTitles({ bonus: entry.bonus, name: `Page ${entry.pageNumber}` }),
            path: `${LORE_LEVELS_PATH}[${entry.levelIndex}]`,
            formatted: false,
        },
        valueState: entry.levelState,
    });

const buildLoreGroups = (rawDefinitions, rawLevels) => {
    const levels = toIndexedArray(rawLevels ?? []);

    return toIndexedArray(rawDefinitions ?? [])
        .map((rawBonuses, chapterIndex) => {
            const bonuses = toIndexedArray(rawBonuses ?? [])
                .map((rawBonus, bonusIndex) => {
                    const bonus = toIndexedArray(rawBonus ?? []);
                    const label = cleanName(bonus[0]);
                    if (!label) return null;

                    return {
                        bonusIndex,
                        bonus: bonusText(bonus[0]),
                    };
                })
                .filter(Boolean);

            const pages = Array.from({ length: bonuses.length }, (_, pageIndex) => {
                const bonus = bonuses[pageIndex];
                const levelIndex = chapterIndex * LORE_PAGES_PER_CHAPTER + bonus.bonusIndex;
                return {
                    levelIndex,
                    pageNumber: bonus.bonusIndex + 1,
                    bonus: bonus.bonus,
                    chapterNumber: chapterIndex + 1,
                    levelState: van.state(toInt(levels[levelIndex], { min: 0 })),
                };
            });

            return {
                chapterIndex,
                chapterNumber: chapterIndex + 1,
                bonuses,
                pages,
            };
        })
        .filter((group) => group.bonuses.length > 0);
};

const syncLoreLevels = (groups, rawLevels) => {
    const levels = toIndexedArray(rawLevels ?? []);
    for (const group of groups) {
        for (const page of group.pages) {
            page.levelState.val = toInt(levels[page.levelIndex], { min: 0 });
        }
    }
};

function SpelunkingLoreTab() {
    const { loading, error, run } = useAccountLoad({ label: "Spelunking Lore" });
    const loreGroups = van.state([]);

    const load = async () =>
        run(async () => {
            const [rawDefinitions, rawLevels] = await Promise.all([
                readCList("SpelunkChapters"),
                gga(LORE_LEVELS_PATH),
            ]);
            const existing = loreGroups.val;

            if (existing.length === 0) {
                loreGroups.val = buildLoreGroups(rawDefinitions, rawLevels);
                return;
            }

            syncLoreLevels(existing, rawLevels);
        });

    load();

    // A chapter is a quiet group of its pages.
    const body = () => {
        const groups = loreGroups.val;
        return div(
            ...groups.map((group) =>
                AccountSection({
                    title: `Chapter ${group.chapterNumber}`,
                    body: group.pages.map((page) => LorePageRow({ entry: page })),
                })
            )
        );
    };

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Lore",
        description: "Lore Journal page levels, by chapter.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the lore journal",
        errorTitle: "Couldn't read the lore journal",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                body,
                empty: () => (loreGroups.val.length ? null : "No lore chapters found"),
                setAll: { word: (n) => (n === 1 ? "lore page" : "lore pages") },
            })
        ),
    });
}

export default definePage({
    id: "w7.spelunking.lore",
    world: 7,
    system: "Spelunking",
    tab: "Lore",
    description: "Lore Journal chapter page levels.",
    keywords: ["Spelunk", "Lore Journal", "Chapters"],
    component: SpelunkingLoreTab,
});
