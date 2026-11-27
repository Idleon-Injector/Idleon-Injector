/**
 * Account - Card Search
 *
 * Every card's amount (gga.Cards[0].h, by monster id), in the game's card regions (cList.CardStuff). A region is
 * picked on the list's head ("Region [Blunder Hills]", 13 of them, more than tabs hold); each card's line has its
 * amount and its tier, a step picker that sets the amount to the tier's least (base cards needed x 1, 3, 5, 16, 459,
 * 14645, plus one). The tray's All to gives the region's cards one tier, asking first when that lowers one; Set all
 * gives them one amount. Cards the game names nowhere are a last "Other cards" part.
 */
import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { AllToTool } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    resolveNumberInput,
    runBulkSet,
    toInt,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";

const { div, span } = van.tags;

const CARD_PATH = "Cards[0].h";
const TIER_MULTIPLIERS = [1, 3, 5, 16, 459, 14645];
const TIERS = TIER_MULTIPLIERS.map((_, i) => ({ value: i + 1, label: String(i + 1) }));
// The game's card regions in its order; a world's region is that world's name, as in the sidebar.
const CARD_REGIONS = [
    "Blunder Hills",
    "Yum-Yum Desert",
    "Easy Resources",
    "Medium Resources",
    "Frostbite Tundra",
    "Hard Resources",
    "Hyperion Nebula",
    "Smolderin' Plateau",
    "Spirited Valley",
    "Shimmerfin Deep",
    "Dungeons",
    "Bosses and Nightmares",
    "Events",
];
const OTHER = { key: "other", name: "Other cards" };

const toUnwrappedIndexedArray = (value) => toIndexedArray(unwrapH(value));
// The last tier reached, 0 below the first. Chromium 87 (the Steam client) has no findLastIndex.
const tierOf = (amount, thresholds) =>
    thresholds.reduce((last, threshold, i) => (Number(amount) >= threshold ? i + 1 : last), 0);
const nextTierLine = (amount, thresholds) => {
    const tier = tierOf(amount, thresholds);
    const next = thresholds[tier];
    if (next === undefined) return "Top tier";
    return `${tier ? "Next tier" : "Tier 1"} at ${next.toLocaleString("en-US")}`;
};

// A card: its name, how far the next tier is, its amount, and its tier as a step picker that sets the amount.
const CardRow = ({ card, valueState }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => resolveNumberInput(rawValue, { min: 0, fallback: null }),
        write: (nextValue) => writeVerified(card.path, nextValue),
        renderInfo: () =>
            RowTitles({
                name: card.name,
                note: card.thresholds ? () => nextTierLine(valueState.val, card.thresholds) : null,
            }),
        renderExtraActions: card.thresholds
            ? ({ applyValue }) =>
                  div(
                      { class: () => `card-tier${tierOf(valueState.val, card.thresholds) ? "" : " is-base"}` },
                      span({ class: "card-tier__label", "aria-hidden": "true" }, "Tier"),
                      StepPicker({
                          name: `${card.name} tier`,
                          steps: TIERS,
                          picked: () => tierOf(valueState.val, card.thresholds),
                          onPick: (tier) => void applyValue(card.thresholds[tier - 1]),
                      })
                  )
            : null,
        rowClass: "card-row",
        inputProps: { "aria-label": `${card.name} amount` },
        setAll: { min: 0, path: card.path },
    });

const buildCardData = async (rawCards, rawCardStuff) => {
    const accountCards = unwrapH(rawCards) ?? {};
    const accountIds = Object.keys(accountCards);
    const matchedIds = new Set();

    const regions = CARD_REGIONS.map((name, regionIndex) => {
        const cards = toUnwrappedIndexedArray(toUnwrappedIndexedArray(rawCardStuff)[regionIndex])
            .map((rawDefinition) => {
                const definition = toUnwrappedIndexedArray(rawDefinition);
                const monsterId = String(definition[0] ?? "").trim();
                if (!monsterId || monsterId === "Blank" || matchedIds.has(monsterId)) return null;

                matchedIds.add(monsterId);
                const baseRequirement = toInt(definition[2], { min: 0 });
                let amountRequired = 1;
                return {
                    monsterId,
                    baseRequirement,
                    thresholds: TIER_MULTIPLIERS.map((multiplier) => (amountRequired += baseRequirement * multiplier)),
                    amount: toInt(accountCards[monsterId] ?? 0, { min: 0 }),
                    path: `${CARD_PATH}.${monsterId}`,
                };
            })
            .filter(Boolean);

        return { key: `region-${regionIndex}`, index: regionIndex, name, cards };
    });

    const monsterIds = regions.flatMap((region) => region.cards.map((card) => card.monsterId));
    const monsterDefinitions = monsterIds.length
        ? await readGgaEntries("MonsterDefinitionsGET.h", monsterIds, ["Name"])
        : {};
    const unresolved = [];

    regions.forEach((region) => {
        region.cards = region.cards.filter((card) => {
            const name = cleanName(monsterDefinitions[card.monsterId]?.Name, "");
            if (!name) {
                unresolved.push({ monsterId: card.monsterId, amount: card.amount, path: card.path });
                return false;
            }

            card.name = name;
            return true;
        });
    });

    accountIds.forEach((monsterId) => {
        if (matchedIds.has(monsterId)) return;
        unresolved.push({
            monsterId,
            amount: toInt(accountCards[monsterId], { min: 0 }),
            path: `${CARD_PATH}.${monsterId}`,
        });
    });

    return {
        regions,
        unresolved,
        total: regions.reduce((sum, region) => sum + region.cards.length, unresolved.length),
    };
};

const CardsTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Card Search" });
    const bulk = useWriteStatus();
    const amountStates = new Map();
    const parts = van.state([]);
    // A pane per part, kept: its rows keep their saves and Undo across a refresh.
    const panes = [...CARD_REGIONS.map((_, i) => `region-${i}`), OTHER.key].map((key) => {
        const node = div({ class: "account-page-pane" });
        return { key, node, reconcile: createStaticRowReconciler(node), cards: [] };
    });
    const paneOf = (key) => panes.find((pane) => pane.key === key);

    const load = () =>
        runLoad(async () => {
            const [rawCards, rawCardStuff] = await Promise.all([gga(CARD_PATH), readCList("CardStuff")]);
            const data = await buildCardData(rawCards, rawCardStuff);
            const read = [
                ...data.regions,
                { ...OTHER, cards: data.unresolved.map((card) => ({ ...card, name: card.monsterId })) },
            ];
            for (const part of read)
                for (const card of part.cards) getOrCreateState(amountStates, card.monsterId).val = card.amount;
            for (const part of read) {
                const pane = paneOf(part.key);
                const signature = JSON.stringify(
                    part.cards.map((card) => [card.monsterId, card.name, card.baseRequirement])
                );
                pane.reconcile(signature, () => {
                    pane.cards = part.cards.map((card) => ({
                        card,
                        row: CardRow({ card, valueState: getOrCreateState(amountStates, card.monsterId) }),
                    }));
                    return pane.cards.map(({ row }) => row);
                });
            }
            parts.val = read;
        });

    // The open part's cards the tools act on: every one, or the ones the top bar's search shows.
    const shownCards = (key) => (parts.val, paneOf(key).cards).filter(({ row }) => shownBySearch(row));
    const cardWord = (n) => `card${n === 1 ? "" : "s"}`;
    const partName = (key) => parts.val.find((part) => part.key === key)?.name ?? "";

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Card Search",
        description: "Card amounts and tiers, by the game's card regions.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading cards",
        errorTitle: "Couldn't read cards",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed cards-tab" },
            TabbedList({
                name: "Card regions",
                pick: "Region",
                busy: () => bulk.status.val === "loading",
                setAll: { word: cardWord, placeholder: "Amount" },
                tabs: [
                    ...CARD_REGIONS.map((name, i) => ({
                        id: `region-${i}`,
                        label: name,
                        content: paneOf(`region-${i}`).node,
                    })),
                    { id: OTHER.key, label: OTHER.name, content: paneOf(OTHER.key).node },
                ],
                // A region's cards to one tier: each card's least amount for it. Lowering asks first.
                tools: (activeId, ask) =>
                    AllToTool({
                        ask,
                        bulk,
                        ordered: true,
                        steps: TIERS,
                        stepName: (step) => `tier ${step.label}`,
                        word: cardWord,
                        lines: () => shownCards(activeId.val).filter(({ card }) => card.thresholds),
                        pickedOf: ({ card }) =>
                            tierOf(getOrCreateState(amountStates, card.monsterId).val, card.thresholds),
                        write: (lines, tier) =>
                            runBulkSet({
                                entries: lines,
                                getTargetValue: ({ card }) => card.thresholds[tier - 1],
                                getValueState: ({ card }) => getOrCreateState(amountStates, card.monsterId),
                                getPath: ({ card }) => card.path,
                            }),
                    }),
                toolsOn: (key) => key !== OTHER.key,
                toolsLabel: (activeId) => {
                    const n = shownCards(activeId.val).length;
                    const where = partName(activeId.val);
                    return isSearching()
                        ? `${n} matching ${cardWord(n)} in ${where}`
                        : `All ${n} ${cardWord(n)} in ${where}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "account.cards",
    world: "account",
    system: "Card Search",
    description: "Card amounts and tiers, by card region.",
    keywords: ["Cards", "Card tiers"],
    component: CardsTab,
});
