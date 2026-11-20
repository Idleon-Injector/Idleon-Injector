import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanNameEffect,
    createStaticRowReconciler,
    getOrCreateState,
    toNum,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div } = van.tags;

const MONUMENT_FIELDS = [
    { key: "bravery-afk", index: 0, name: "Bravery AFK Hours", path: "Holes[14][0]", group: 14 },
    { key: "justice-afk", index: 2, name: "Justice AFK Hours", path: "Holes[14][2]", group: 14 },
    { key: "wisdom-afk", index: 4, name: "Wisdom AFK Hours", path: "Holes[14][4]", group: 14 },
    { key: "bravery-time", index: 11, name: "Bravery Time Since Last Run", path: "Holes[11][11]", group: 11 },
    { key: "justice-time", index: 12, name: "Justice Time Since Last Run", path: "Holes[11][12]", group: 11 },
    { key: "wisdom-time", index: 13, name: "Wisdom Time Since Last Run", path: "Holes[11][13]", group: 11 },
];
const BONUS_SECTIONS = [
    { key: "bravery", title: "Bravery bonuses", start: 0 },
    { key: "justice", title: "Justice bonuses", start: 10 },
    { key: "wisdom", title: "Wisdom bonuses", start: 20 },
];

const MonumentRow = ({ entry, valueState }) =>
    SimpleNumberRow({
        entry,
        valueState,
    });

const buildBonusEntries = (holes, names, section) => {
    const values = toIndexedArray(toIndexedArray(holes)[15]);
    const bonusNames = toIndexedArray(names ?? []);

    return Array.from({ length: 10 }, (_, offset) => {
        const index = section.start + offset;
        return {
            key: `${section.key}-${index}`,
            index,
            name: cleanNameEffect(bonusNames[index], `${section.title} ${offset + 1}`),
            path: `Holes[15][${index}]`,
            value: toNum(values[index], 0),
        };
    });
};

const MonumentTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Hole Monument" });
    const sections = [
        {
            key: "monument-general",
            title: "Monument",
            entries: van.state([]),
            node: div({ class: "account-item-stack" }),
        },
        ...BONUS_SECTIONS.map((section) => ({
            ...section,
            entries: van.state([]),
            node: div({ class: "account-item-stack" }),
        })),
    ];
    const valueStates = new Map();
    const reconcilers = new Map(sections.map((section) => [section.key, createStaticRowReconciler(section.node)]));

    const reconcileSection = (section) => {
        reconcilers.get(section.key)(section.entries.val.map((entry) => `${entry.key}:${entry.name}`).join("|"), () =>
            section.entries.val.map((entry) =>
                MonumentRow({ entry, valueState: getOrCreateState(valueStates, entry.key) })
            )
        );
        for (const entry of section.entries.val) getOrCreateState(valueStates, entry.key).val = entry.value;
    };

    const load = async () =>
        run(async () => {
            const [holes, names] = await Promise.all([gga("Holes"), readCList("HolesInfo[32]")]);
            sections[0].entries.val = MONUMENT_FIELDS.map((field) => ({
                key: field.key,
                index: field.index,
                name: field.name,
                path: field.path,
                value: toNum(toIndexedArray(toIndexedArray(holes)[field.group])[field.index], 0),
            }));

            BONUS_SECTIONS.forEach((bonusSection, offset) => {
                sections[offset + 1].entries.val = buildBonusEntries(holes, names, bonusSection);
            });

            for (const section of sections) reconcileSection(section);
        });

    load();

    return PersistentAccountListPage({
        title: "Monument",
        description: "Edit monument AFK, rerun timers, and bonuses from Holes[14], Holes[11], and Holes[15].",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading hole monument",
        errorTitle: "Hole monument read failed",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            ...sections.map((section) =>
                AccountSection({
                    title: section.title,
                    note: () => `${section.entries.val.length} rows`,
                    body: section.node,
                })
            )
        ),
    });
};

export default definePage({
    id: "w5.hole.monument",
    world: 5,
    system: "Hole",
    tab: "Monument",
    description: "Monument AFK hours, time since each last run, and the Bravery, Justice and Wisdom bonuses.",
    keywords: ["Bravery", "Justice", "Wisdom"],
    component: MonumentTab,
});
