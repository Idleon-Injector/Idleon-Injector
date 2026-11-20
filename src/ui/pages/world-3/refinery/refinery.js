/**
 * W3 - Refinery Tab
 *
 * Data sources:
 *   gga.Refinery[3..11][0]                    - current charge (salt stored)
 *   gga.Refinery[3..11][1]                    - level
 *   gga.ItemDefinitionsGET.h.Refinery1..9.h.displayName - refinery names
 *
 * Notes:
 *   - Refineries 7-9 require the "Polymer Refinery" research to be unlocked in-game.
 *   - Refinery 9 (gga.Refinery[11]) is a placeholder and has no in-game effect yet.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readGgaEntries } from "../../../services/api.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import {
    NoticeBanner,
    RefreshButton,
    WarningBanner,
} from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanName,
    readLevelDefinitions,
    toNum,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const REFINERY_COUNT = 9;
const REFINERY_OFFSET = 3;
const POLYMER_LOCK_FROM = 6;
const PLACEHOLDER_INDEX = 8;

const RefineryValueRow = ({ label, fieldIndex, gameIndex, valueState }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => {
            const nextValue = Math.max(0, Math.round(Number(rawValue)));
            return Number.isNaN(nextValue) ? null : nextValue;
        },
        write: async (nextValue) => {
            const path = `Refinery[${gameIndex}][${fieldIndex}]`;
            await writeVerified(path, nextValue);
            return nextValue;
        },
        renderInfo: () => span({ class: "account-row__name" }, label),
        controlsClass: "account-row__controls--xl",
    });

const RefinerySection = ({ refIndex, name, levelState, chargeState }) => {
    const gameIndex = refIndex + REFINERY_OFFSET;
    const isPolymer = refIndex >= POLYMER_LOCK_FROM;
    const isPlaceholder = refIndex === PLACEHOLDER_INDEX;
    // The section names its state in plain words, like a switch's word: no box, no colour of its own.
    const state = [isPolymer ? "Polymer" : "", isPlaceholder ? "Not in game" : ""].filter(Boolean).join(" · ");

    return AccountSection({
        title: typeof name === "function" ? () => `#${refIndex + 1} ${name()}` : `#${refIndex + 1} ${name}`,
        meta: state ? span({ class: "refinery-section__state" }, state) : null,
        body: [
            RefineryValueRow({
                label: "LEVEL",
                fieldIndex: 1,
                gameIndex,
                valueState: levelState,
            }),
            RefineryValueRow({
                label: "CHARGE",
                fieldIndex: 0,
                gameIndex,
                valueState: chargeState,
            }),
        ],
    });
};

const RefineryTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Refinery" });
    const nameStates = Array.from({ length: REFINERY_COUNT }, (_, i) => van.state(`Refinery ${i + 1}`));
    const levelStates = Array.from({ length: REFINERY_COUNT }, () => van.state(0));
    const chargeStates = Array.from({ length: REFINERY_COUNT }, () => van.state(0));
    const sectionsPerColumn = Math.ceil(REFINERY_COUNT / 3);
    const grid = div(
        { class: "refinery-grid grid-3col" },
        ...Array.from({ length: 3 }, (_, columnIndex) =>
            div(
                { class: "refinery-col" },
                ...Array.from({ length: sectionsPerColumn }, (_, offset) => {
                    const index = columnIndex * sectionsPerColumn + offset;
                    if (index >= REFINERY_COUNT) return null;
                    return RefinerySection({
                        refIndex: index,
                        name: () => nameStates[index].val,
                        levelState: levelStates[index],
                        chargeState: chargeStates[index],
                    });
                }).filter(Boolean)
            )
        )
    );
    const body = div({ class: "scrollable-panel" }, grid);

    const load = async () =>
        run(async () => {
            const refineryKeys = Array.from({ length: REFINERY_COUNT }, (_, i) => `Refinery${i + 1}`);
            const refineries = await readLevelDefinitions({
                levelsPath: "Refinery",
                readDefinitions: () => readGgaEntries("ItemDefinitionsGET.h", refineryKeys, ["displayName"]),
                selectLevels: (_, levels) => levels.slice(REFINERY_OFFSET, REFINERY_OFFSET + REFINERY_COUNT),
                selectDefinitions: (nameEntries) => refineryKeys.map((key) => nameEntries[key]),
                mapEntry: ({ rawDefinition, rawLevel, index }) => ({
                    name: cleanName(rawDefinition?.displayName, `Refinery ${index + 1}`),
                    charge: toNum(rawLevel?.[0]),
                    level: toNum(rawLevel?.[1]),
                }),
            });

            for (let i = 0; i < REFINERY_COUNT; i++) {
                nameStates[i].val = refineries[i].name;
                chargeStates[i].val = refineries[i].charge;
                levelStates[i].val = refineries[i].level;
            }
        });

    load();

    return PersistentAccountListPage({
        title: "W3 - REFINERY",
        description: "Set refinery levels and salt charges.",
        actions: RefreshButton({ onRefresh: load }),
        topNotices: [
            NoticeBanner(
                { variant: "polymer" },
                span(
                    {},
                    "Refineries 7-9 require the ",
                    span({ class: "warning-banner__highlight" }, "Polymer Refinery"),
                    " research to be unlocked in-game before they are available."
                )
            ),
            WarningBanner(
                span(
                    {},
                    "Refinery 9 is a ",
                    span({ class: "warning-banner__highlight" }, "placeholder"),
                    " - it does not exist in the game yet and setting it has no effect."
                )
            ),
        ],
        state: { loading, error },
        loadingText: "READING REFINERY",
        errorTitle: "REFINERY READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "w3.refinery",
    world: 3,
    system: "Refinery",
    description: "Refinery salt charge and levels.",
    keywords: ["Salts"],
    component: RefineryTab,
});
