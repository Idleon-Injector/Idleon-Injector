import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed, readComputedMany } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formatNumber, formattedStep, parseNumber } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanName,
    cleanNameEffect,
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    largeParser,
    oneAtATime,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { TabbedList, toolsPerTab } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;
const PANES = [
    { id: "overview", label: "Lumi", keywords: ["Overview", "Lumi balance", "Shell EXP", "Shell rank"] },
    { id: "unlocks", label: "Unlocks", keywords: ["Menagerie Unlocks"] },
    { id: "upgrades", label: "Boosts", keywords: ["Menagerie Boosts"] },
    { id: "missions", label: "Missions", keywords: ["Menagerie Missions"] },
    { id: "jellies", label: "Side jellies", keywords: ["Side Jellies", "Jellyfish"] },
];
const YELLOW_NAMES = [
    "Build rate bonus level",
    "Construction EXP bonus level",
    "Flaggy rate bonus level",
    "Lumi bonus level",
];

const description = (raw) =>
    cleanName(raw)
        .replace(/\u819b/g, "")
        .replace(/@/g, " ")
        .trim();
const numericInput = (raw, integer) => {
    const value = parseNumber(raw);
    return Number.isFinite(value) && value >= 0 && (!integer || Number.isSafeInteger(value)) ? value : null;
};

const MenagerieTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Menagerie" });
    const saving = van.state(false);
    const lumiRate = van.state(0);
    const states = new Map();
    const missionProgress = new Map();
    const missionTargets = new Map();
    const lists = Object.fromEntries(PANES.map(({ id }) => [id, div()]));
    const reconcilers = Object.fromEntries(PANES.map(({ id }) => [id, createStaticRowReconciler(lists[id])]));
    const state = (path) => getOrCreateState(states, path);
    // Fields and switches stay usable while a save runs (and while it reads the game again after); only a load of the
    // page itself, or a failed one, holds them.
    const disabled = () => loading.val && !saving.val;
    // A write asked for while another runs waits its turn, then reads the game again.
    const inTurn = oneAtATime();
    const unlockCount = van.state(0);

    const load = async () =>
        run(async () => {
            const [rawMenagerie, green, rawMissions, rawUnlocks, rawUpgrades, rawCaves, rate, progress, targets] =
                await Promise.all([
                    gga("Menagerie"),
                    gga("Spelunk[17][28]"),
                    readCList("Research[52]"),
                    readCList("Research[56]"),
                    readCList("Research[57]"),
                    readCList("Spelunky[6]"),
                    readComputed("menagerie", "LumiGainRate", [0, 0]),
                    readComputedMany(
                        "menagerie",
                        "MissionProg",
                        Array.from({ length: 33 }, (_, i) => [i, 0])
                    ),
                    readComputedMany(
                        "menagerie",
                        "Cost",
                        Array.from({ length: 33 }, (_, i) => [0, i])
                    ),
                ]);
            const menagerie = toIndexedArray(rawMenagerie).map(toIndexedArray);
            const missions = toIndexedArray(rawMissions);
            const unlocks = toIndexedArray(rawUnlocks);
            const upgrades = toIndexedArray(rawUpgrades);
            const caves = toIndexedArray(rawCaves);
            if (
                menagerie.length < 8 ||
                menagerie[0].length < 16 ||
                menagerie[1].length < 33 ||
                menagerie[2].length < 25 ||
                menagerie[3].length < 25 ||
                menagerie[4].length < 14 ||
                menagerie[5].length < 9 ||
                menagerie[6].length < 17 ||
                menagerie[7].length < 17 ||
                missions.length !== 33 ||
                unlocks.length !== 25 ||
                upgrades.length !== 25
            ) {
                throw new Error("Menagerie data is uninitialized or does not match this game version.");
            }
            unlockCount.val = unlocks.length;
            for (let group = 0; group < 8; group++) {
                menagerie[group].forEach((value, index) => {
                    state(`Menagerie[${group}][${index}]`).val = Number(value);
                });
            }
            state("Spelunk[17][28]").val = Number(green);
            lumiRate.val = rate;
            for (let i = 0; i < missions.length; i++) {
                getOrCreateState(missionProgress, i, "Unavailable").val = progress[i]?.ok
                    ? progress[i].value
                    : "Unavailable";
                getOrCreateState(missionTargets, i, "Unavailable").val = targets[i]?.ok
                    ? targets[i].value
                    : "Unavailable";
            }

            reconcilers.overview("overview", () => [
                numberRow("Lumi balance", "Menagerie[0][0]", false, null, true),
                numberRow("Unspent Shell EXP", "Menagerie[0][1]", false, null, true),
                numberRow("Shell rank", "Menagerie[0][2]", true, null, true),
            ]);
            reconcilers.unlocks(JSON.stringify(unlocks), () =>
                unlocks.map((text, i) => toggleRow(description(text), `Menagerie[2][${i}]`))
            );
            reconcilers.upgrades(JSON.stringify(upgrades), () =>
                upgrades.map((text, i) => numberRow(cleanNameEffect(description(text)), `Menagerie[3][${i}]`, true))
            );
            reconcilers.missions(JSON.stringify(missions), () => missions.map((text, i) => missionRow(text, i)));
            reconcilers.jellies(JSON.stringify(caves), () => [
                AccountSection({
                    title: "Purple / Pink Jellyfish",
                    body: [
                        numberRow("Shell purchase count", "Menagerie[0][3]"),
                        numberRow("Lumi bonus level", "Menagerie[0][4]"),
                    ],
                }),
                AccountSection({
                    title: "Blue Jellyfish",
                    body: numberRow("Deposited ladles", "Menagerie[0][5]", false),
                }),
                AccountSection({
                    title: "Red Jellyfish",
                    note: "A reading uses up all rest days; deposits stay",
                    body: [
                        numberRow("Accumulated rest days", "Menagerie[0][6]"),
                        ...Array.from({ length: 14 }, (_, i) =>
                            numberRow(
                                `${/^Name\d*$/i.test(String(caves[i])) ? `Cave ${i + 1}` : cleanName(caves[i], `Cave ${i + 1}`)} deposited materials`,
                                `Menagerie[4][${i}]`,
                                false
                            )
                        ),
                    ],
                }),
                AccountSection({
                    title: "Silver Jellyfish",
                    body: [
                        numberRow("Miscellaneous Obol multiplier level", "Menagerie[0][9]", true, "Normal cap: 100"),
                        numberRow("Obol auto-trash rate level", "Menagerie[0][10]", true, "Normal cap: 190"),
                    ],
                }),
                AccountSection({
                    title: "Yellow Jellyfish",
                    body: [
                        ...YELLOW_NAMES.map((name, i) => numberRow(name, `Menagerie[0][${11 + i}]`)),
                        numberRow("Accumulated build progress", "Menagerie[0][15]", false),
                    ],
                }),
                AccountSection({
                    title: "Green Jellyfish",
                    note: "Collect the nametag in the game at 12",
                    body: numberRow("Spelunking progress", "Spelunk[17][28]"),
                }),
            ]);
        });

    const save = (task) =>
        inTurn(async () => {
            saving.val = true;
            try {
                return await task();
            } finally {
                await load();
                saving.val = false;
            }
        });

    const numberRow = (name, path, integer = true, note = null, formatted = false) =>
        EditableNumberRow({
            valueState: state(path),
            normalize: (raw) => numericInput(raw, integer),
            write: (next) => save(() => writeVerified(path, next)),
            renderInfo: () =>
                div(
                    { class: "account-row__name-group" },
                    span({ class: "account-row__name" }, name),
                    note ? span({ class: "account-row__sub-label" }, note) : null
                ),
            adjustInput: (raw, delta, current) => {
                const value = numericInput(raw, integer) ?? current;
                return Math.max(0, value + delta * (formatted ? formattedStep(value) : 1));
            },
            disabled,
            controlsClass: "account-row__controls--xl",
            inputMode: integer ? "int" : "float",
            inputProps: {
                "aria-label": name,
                ...(formatted ? { formatter: largeFormatter, parser: largeParser } : {}),
            },
            // A line of its tab's Set all, written where it lives.
            setAll: {
                path,
                refuse: (value) => (integer && !Number.isSafeInteger(value) ? "whole numbers only" : null),
            },
        });

    // Saves on flip, then reads the game again; a failed save says why on the switch.
    const toggleRow = (name, path) => {
        const { status, run: write } = useWriteStatus();
        return AccountRow({
            status,
            info: span({ class: "account-row__name" }, name),
            controls: StateSwitch({
                checked: () => state(path).val >= 1,
                words: ["Unlocked", ""],
                name,
                disabled,
                status, // nothing else on the row reads out saving and saved
                onFlip: (on) => {
                    // "All 25 unlocks saved." no longer holds once one changes.
                    bulkMessage.val = "";
                    return write(() => save(() => writeVerified(path, on ? 1 : 0)));
                },
            }),
        });
    };

    const missionRow = (text, index) =>
        EditableNumberRow({
            valueState: state(`Menagerie[1][${index}]`),
            normalize: (raw) => numericInput(raw, true),
            write: (next) => save(() => writeVerified(`Menagerie[1][${index}]`, next)),
            renderInfo: () => [
                div(
                    { class: "account-row__name-group" },
                    span({ class: "account-row__name" }, () =>
                        description(text).replace(
                            /[{$]/g,
                            `${index === 20 || index === 24 ? "10^" : ""}${formatNumber(missionTargets.get(index).val)}`
                        )
                    ),
                    span(
                        { class: "account-row__sub-label" },
                        () =>
                            `Progress${index === 20 || index === 24 ? " (log10)" : ""}: ${formatNumber(missionProgress.get(index).val)} / ${formatNumber(missionTargets.get(index).val)}`
                    )
                ),
            ],
            adjustInput: (raw, delta, current) => Math.max(0, (numericInput(raw, true) ?? current) + delta),
            disabled,
            controlsClass: "account-row__controls--xl",
            inputProps: { "aria-label": `Mission ${index} completions` },
            setAll: {
                path: `Menagerie[1][${index}]`,
                refuse: (value) => (Number.isSafeInteger(value) ? null : "whole numbers only"),
            },
        });

    const bulk = useWriteStatus();
    const bulkMessage = van.state("");
    const ALL_SAVED = "All 25 unlocks saved.";
    const unlockAll = ActionButton({
        label: () => (bulk.status.val === "loading" ? "Unlocking…" : "Unlock all"),
        status: bulk.status,
        disabled,
        onClick: () => {
            bulkMessage.val = "Saving…";
            void bulk.run(
                () =>
                    save(() =>
                        writeManyVerified(
                            Array.from({ length: unlockCount.val }, (_, i) => ({
                                path: `Menagerie[2][${i}]`,
                                value: 1,
                            }))
                        )
                    ),
                {
                    onSuccess: () => {
                        bulkMessage.val = ALL_SAVED;
                    },
                    onError: (error) => {
                        bulkMessage.val = error.message;
                    },
                }
            );
        },
    });

    // Unlock all only raises, so it runs on one press; its result is read out (the switches show it).
    const unlockTools = () =>
        div(
            { class: "tabbed-list__tool-group" },
            unlockAll,
            span({ class: "account-write-feedback", role: "status" }, () =>
                bulkMessage.val === ALL_SAVED &&
                Array.from({ length: unlockCount.val }, (_, i) => state(`Menagerie[2][${i}]`).val).some(
                    (value) => !(value >= 1)
                )
                    ? ""
                    : bulkMessage.val
            )
        );

    load();
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Menagerie",
        description: "Unlocks, boosts, missions and side jellies. The game's normal caps don't apply here.",
        // What the game makes of it, read only, beside the title.
        total: span(
            { class: "amount-left" },
            span({ class: "amount-left__value" }, () => formatNumber(lumiRate.val)),
            " Lumi per hour"
        ),
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || saving.val }),
        state: { loading, error },
        loadingText: "Reading the menagerie",
        errorTitle: "Couldn't read the menagerie",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Menagerie",
                page: "w7.menagerie",
                tabs: PANES.map(({ id, label }) => ({ id, label, content: lists[id] })),
                tools: toolsPerTab({ unlocks: unlockTools }),
                toolsOn: (id) => id === "unlocks",
                toolsLabel: (activeId) => (activeId.val === "unlocks" ? `All ${unlockCount.val} unlocks` : ""),
                setAll: { word: (n) => (n === 1 ? "line" : "lines"), placeholder: "Value" },
            })
        ),
    });
};

export default definePage({
    id: "w7.menagerie",
    world: 7,
    system: "Menagerie",
    description: "Menagerie progress: unlocks, boosts, missions and side jellies.",
    keywords: ["Luminous Menagerie"],
    tabs: PANES,
    component: MenagerieTab,
});
