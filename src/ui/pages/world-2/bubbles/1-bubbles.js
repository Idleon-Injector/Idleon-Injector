/**
 * W2 - Brewing Tab (Alchemy Bubbles)
 *
 * Prisma format in OptionsListAccount[384]:
 *   "0"         -> no prisma bubbles
 *   "_0,"       -> orange bubble index 0 is prisma
 *   "_0,_1,a3," -> orange[0], orange[1], green[3] are prisma
 *
 * Big bubble flag:
 *   cList.AlchemyDescription[cauldron][bubble][10]
 *   0 = normal bubble (prisma allowed)
 *   1 = big bubble    (prisma blocked)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { BulkActionBar, SetAllNumberControl, refuseSetAll } from "../../../components/views/account/BulkActionBar.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    cleanName,
    oneAtATime,
    readLevelDefinitions,
    resolveNumberInput,
    runBulkSet,
    sortPrefixedNumericCodes,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

const CAULDRONS = [
    { id: "orange", label: "ORANGE", index: 0, prismaKey: "_" },
    { id: "green", label: "GREEN", index: 1, prismaKey: "a" },
    { id: "purple", label: "PURPLE", index: 2, prismaKey: "b" },
    { id: "yellow", label: "YELLOW", index: 3, prismaKey: "c" },
];

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

function prismaCode(key, idx) {
    return key + String(idx);
}

function encodePrisma(set) {
    if (set.size === 0) return "0,";
    return [...set].sort(sortPrefixedNumericCodes).join(",") + ",";
}

const BubbleRow = ({ bubble, cauldron, levels, prismaSet, prismaInTurn }) => {
    const levelState = van.state(Number(levels.val?.[bubble.index] ?? 0));
    const prismaBlocked = bubble.isBigBubble === true;
    const isPrisma = van.derive(() => (prismaSet.val ?? new Set()).has(prismaCode(cauldron.prismaKey, bubble.index)));

    van.derive(() => {
        levelState.val = Number(levels.val?.[bubble.index] ?? 0);
    });

    const setLocalLevel = (level) => {
        const nextLevels = [...toIndexedArray(levels.val ?? [])];
        nextLevels[bubble.index] = level;
        levels.val = nextLevels;
    };

    return ClampedLevelRow({
        valueState: levelState,
        max: Infinity,
        write: async (nextLevel) => {
            const path = `CauldronInfo[${cauldron.index}][${bubble.index}]`;
            await writeVerified(path, nextLevel);
            setLocalLevel(nextLevel);
            return nextLevel;
        },
        renderInfo: () => [
            span({ class: "account-row__index" }, `#${bubble.index}`),
            span({ class: "account-row__name" }, bubble.name),
            prismaBlocked ? span({ class: "account-row__sub-label" }, "BIG BUBBLE") : null,
        ],
        rowClass: () => `brewing-row${isPrisma.val ? " brewing-row--prisma" : ""}`,
        badgeClass: "brewing-row__badge",
        controlsClass: "brewing-row__controls account-row__controls--xl",
        renderExtraActions: ({ run }) =>
            prismaBlocked
                ? null
                : StateSwitch({
                      checked: isPrisma,
                      words: ["Prisma", "Not prisma"],
                      name: `${bubble.name} prisma`,
                      title: () => (isPrisma.val ? "Remove Prisma" : "Set Prisma"),
                      // The switch says how its save went; the row's save state says saving… and ✓ (or the level's failure).
                      ownStatus: true,
                      onFlip: (prisma) =>
                          run(
                              () =>
                                  prismaInTurn(async () => {
                                      const code = prismaCode(cauldron.prismaKey, bubble.index);
                                      const held = parsePrisma(await gga("OptionsListAccount[384]"));
                                      const next = new Set(held);
                                      if (prisma) next.add(code);
                                      else next.delete(code);
                                      try {
                                          await writeVerified("OptionsListAccount[384]", encodePrisma(next));
                                      } catch (error) {
                                          // A failed save leaves the switches on what the game held when it started.
                                          prismaSet.val = held;
                                          throw error;
                                      }
                                      prismaSet.val = next;
                                  }),
                              "switch"
                          ),
                  }),
    });
};

const CauldronSectionBlock = ({ cauldron, levels, defs, sectionBody, setAllInput }) => {
    const { status: bulkStatus, run: runBulk } = useWriteStatus();

    const typedLevel = () => resolveNumberInput(setAllInput.val, { min: 0, fallback: null });
    const levelOf = (bubble) => Number(toIndexedArray(levels.val ?? [])[bubble.index] ?? 0);
    // Lowering takes levels away, so it asks first; raising runs on one click.
    const confirmSetAll = () => {
        const lvl = typedLevel();
        if (lvl === null) return null;
        const lowered = (defs.val ?? []).filter((bubble) => levelOf(bubble) > lvl).length;
        return lowered
            ? `lower ${lowered} ${cauldron.label.toLowerCase()} bubble${lowered === 1 ? "" : "s"} to level ${lvl}.`
            : null;
    };

    const doSetAll = async () => {
        const lvl = typedLevel();
        if (lvl === null) return refuseSetAll(setAllInput);

        const bubblesToSet = (defs.val ?? []).filter((bubble) => levelOf(bubble) !== lvl);
        if (bubblesToSet.length === 0) return undefined;

        return runBulk(async () => {
            await runBulkSet({
                entries: bubblesToSet,
                getTargetValue: () => lvl,
                getValueState: (bubble) => ({ val: levelOf(bubble) }),
                getPath: (bubble) => `CauldronInfo[${cauldron.index}][${bubble.index}]`,
                // Only the bubbles written change: a row saved meanwhile keeps its level.
                applyLocal: (bubble) => {
                    const nextLevels = [...toIndexedArray(levels.val ?? [])];
                    nextLevels[bubble.index] = lvl;
                    levels.val = nextLevels;
                },
            });
        });
    };

    return AccountSection({
        title: cauldron.label,
        rootClass: `brewing-section brewing-section--${cauldron.id}`,
        meta: ActionButton({
            label: "Set all",
            status: bulkStatus,
            tooltip: "Set all bubbles in this cauldron",
            confirm: confirmSetAll,
            onClick: async (e) => {
                e.preventDefault();
                await doSetAll();
            },
        }),
        body: sectionBody,
    });
};

const BrewingTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Brewing" });
    const setAllInput = van.state("50000");

    const cauldronLevels = new Map(CAULDRONS.map((c) => [c.id, van.state([])]));
    const bubbleDefs = new Map(CAULDRONS.map((c) => [c.id, van.state([])]));
    const prismaSet = van.state(new Set());
    // Every bubble's Prisma lives in one string, so flips save one at a time, each from the string the game holds now.
    const prismaInTurn = oneAtATime();
    const sectionsGrid = div({ class: "brewing-sections-grid grid-4col" });
    const contentNode = div({ class: "scrollable-panel" }, sectionsGrid);
    const sectionBodyNodes = new Map();
    const sectionDefinitionSignatures = new Map();
    const sectionNodes = [];

    CAULDRONS.forEach((cauldron) => {
        const sectionBody = div({ class: "brewing-section__rows" });
        sectionBodyNodes.set(cauldron.id, sectionBody);
        sectionNodes.push(
            CauldronSectionBlock({
                cauldron,
                levels: cauldronLevels.get(cauldron.id),
                defs: bubbleDefs.get(cauldron.id),
                sectionBody,
                setAllInput,
            })
        );
    });

    const reconcileCauldronRows = (cauldron) => {
        const defs = bubbleDefs.get(cauldron.id).val ?? [];
        const signature = defs
            .map((bubble) => `${bubble.index}:${bubble.name}:${bubble.isBigBubble ? 1 : 0}`)
            .join("|");
        if (sectionDefinitionSignatures.get(cauldron.id) === signature) return;

        const sectionBody = sectionBodyNodes.get(cauldron.id);
        if (!sectionBody) return;

        sectionDefinitionSignatures.set(cauldron.id, signature);

        sectionBody.replaceChildren(
            ...defs.map((bubble) =>
                BubbleRow({
                    bubble,
                    cauldron,
                    levels: cauldronLevels.get(cauldron.id),
                    prismaSet,
                    prismaInTurn,
                })
            )
        );
    };

    const reconcileBody = () => {
        CAULDRONS.forEach(reconcileCauldronRows);

        sectionsGrid.replaceChildren(...sectionNodes);
        contentNode.replaceChildren(sectionsGrid);
    };

    const load = async () =>
        run(async () => {
            const [rawPrismaStr, cauldronRows] = await Promise.all([
                gga("OptionsListAccount[384]"),
                readLevelDefinitions({
                    levelsPath: "CauldronInfo",
                    definitionsPath: "AlchemyDescription",
                    mapEntry: ({ definition, rawLevel, index }) => {
                        const cauldron = CAULDRONS.find((entry) => entry.index === index);
                        if (!cauldron) return null;
                        return {
                            id: cauldron.id,
                            levels: toIndexedArray(rawLevel ?? []),
                            defs: definition
                                .map((entry, idx) => {
                                    const entryArr = toIndexedArray(entry ?? []);
                                    const name = cleanName(entryArr[0], "BUBBLE");
                                    const isBigBubble = Number(entryArr[10] ?? 0) === 1;
                                    return { name, index: idx, isBigBubble };
                                })
                                .filter((b) => b.name.toUpperCase() !== "BUBBLE" && b.name.trim() !== ""),
                        };
                    },
                }),
            ]);

            const nextPrismaSet = parsePrisma(rawPrismaStr);
            const nextLevelsById = new Map();
            const nextDefsById = new Map();

            cauldronRows.forEach((cauldron) => {
                nextLevelsById.set(cauldron.id, cauldron.levels);
                nextDefsById.set(cauldron.id, cauldron.defs);
            });

            prismaSet.val = nextPrismaSet;
            CAULDRONS.forEach((c) => {
                cauldronLevels.get(c.id).val = nextLevelsById.get(c.id) ?? [];
                bubbleDefs.get(c.id).val = nextDefsById.get(c.id) ?? [];
            });
            reconcileBody();
        });

    load();

    return PersistentAccountListPage({
        title: "ALCHEMY - BREWING",
        description: "Set bubble levels and toggle Prisma upgrades.",
        wrapActions: false,
        actions: BulkActionBar({
            leading: SetAllNumberControl({
                label: "SET ALL LEVEL:",
                value: setAllInput,
            }),
            refresh: { onClick: load },
        }),
        state: { loading, error },
        loadingText: "READING BREWING",
        errorTitle: "BREWING READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: contentNode,
    });
};

export default definePage({
    id: "w2.bubbles",
    world: 2,
    system: "Bubbles",
    tab: "Bubbles",
    description: "Bubble levels and prisma bubbles in all four cauldrons.",
    keywords: ["Alchemy", "Brewing", "Prisma"],
    component: BrewingTab,
});
