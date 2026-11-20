import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { Icons } from "../../../assets/icons.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    joinClasses,
    oneAtATime,
    resolveNumberInput,
    resolveValue,
    runBulkSet,
    toInt,
    unwrapH,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { Said, announce, replay, useSaid } from "../../../components/inPlace.js";
import { hideTooltip, showTooltip } from "../../../components/Tooltip.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span, select, option, details, summary } = van.tags;

const CARD_PATH = "Cards[0].h";
const TIER_MULTIPLIERS = [1, 3, 5, 16, 459, 14645];
const CARD_REGION_NAMES = [
    "BLUNDER HILLS W1",
    "YUM-YUM DESERT W2",
    "EASY RESOURCES",
    "MEDIUM RESOURCES",
    "FROSTBITE TUNDRA W3",
    "HARD RESOURCES",
    "HYPERION NEBULA W4",
    "SMOULDERIN PLATEAU W5",
    "SPIRITED VALLEY W6",
    "SHIMMERFIN DEEP W7",
    "DUNGEONS",
    "BOSSES AND NIGHTMARES",
    "EVENTS",
];

const toUnwrappedIndexedArray = (value) => toIndexedArray(unwrapH(value));
// The last tier reached. Chromium 87 (the Steam client) has no findLastIndex.
const tierIndexForAmount = (amount, thresholds) =>
    thresholds.reduce((last, threshold, i) => (Number(amount) >= threshold ? i : last), -1);

const nextTierLabel = (amount, thresholds) => {
    const nextThreshold = thresholds.find((threshold) => Number(amount) < threshold);
    return nextThreshold === undefined ? "MAX TIER" : `NEXT: ${nextThreshold}`;
};

const tierBadgeClass = (amount, thresholds) => {
    const tierIndex = tierIndexForAmount(amount, thresholds);
    return tierIndex < 0 ? "card-tier-badge--base" : `card-tier-badge--tier-${tierIndex + 1}`;
};

const TierBadgeContent = ({ amount, thresholds }) => {
    const tierIndex = tierIndexForAmount(amount, thresholds);
    if (tierIndex < 0) return span({ class: "card-tier-display" }, "BASE");

    return span(
        { class: "card-tier-display" },
        Icons.CardTier(tierIndex + 1, { class: "card-tier-icon" }),
        `TIER ${tierIndex + 1}`
    );
};

// A card row's tier: picking one sets the card's amount to that tier's minimum.
const TierSelect = ({ thresholds, onSelect, status }) =>
    select(
        {
            class: () => {
                const resolvedStatus = resolveValue(status);
                return joinClasses(
                    "select-base card-tier-select",
                    resolvedStatus === "loading" ? "card-tier-select--loading" : "",
                    resolvedStatus === "success" ? "card-tier-select--success" : "",
                    resolvedStatus === "error" ? "card-tier-select--error" : ""
                );
            },
            disabled: () => resolveValue(status) === "loading",
            onchange: async (event) => {
                const tierIndex = Number(event.target.value);
                event.target.value = "";
                await onSelect(tierIndex, thresholds[tierIndex]);
            },
        },
        option({ value: "", disabled: true, selected: true }, "Set tier"),
        ...TIER_MULTIPLIERS.map((_, tierIndex) =>
            option({ value: tierIndex }, `TIER ${tierIndex + 1} - ${thresholds[tierIndex]}`)
        )
    );

// The tier a region's pick names, or null for an empty or invalid pick.
const pickedTier = (pick) => {
    const tierIndex = pick === "" ? NaN : Number(pick);
    return Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < TIER_MULTIPLIERS.length ? tierIndex : null;
};

const CardRow = ({ card, valueState }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => resolveNumberInput(rawValue, { min: 0, fallback: null }),
        write: (nextValue) => writeVerified(card.path, nextValue),
        renderInfo: () =>
            div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, card.name),
                span(
                    { class: "account-row__sub-label" },
                    () => `${card.monsterId} · ${nextTierLabel(valueState.val, card.thresholds)}`
                )
            ),
        renderBadge: (currentValue) => TierBadgeContent({ amount: currentValue, thresholds: card.thresholds }),
        renderExtraActions: ({ status, applyValue }) =>
            TierSelect({
                thresholds: card.thresholds,
                status,
                onSelect: (_, threshold) => applyValue(threshold),
            }),
        rowClass: "account-row--wide-controls card-row",
        badgeClass: () => joinClasses("card-tier-badge", tierBadgeClass(valueState.val, card.thresholds)),
        controlsClass: "account-row__controls--xl card-row__controls",
        inputProps: { "aria-label": `Card Amount for ${card.name}` },
    });

const UnresolvedCardRow = ({ card, valueState }) =>
    EditableNumberRow({
        valueState,
        normalize: (rawValue) => resolveNumberInput(rawValue, { min: 0, fallback: null }),
        write: (nextValue) => writeVerified(card.path, nextValue),
        renderInfo: () =>
            div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, card.monsterId),
                span({ class: "account-row__sub-label" }, "CARD DEFINITION OR NAME UNRESOLVED")
            ),
        renderBadge: () => "Raw only",
        rowClass: "account-row--wide-controls card-row card-row--unresolved",
        controlsClass: "account-row__controls--xl card-row__controls",
        inputProps: { "aria-label": `Card Amount for unresolved card ${card.monsterId}` },
    });

const buildCardData = async (rawCards, rawCardStuff) => {
    const accountCards = unwrapH(rawCards) ?? {};
    const accountIds = Object.keys(accountCards);
    const matchedIds = new Set();

    const regions = CARD_REGION_NAMES.map((name, regionIndex) => {
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

const CardSection = ({
    region,
    openState,
    valueStates,
    bulkStatus = null,
    activeBulkRegion = null,
    setRegionTier = null,
    lowerQuestion = null,
    said = null,
    unresolved = false,
}) => {
    const status = () => (setRegionTier && activeBulkRegion.val === region.key ? bulkStatus.val : null);
    // The region's tier is a pick, then Set all, as on Sigils and Bubbles: an arrow key only moves the pick.
    const tierPick = van.state("");
    const pickNode = setRegionTier
        ? select(
              {
                  class: "select-base card-tier-select card-region__tier-select",
                  "aria-label": `Tier for ${region.name}`,
                  disabled: () => region.cards.length === 0,
                  onchange: (event) => (tierPick.val = event.target.value),
              },
              option({ value: "", disabled: true, selected: true }, "Pick a tier"),
              ...TIER_MULTIPLIERS.map((_, tierIndex) => option({ value: tierIndex }, `TIER ${tierIndex + 1}`))
          )
        : null;
    const Row = unresolved ? UnresolvedCardRow : CardRow;

    return div(
        {
            class: () =>
                joinClasses(
                    "card-region",
                    unresolved ? "card-region--unresolved" : "",
                    status() === "success" ? "card-region--success" : "",
                    status() === "error" ? "card-region--error" : ""
                ),
        },
        details(
            {
                class: "card-region__details",
                open: openState,
                ontoggle: (event) => (openState.val = event.target.open),
            },
            summary(
                { class: "card-region__toggle" },
                Icons.Chevron({ dir: "right", class: "card-region__chevron" }),
                span({ class: "card-region__title" }, region.name),
                span({ class: "card-region__count" }, `${region.cards.length} CARDS`)
            ),
            // Why the region's last tier pick failed; the region opens to show it.
            said ? Said({ said: said.said, className: "said--line card-region__said", kinds: ["failed"] }) : null,
            div(
                { class: "card-region__body account-item-stack" },
                ...region.cards.map((card) => Row({ card, valueState: getOrCreateState(valueStates, card.monsterId) }))
            )
        ),
        setRegionTier
            ? div(
                  { class: "card-region__tier" },
                  pickNode,
                  ActionButton({
                      label: "Set all",
                      status,
                      disabled: () => region.cards.length === 0,
                      tooltip: "Set every card in this region to the picked tier",
                      confirm: () => lowerQuestion(region, tierPick.val),
                      onClick: () => setRegionTier(region, tierPick.val, pickNode),
                  })
              )
            : null
    );
};

const CardsTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Cards" });
    const { status: bulkStatus, run: runBulk } = useWriteStatus();
    const totalCards = van.state(0);
    const amountStates = new Map();
    const openStates = new Map();
    const activeBulkRegion = van.state(null);
    const regionSaids = new Map();
    const getRegionSaid = (key) => {
        if (!regionSaids.has(key)) regionSaids.set(key, useSaid());
        return regionSaids.get(key);
    };
    const regionsNode = div({ class: "cards-regions" });
    const reconcileRegions = createStaticRowReconciler(regionsNode);

    const getOpenState = (key) => getOrCreateState(openStates, key, false);

    const load = () =>
        runLoad(async () => {
            const [rawCards, rawCardStuff] = await Promise.all([gga(CARD_PATH), readCList("CardStuff")]);
            const data = await buildCardData(rawCards, rawCardStuff);
            const signature = JSON.stringify({
                regions: data.regions.map((region) => ({
                    name: region.name,
                    cards: region.cards.map((card) => [card.monsterId, card.name, card.baseRequirement]),
                })),
                unresolved: data.unresolved.map((card) => card.monsterId),
            });

            reconcileRegions(signature, () => [
                ...data.regions.map((region) =>
                    CardSection({
                        region,
                        openState: getOpenState(region.key),
                        valueStates: amountStates,
                        bulkStatus,
                        activeBulkRegion,
                        setRegionTier,
                        lowerQuestion,
                        said: getRegionSaid(region.key),
                    })
                ),
                ...(data.unresolved.length
                    ? [
                          CardSection({
                              region: {
                                  key: "unresolved",
                                  name: "UNRESOLVED CARDS",
                                  cards: data.unresolved,
                              },
                              openState: getOpenState("unresolved"),
                              valueStates: amountStates,
                              unresolved: true,
                          }),
                      ]
                    : []),
            ]);

            data.regions.forEach((region) => {
                region.cards.forEach((card) => (getOrCreateState(amountStates, card.monsterId).val = card.amount));
            });
            data.unresolved.forEach((card) => (getOrCreateState(amountStates, card.monsterId).val = card.amount));
            totalCards.val = data.total;
        });

    // A pick made while another region saves waits its turn instead of being dropped.
    const inTurn = oneAtATime();
    // A Set all that would lower any card asks in place first (DESIGN.md); one that only raises runs on one press.
    const lowerQuestion = (region, pick) => {
        const tierIndex = pickedTier(pick);
        if (tierIndex === null) return null;
        const lowered = region.cards.filter(
            (card) => getOrCreateState(amountStates, card.monsterId).val > card.thresholds[tierIndex]
        ).length;
        return lowered
            ? `lower ${lowered} card${lowered === 1 ? "" : "s"} in ${region.name} to tier ${tierIndex + 1}.`
            : null;
    };

    // An empty or invalid pick writes nothing: the select pulses and says why.
    const setRegionTier = (region, pick, pickNode) => {
        const tierIndex = pickedTier(pick);
        if (tierIndex === null) {
            const why = "Pick a tier first";
            announce(why);
            replay(pickNode, "refused");
            showTooltip(pickNode, why);
            setTimeout(() => hideTooltip(pickNode), 4000);
            return undefined;
        }
        return inTurn(async () => {
            const said = getRegionSaid(region.key);
            said.clear();
            activeBulkRegion.val = region.key;
            const result = await runBulk(() =>
                runBulkSet({
                    entries: region.cards,
                    getTargetValue: (card) => card.thresholds[tierIndex],
                    getValueState: (card) => getOrCreateState(amountStates, card.monsterId),
                    getPath: (card) => card.path,
                })
            );

            if (!result.ok) {
                said.say("failed", saveFailureReason(result.error));
                getOpenState(region.key).val = true;
                await load();
            }
        });
    };

    load();

    const body = div({ class: "cards-page-content" }, div({ class: "scrollable-panel cards-scroll" }, regionsNode));

    return PersistentAccountListPage({
        title: "CARDS",
        description: () => `${totalCards.val} cards grouped by Card Region. Edit amounts or set exact tier minimums.`,
        actions: RefreshButton({
            onRefresh: load,
            tooltip: "Re-read live cards and definitions from the running game.",
            disabled: () => loading.val || bulkStatus.val === "loading",
        }),
        state: { loading, error },
        loadingText: "READING ACCOUNT CARDS",
        errorTitle: "CARD READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body,
    });
};

export default definePage({
    id: "account.cards",
    world: "account",
    system: "Card Search",
    description: "Card amounts and tiers, grouped by card region.",
    keywords: ["Cards"],
    component: CardsTab,
});
