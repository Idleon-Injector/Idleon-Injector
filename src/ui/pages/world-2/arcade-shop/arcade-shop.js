/**
 * W2 - Arcade Tab
 *
 * Ball counts in OptionsListAccount:
 *   [74]  -> normal balls
 *   [75]  -> golden balls
 *   [324] -> cosmic balls
 *   [625] -> Omega balls
 *   [626] -> lifetime Omega ball drops
 *
 * Upgrade sources:
 *   cList.ArcadeShopInfo[i][0] -> the upgrade's bonus, which names it (BLANK rows skipped)
 *   ArcadeUpg[i]               -> current upgrade level
 *
 * Level rules:
 *   Allowed range is 0-102.
 *   Level 101 is COSMIC; level 102 is OMEGA.
 *
 * One list: the balls, then the upgrades in the game's order. The tray's "All to" (0, 100, Cosmic, Omega) sets the
 * upgrades the top bar's search shows; lowering asks first.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { readGgaEntries } from "../../../services/api.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import {
    adjustFormattedIntInput,
    bonusText,
    createStaticRowReconciler,
    largeFormatter,
    largeParser,
    readLevelDefinitions,
    resolveFormattedIntInput,
    runBulkSet,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;
const ARCADE_LEVEL_MAX = 102;
const BALL_FIELDS = [
    { id: "normal", label: "Normal balls", optionIndex: 74 },
    { id: "golden", label: "Golden balls", optionIndex: 75 },
    { id: "cosmic", label: "Cosmic balls", optionIndex: 324 },
    { id: "omega", label: "Omega balls", optionIndex: 625 },
    { id: "omegaDropped", label: "Omega balls dropped", optionIndex: 626 },
];
// The levels "All to" sets: 0, the top normal level, then cosmic and omega.
const ALL_TO = [
    { level: 0, label: "0", aim: "0" },
    { level: 100, label: "100", aim: "level 100" },
    { level: 101, label: "Cosmic", aim: "Cosmic" },
    { level: 102, label: "Omega", aim: "Omega" },
];

const ArcadeRow = ({ entry }) =>
    ClampedLevelRow({
        valueState: entry.levelState,
        writePath: `ArcadeUpg[${entry.index}]`,
        max: ARCADE_LEVEL_MAX,
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${entry.index}`),
            span({ class: "account-row__name" }, entry.name),
        ],
        // Level 101 is cosmic and 102 omega: the plain state word before the field.
        renderBadge: () => {
            const level = Number(entry.levelState.val ?? 0);
            return level >= 102 ? "Omega" : level >= 101 ? "Cosmic" : "";
        },
    });

const ArcadeBallRow = ({ field, valueState }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => resolveFormattedIntInput(rawValue, null, { min: 0 }),
        write: async (nextValue) => {
            const path = `OptionsListAccount[${field.optionIndex}]`;
            await writeVerified(path, nextValue);
            return nextValue;
        },
        renderInfo: () => span({ class: "account-row__name" }, field.label),
        adjustInput: (rawValue, delta, currentValue) =>
            adjustFormattedIntInput(rawValue, delta, currentValue ?? 0, { min: 0 }),
        inputProps: {
            formatter: largeFormatter,
            parser: largeParser,
        },
    });

const ArcadeTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Arcade" });
    const bulk = useWriteStatus();

    const ballStates = new Map(BALL_FIELDS.map((field) => [field.id, van.state(0)]));

    const upgradeEntries = van.state([]);
    const upgradeList = div({ class: "account-page-pane" });
    const reconcileUpgrades = createStaticRowReconciler(upgradeList);

    const load = async () =>
        run(async () => {
            const [rawOptions, parsed] = await Promise.all([
                readGgaEntries(
                    "OptionsListAccount",
                    BALL_FIELDS.map((field) => String(field.optionIndex))
                ),
                readLevelDefinitions({
                    levelsPath: "ArcadeUpg",
                    definitionsPath: "ArcadeShopInfo",
                    mapEntry: ({ definition, rawLevel, index }) => {
                        const rawName = String(definition[0] ?? "").trim();
                        if (!rawName || rawName.toUpperCase() === "BLANK") return null;
                        return { index, name: bonusText(rawName), level: Number(rawLevel ?? 0) };
                    },
                }),
            ]);

            BALL_FIELDS.forEach((field) => {
                ballStates.get(field.id).val = Number(rawOptions?.[String(field.optionIndex)] ?? 0);
            });

            const existing = upgradeEntries.val;
            const sameShape =
                existing.length === parsed.length &&
                existing.every((entry, i) => entry.index === parsed[i].index && entry.name === parsed[i].name);
            if (sameShape) {
                parsed.forEach((item, i) => (existing[i].levelState.val = item.level));
                return;
            }
            const entries = parsed.map((item) => ({
                index: item.index,
                name: item.name,
                levelState: van.state(item.level),
            }));
            reconcileUpgrades(entries.map((entry) => `${entry.index}:${entry.name}`).join("|"), () =>
                entries.map((entry) => (entry.row = ArcadeRow({ entry })))
            );
            upgradeEntries.val = entries;
        });

    // The upgrades the tools act on: every one, or the ones the top bar's search shows.
    const shown = () => upgradeEntries.val.filter((entry) => shownBySearch(entry.row));
    const upgradeWord = (n) => `upgrade${n === 1 ? "" : "s"}`;

    // "All to" a level: one press when it only raises; lowering (cosmic or omega back to 100, or to 0) asks first.
    const tools = (_activeId, ask) =>
        div(
            { class: "tabbed-list__tool-group" },
            span({ class: "tabbed-list__tool-label" }, "All to"),
            ...ALL_TO.map(({ level, label, aim }) => {
                const writeAll = (entries) =>
                    bulk.run(() =>
                        runBulkSet({
                            entries,
                            getTargetValue: () => level,
                            getValueState: (entry) => entry.levelState,
                            getPath: (entry) => `ArcadeUpg[${entry.index}]`,
                        })
                    );
                const loweredOf = (entries) => entries.filter((entry) => Number(entry.levelState.val) > level);
                const askOrWrite = (entries) => {
                    const n = loweredOf(entries).length;
                    if (!n) return void writeAll(entries);
                    const verb = level === 0 ? "Reset" : "Lower";
                    ask({
                        question: `${verb} ${n} ${upgradeWord(n)} to ${aim}?`,
                        confirmLabel: `${verb} ${n === 1 ? "it" : "them"}`,
                        from: levelButton,
                        lowers: () => loweredOf(entries),
                        again: () => askOrWrite(entries),
                        onConfirm: () => writeAll(entries),
                    });
                    return undefined;
                };
                const levelButton = ActionButton({
                    label,
                    status: bulk.status,
                    variant: level === 0 ? "danger" : "quiet",
                    disabled: () => {
                        const entries = shown();
                        return !entries.length || entries.every((entry) => Number(entry.levelState.val) === level);
                    },
                    onClick: (e) => {
                        e.preventDefault();
                        return askOrWrite(shown());
                    },
                });
                return levelButton;
            })
        );

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Arcade Shop",
        description: "Arcade balls and upgrade levels. Level 101 is cosmic, 102 omega.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the arcade",
        errorTitle: "Couldn't read the arcade",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "field-columns",
                body: [
                    AccountSection({
                        title: "Balls",
                        body: BALL_FIELDS.map((field) =>
                            ArcadeBallRow({ field, valueState: ballStates.get(field.id) })
                        ),
                    }),
                    AccountSection({ title: "Upgrades", body: upgradeList }),
                ],
                tools,
                toolsLabel: () => {
                    const n = shown().length;
                    return isSearching() ? `${n} matching ${upgradeWord(n)}` : `All ${n} ${upgradeWord(n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w2.arcade",
    world: 2,
    system: "Arcade Shop",
    description: "Arcade balls and Arcade Shop upgrade levels.",
    keywords: ["Arcade", "Balls", "Cosmic", "Omega"],
    component: ArcadeTab,
});
