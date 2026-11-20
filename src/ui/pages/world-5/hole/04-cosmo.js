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

const COSMO_SECTIONS = [
    { key: "hole", title: "Hole majik", holeIndex: 4 },
    { key: "village", title: "Village majik", holeIndex: 5 },
    { key: "idleon", title: "Idleon majik", holeIndex: 6 },
];

const CosmoRow = ({ entry, valueState }) =>
    SimpleNumberRow({
        entry,
        valueState,
    });

const buildCosmoEntries = (holes, upgrades, section, sectionIndex) => {
    const values = toIndexedArray(toIndexedArray(holes)[section.holeIndex]);
    const definitions = toIndexedArray(toIndexedArray(upgrades ?? [])[sectionIndex] ?? []);
    const count = Math.max(values.length, definitions.length);
    return Array.from({ length: count }, (_, index) => {
        const definition = toIndexedArray(definitions[index] ?? []);
        return {
            key: `${section.key}-${index}`,
            index,
            name: cleanName(definition[2], `${section.title} ${index + 1}`),
            path: `Holes[${section.holeIndex}][${index}]`,
            value: toNum(values[index], 0),
        };
    });
};

const CosmoTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Hole Cosmo" });
    const valueStates = new Map();
    const sectionEntries = new Map(COSMO_SECTIONS.map((section) => [section.key, van.state([])]));
    const sectionNodes = new Map(COSMO_SECTIONS.map((section) => [section.key, div({ class: "account-item-stack" })]));
    const reconcilers = new Map(
        COSMO_SECTIONS.map((section) => [section.key, createStaticRowReconciler(sectionNodes.get(section.key))])
    );

    const load = async () =>
        run(async () => {
            const [holes, upgrades] = await Promise.all([gga("Holes"), readCList("CosmoUpgrades")]);
            COSMO_SECTIONS.forEach((section, sectionIndex) => {
                const entries = buildCosmoEntries(holes, upgrades, section, sectionIndex);
                sectionEntries.get(section.key).val = entries;
                reconcilers.get(section.key)(entries.map((entry) => `${entry.key}:${entry.name}`).join("|"), () =>
                    entries.map((entry) => CosmoRow({ entry, valueState: getOrCreateState(valueStates, entry.key) }))
                );
                for (const entry of entries) getOrCreateState(valueStates, entry.key).val = entry.value;
            });
        });

    load();

    return PersistentAccountListPage({
        title: "Cosmo",
        description: "Edit Conjuror Majik upgrades from Holes[4], Holes[5], and Holes[6].",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading hole cosmo",
        errorTitle: "Hole cosmo read failed",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            ...COSMO_SECTIONS.map((section) =>
                AccountSection({
                    title: section.title,
                    note: () => `${sectionEntries.get(section.key).val.length} rows`,
                    body: sectionNodes.get(section.key),
                })
            )
        ),
    });
};

export default definePage({
    id: "w5.hole.cosmo",
    world: 5,
    system: "Hole",
    tab: "Cosmo",
    description: "Conjuror Majik upgrade levels.",
    keywords: ["Majiks", "Conjuror"],
    component: CosmoTab,
});
