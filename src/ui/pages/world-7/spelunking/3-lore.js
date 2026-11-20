import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { cleanName, toInt } from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const LORE_LEVELS_PATH = "Spelunk[8]";
const LORE_PAGES_PER_CHAPTER = 4;

const LorePageRow = ({ entry }) =>
    SimpleNumberRow({
        entry: {
            name: `Chapter ${entry.chapterNumber} - Page ${entry.pageNumber}`,
            path: `${LORE_LEVELS_PATH}[${entry.levelIndex}]`,
            indexLabel: `#${entry.levelIndex + 1}`,
            formatted: false,
            rowClass: "spelunking-lore-row",
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
                        label,
                    };
                })
                .filter(Boolean);

            const pages = Array.from({ length: bonuses.length }, (_, pageIndex) => {
                const bonus = bonuses[pageIndex];
                const levelIndex = chapterIndex * LORE_PAGES_PER_CHAPTER + bonus.bonusIndex;
                return {
                    levelIndex,
                    pageNumber: bonus.bonusIndex + 1,
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

    const body = div({ class: "scrollable-panel content-stack" }, () => {
        const groups = loreGroups.val;
        return groups.length === 0
            ? div({ class: "tab-empty" }, "No Spelunking lore chapter definitions were found.")
            : div(
                  { class: "account-item-stack account-item-stack--dense" },
                  ...groups.map((group) =>
                      AccountSection({
                          title: `Chapter ${group.chapterNumber}`,
                          note: () =>
                              `${group.pages.reduce(
                                  (sum, page) => sum + toInt(page.levelState.val, { min: 0 }),
                                  0
                              )} total levels`,
                          body: div(
                              { class: "spelunking-lore-chapter" },
                              div(
                                  { class: "account-item-stack account-item-stack--dense" },
                                  ...group.pages.map((page) => LorePageRow({ entry: page }))
                              )
                          ),
                      })
                  )
              );
    });

    return PersistentAccountListPage({
        title: "Spelunking lore",
        description:
            "Set Lore Journal chapter page levels from Spelunk[8]. Each SpelunkChapters entry maps to four consecutive page levels.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: () => loading.val,
        }),
        state: { loading, error },
        loadingText: "Reading spelunking lore",
        errorTitle: "Spelunking lore read failed",
        initialWrapperClass: "scrollable-panel",
        body,
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
