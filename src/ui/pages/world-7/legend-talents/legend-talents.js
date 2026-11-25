import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    toInt,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const LEGEND_TALENT_LEVELS_PATH = "Spelunk[18]";
const SECTION_SIZE = 10;
const SECTION_DEFS = [
    { id: "yellow", title: "Yellow", sliceStart: 0 },
    { id: "red", title: "Red", sliceStart: 10 },
    { id: "brown", title: "Brown", sliceStart: 20 },
    { id: "green", title: "Green", sliceStart: 30 },
    { id: "white", title: "White", sliceStart: 40 },
];

const buildTalentRows = (rawDefinitions, rawOrder, rawLevels, rawMaxResults) => {
    const definitions = toIndexedArray(rawDefinitions ?? []);
    const order = toIndexedArray(rawOrder ?? []).map((entry) => toInt(entry, { min: 0 }));
    const levels = toIndexedArray(rawLevels ?? []);

    return SECTION_DEFS.map((section) => {
        const indexes = order.slice(section.sliceStart, section.sliceStart + SECTION_SIZE);
        const talents = indexes
            .map((talentIndex, displayIndex) => {
                const definition = toIndexedArray(definitions[talentIndex] ?? []);
                const rawName = String(definition[0] ?? "").trim();
                if (!rawName || rawName === "filler") return null;

                const maxResult = rawMaxResults[talentIndex];
                if (!maxResult?.ok) {
                    throw new Error("The game didn't give a talent's max level.");
                }

                return {
                    displayIndex,
                    talentIndex,
                    rawName,
                    name: cleanName(rawName, `Talent ${talentIndex}`),
                    bonus: bonusText(definition[5]),
                    maxLevel: toInt(maxResult.value, { min: 0 }),
                    levelState: van.state(toInt(levels[talentIndex], { min: 0 })),
                };
            })
            .filter(Boolean);

        return {
            ...section,
            talents,
        };
    });
};

const LegendTalentRow = ({ talent }) =>
    ClampedLevelRow({
        valueState: talent.levelState,
        writePath: `${LEGEND_TALENT_LEVELS_PATH}[${talent.talentIndex}]`,
        max: talent.maxLevel,
        integerMode: "round",
        renderInfo: () => RowTitles({ bonus: talent.bonus, name: talent.name }),
        maxAction: true,
    });

const LegendTalentTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Legend Talents" });
    const sectionsState = van.state([]);
    const sectionNodes = new Map();
    const reconcilers = new Map();

    const getSectionNode = (sectionId) => {
        if (!sectionNodes.has(sectionId)) {
            const node = div();
            sectionNodes.set(sectionId, node);
            reconcilers.set(sectionId, createStaticRowReconciler(node));
        }
        return sectionNodes.get(sectionId);
    };

    const reconcileSection = (section) => {
        const node = getSectionNode(section.id);
        const reconcileRows = reconcilers.get(section.id);
        // The cap is built into each row, so a new max (Research grid bonuses raise it) rebuilds the section's rows.
        reconcileRows(section.talents.map((talent) => `${talent.talentIndex}:${talent.maxLevel}`).join("|"), () =>
            section.talents.map((talent) => LegendTalentRow({ talent }))
        );
        return node;
    };

    const load = async () =>
        run(async () => {
            const [rawDefinitions, rawOrder, rawLevels] = await Promise.all([
                readCList("LegendTalents"),
                readCList("Spelunky[26]"),
                gga(LEGEND_TALENT_LEVELS_PATH),
            ]);

            const talentIndexes = toIndexedArray(rawOrder ?? [])
                .slice(0, SECTION_DEFS.length * SECTION_SIZE)
                .map((entry) => toInt(entry, { min: 0 }));
            const maxResults = await readComputedMany(
                "thingies",
                "LegendTalent_MaxLV",
                talentIndexes.map((talentIndex) => [talentIndex, 0])
            );
            const maxByTalentIndex = Object.fromEntries(
                talentIndexes.map((talentIndex, i) => [talentIndex, maxResults[i]])
            );
            const nextSections = buildTalentRows(rawDefinitions, rawOrder, rawLevels, maxByTalentIndex);
            const existing = sectionsState.val;

            if (existing.length === 0) {
                sectionsState.val = nextSections;
                return;
            }

            const existingById = new Map(existing.map((section) => [section.id, section]));
            for (const nextSection of nextSections) {
                const currentSection = existingById.get(nextSection.id);
                if (!currentSection) continue;

                const currentByTalentIndex = new Map(
                    currentSection.talents.map((talent) => [talent.talentIndex, talent])
                );
                for (const nextTalent of nextSection.talents) {
                    const currentTalent = currentByTalentIndex.get(nextTalent.talentIndex);
                    if (!currentTalent) continue;
                    currentTalent.maxLevel = nextTalent.maxLevel;
                    currentTalent.levelState.val = nextTalent.levelState.val;
                }
                reconcileSection(currentSection);
            }
        });

    load();

    // The game's five colours, each a quiet group of its talents.
    const sections = () => sectionsState.val.filter((section) => section.talents.length);
    const body = () =>
        div(...sections().map((section) => AccountSection({ title: section.title, body: reconcileSection(section) })));

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Legend Talents",
        description: "Legend Talent levels, in the game's five colours.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading legend talents",
        errorTitle: "Couldn't read legend talents",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({ body, empty: () => (sections().length ? null : "No legend talents found") })
        ),
    });
};

export default definePage({
    id: "w7.legendtalents",
    world: 7,
    system: "Legend Talents",
    description: "Legend Talent levels, in their five colour sections.",
    keywords: ["Legend Talent"],
    component: LegendTalentTab,
});
