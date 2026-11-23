/**
 * W2 - Bubbles Tab (Alchemy Bubbles)
 *
 * Levels: CauldronInfo[cauldron][bubble]. Each cauldron is a tab, its bubbles in the game's order.
 * Bubble definitions: cList.AlchemyDescription[cauldron][bubble]: [0] name, [9] the bonus in the game's words,
 * [10] 1 = big bubble (prisma blocked).
 *
 * Prisma format in OptionsListAccount[384]:
 *   "0"         -> no prisma bubbles
 *   "_0,"       -> orange bubble index 0 is prisma
 *   "_0,_1,a3," -> orange[0], orange[1], green[3] are prisma
 *
 * The tray acts on the open cauldron's bubbles the top bar's search shows: a level for all (asks before it lowers),
 * Prisma all, and Unprisma all (asks).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { SetAllTool } from "../../../components/views/account/BulkActionBar.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    normalCase,
    oneAtATime,
    readLevelDefinitions,
    sortPrefixedNumericCodes,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const CAULDRONS = [
    { id: "orange", label: "Orange", index: 0, prismaKey: "_" },
    { id: "green", label: "Green", index: 1, prismaKey: "a" },
    { id: "purple", label: "Purple", index: 2, prismaKey: "b" },
    { id: "yellow", label: "Yellow", index: 3, prismaKey: "c" },
];
const PRISMA_PATH = "OptionsListAccount[384]";

function parsePrisma(str) {
    if (!str || str === "0") return new Set();

    return new Set(
        String(str)
            .split(",")
            .filter((s) => s.length > 1)
            .map((s) => {
                const key = s[0];
                const num = parseInt(s.slice(1), 10);
                return isNaN(num) ? null : key + String(num);
            })
            .filter(Boolean)
    );
}

const prismaCode = (cauldron, bubble) => cauldron.prismaKey + String(bubble.index);

function encodePrisma(set) {
    if (set.size === 0) return "0,";
    return [...set].sort(sortPrefixedNumericCodes).join(",") + ",";
}

const BubbleRow = ({ bubble, cauldron, prismaSet, setPrisma }) => {
    const isPrisma = van.derive(() => prismaSet.val.has(prismaCode(cauldron, bubble)));

    return ClampedLevelRow({
        valueState: bubble.levelState,
        max: Infinity,
        writePath: `CauldronInfo[${cauldron.index}][${bubble.index}]`,
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${bubble.index}`),
            RowTitles({ bonus: bubble.bonus, name: bubble.name }),
        ],
        // A big bubble can't be prisma: it says so where the switch would be.
        renderExtraActions: ({ run }) =>
            bubble.isBigBubble
                ? span({ class: "bubbles-row__note" }, "Big bubble")
                : StateSwitch({
                      checked: isPrisma,
                      // Only a prisma bubble says so; "Not prisma" on every other row was noise.
                      words: ["Prisma", ""],
                      name: `${bubble.name} prisma`,
                      // The switch says how its save went; the row's save state says saving… and ✓ (or the level's failure).
                      ownStatus: true,
                      onFlip: (prisma) => setPrisma([prismaCode(cauldron, bubble)], prisma, run, "switch"),
                  }),
    });
};

const BubblesTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Bubbles" });
    const prismaSet = van.state(new Set());
    // What each tab's tools act on: its bubbles with their level states and rows, kept by load.
    const bubblesByCauldron = van.state(CAULDRONS.map(() => []));
    const paneOf = CAULDRONS.map(() => div({ class: "account-page-pane" }));
    const signatures = CAULDRONS.map(() => null);

    const readPrisma = async () => (prismaSet.val = parsePrisma(await gga(PRISMA_PATH)));

    // Every bubble's Prisma lives in one string, so flips save one at a time, each from the string the game holds now:
    // a bubble made prisma in the game, or by a flip still saving, isn't written over. `run` is the row's or the
    // tray's, so the save state shows where the player acted.
    const prismaInTurn = oneAtATime();
    const setPrisma = (codes, prisma, runIn, ...runArgs) =>
        runIn(
            () =>
                prismaInTurn(async () => {
                    try {
                        const next = parsePrisma(await gga(PRISMA_PATH));
                        codes.forEach((code) => (prisma ? next.add(code) : next.delete(code)));
                        await writeVerified(PRISMA_PATH, encodePrisma(next));
                        prismaSet.val = next;
                    } catch (error) {
                        // The write may have landed: the switches show what the game holds now.
                        await readPrisma().catch(() => {});
                        throw error;
                    }
                }),
            ...runArgs
        );

    const load = async () =>
        run(async () => {
            const [rawPrisma, cauldrons] = await Promise.all([
                gga(PRISMA_PATH),
                readLevelDefinitions({
                    levelsPath: "CauldronInfo",
                    definitionsPath: "AlchemyDescription",
                    mapEntry: ({ definition, rawLevel, index }) => {
                        if (!CAULDRONS[index]) return null;
                        const levels = toIndexedArray(rawLevel ?? []);
                        return definition
                            .map((entry, at) => {
                                const fields = toIndexedArray(entry ?? []);
                                return {
                                    index: at,
                                    name: normalCase(fields[0] ?? ""),
                                    bonus: bonusText(fields[9]),
                                    isBigBubble: Number(fields[10] ?? 0) === 1,
                                    level: Number(levels[at] ?? 0),
                                };
                            })
                            .filter((b) => b.name !== "" && b.name.toUpperCase() !== "BUBBLE");
                    },
                }),
            ]);

            prismaSet.val = parsePrisma(rawPrisma);
            const next = [...bubblesByCauldron.val];
            CAULDRONS.forEach((cauldron) => {
                const read = cauldrons[cauldron.index] ?? [];
                const signature = read.map((b) => `${b.index}:${b.name}:${b.bonus}:${b.isBigBubble}`).join("|");
                if (signature === signatures[cauldron.index]) {
                    // The same bubbles: their rows stay, with the levels the game holds now.
                    next[cauldron.index].forEach((bubble, at) => (bubble.levelState.val = read[at].level));
                    return;
                }
                signatures[cauldron.index] = signature;
                const bubbles = read.map((b) => {
                    const bubble = { ...b, levelState: van.state(b.level) };
                    bubble.row = BubbleRow({ bubble, cauldron, prismaSet, setPrisma });
                    return bubble;
                });
                paneOf[cauldron.index].replaceChildren(...bubbles.map((bubble) => bubble.row));
                next[cauldron.index] = bubbles;
            });
            bubblesByCauldron.val = next;
        });

    // The open tab's tools. They share one status, so a bulk write runs alone.
    const bulk = useWriteStatus();
    const cauldronOf = (activeId) => CAULDRONS.find((cauldron) => cauldron.id === activeId.val);
    // A tab's bubbles the tools act on: all of them, or the ones the top bar's search shows.
    const bubblesOn = (cauldron) => bubblesByCauldron.val[cauldron.index].filter((bubble) => shownBySearch(bubble.row));
    const bubbleWord = (cauldron, n) => `${cauldron.id} bubble${n === 1 ? "" : "s"}`;
    const toolsLabel = (activeId) => {
        const cauldron = cauldronOf(activeId);
        const n = bubblesOn(cauldron).length;
        return isSearching() ? `${n} matching ${bubbleWord(cauldron, n)}` : `All ${n} ${bubbleWord(cauldron, n)}`;
    };

    const tools = (activeId, ask) => {
        const cauldron = () => cauldronOf(activeId);
        const prismaCodesOn = (c) =>
            bubblesOn(c)
                .filter((bubble) => !bubble.isBigBubble)
                .map((bubble) => prismaCode(c, bubble));
        const prismaOn = (c) => prismaCodesOn(c).filter((code) => prismaSet.val.has(code)).length;

        // A level for all: bubbles have no max, so it asks only before it lowers.
        const setAllControl = SetAllTool({
            ask,
            bulk,
            lines: () => {
                const c = cauldron();
                return bubblesOn(c).map((bubble) => ({
                    row: bubble.row,
                    valueState: bubble.levelState,
                    max: null,
                    path: `CauldronInfo[${c.index}][${bubble.index}]`,
                }));
            },
            word: (n) => bubbleWord(cauldron(), n),
        });

        // Every prisma lives in one string: the tab's bubbles go in (or out) in one write, in turn with the switches.
        const prismaAll = (codes, prisma) => setPrisma(codes, prisma, bulk.run);
        const unprismaAll = ActionButton({
            label: "Unprisma all",
            status: bulk.status,
            variant: "danger",
            disabled: () => prismaOn(cauldron()) === 0,
            onClick: (e) => {
                e.preventDefault();
                const c = cauldron();
                const codes = prismaCodesOn(c).filter((code) => prismaSet.val.has(code));
                ask({
                    question: `Unprisma ${codes.length} ${bubbleWord(c, codes.length)}?`,
                    confirmLabel: codes.length === 1 ? "Unprisma it" : "Unprisma them",
                    from: unprismaAll,
                    onConfirm: () => prismaAll(codes, false),
                });
            },
        });

        return [
            setAllControl,
            div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Prisma all",
                    status: bulk.status,
                    disabled: () => prismaOn(cauldron()) === prismaCodesOn(cauldron()).length,
                    onClick: (e) => {
                        e.preventDefault();
                        const c = cauldron();
                        void prismaAll(prismaCodesOn(c), true);
                    },
                }),
                unprismaAll
            ),
        ];
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Bubbles",
        automation: { page: "automation.alchemy" },
        description: "Bubble levels and prisma bubbles in all four cauldrons.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading bubbles",
        errorTitle: "Couldn't read bubbles",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Bubbles",
                tabs: CAULDRONS.map((cauldron) => ({
                    id: cauldron.id,
                    label: cauldron.label,
                    content: paneOf[cauldron.index],
                })),
                tools,
                toolsLabel,
            })
        ),
    });
};

export default definePage({
    id: "w2.bubbles",
    world: 2,
    system: "Alchemy",
    tab: "Bubbles",
    description: "Bubble levels and prisma bubbles in all four cauldrons.",
    keywords: ["Alchemy", "Brewing", "Prisma", "Orange", "Green", "Purple", "Yellow"],
    component: BubblesTab,
});
