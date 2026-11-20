import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toNum,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div } = van.tags;

const STUDY_SECTIONS = ["Shallow Caverns", "Glowshroom Tunnels", "Underground Overgrowth", "Not Named"];

const StudyRow = ({ entry, valueState }) =>
    SimpleNumberRow({
        entry,
        valueState,
    });

const buildStudyEntries = (holes, names, sectionIndex) => {
    const values = toIndexedArray(toIndexedArray(holes)[26]);
    const start = sectionIndex * 5;
    const end = Math.min(start + 5, names.length);
    return Array.from({ length: Math.max(0, end - start) }, (_, offset) => {
        const index = start + offset;
        return {
            key: `study-${index}`,
            index,
            name: cleanName(names[index], `Study ${index + 1}`),
            path: `Holes[26][${index}]`,
            value: toNum(values[index], 0),
        };
    });
};

const StudiesTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Hole Studies" });
    const valueStates = new Map();
    const sectionEntries = new Map(STUDY_SECTIONS.map((title, index) => [index, van.state([])]));
    const sectionNodes = new Map(STUDY_SECTIONS.map((title, index) => [index, div({ class: "account-item-stack" })]));
    const reconcilers = new Map(
        STUDY_SECTIONS.map((title, index) => [index, createStaticRowReconciler(sectionNodes.get(index))])
    );

    const load = async () =>
        run(async () => {
            const [holes, rawNames] = await Promise.all([gga("Holes"), readCList("HolesInfo[68]")]);
            const names = toIndexedArray(rawNames ?? []);
            STUDY_SECTIONS.forEach((_, sectionIndex) => {
                const entries = buildStudyEntries(holes, names, sectionIndex);
                sectionEntries.get(sectionIndex).val = entries;
                reconcilers.get(sectionIndex)(entries.map((entry) => entry.key).join("|"), () =>
                    entries.map((entry) => StudyRow({ entry, valueState: getOrCreateState(valueStates, entry.key) }))
                );
                for (const entry of entries) getOrCreateState(valueStates, entry.key).val = entry.value;
            });
        });

    load();

    return PersistentAccountListPage({
        title: "Studies",
        description: "Edit Studies villager levels from Holes[26].",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading hole studies",
        errorTitle: "Hole studies read failed",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            ...STUDY_SECTIONS.map((title, sectionIndex) =>
                AccountSection({
                    title,
                    note: () => `${sectionEntries.get(sectionIndex).val.length} ROWS`,
                    body: sectionNodes.get(sectionIndex),
                })
            )
        ),
    });
};

export default definePage({
    id: "w5.hole.studies",
    world: 5,
    system: "Hole",
    tab: "Studies",
    description: "Studies levels for each villager.",
    keywords: ["Study"],
    component: StudiesTab,
});
