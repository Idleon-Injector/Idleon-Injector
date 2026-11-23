/**
 * W6 - Summoning
 *
 * One page, the game's summoning screens as its tabs: Upgrades (the board, a group per essence colour), Essence and
 * Battles. One read of the game fills every tab. The summoning automation is its own page (2-automation.js).
 *
 * Data sources:
 *   gga.Summon[0][n]               - board upgrade n's level (cList.SummonUPG: [2] colour, [3] name, [8] max level, 9999
 *                                    for none, [11] bonus)
 *   gga.Summon[2][c]               - essence of colour c (White to Teal)
 *   gga.OptionsListAccount[319]    - Endless Summoning wins
 *   gga.Summon[1]                  - the opponents beaten, by id (cList.SummonEnemies: [0] id, [4] name, [5] the bonus
 *                                    slot a win adds to, [6] the bonuses' words, [8] the ladder's step)
 *   gga.DNSM.h.SummWinBonus        - the game's cache of the win bonuses, cleared after a save so it rebuilds at once
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { TabbedList, loadParts } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    oneAtATime,
    writeVerified,
    toInt,
    toNum,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

// The game's essence colours, in Summon[2] order (also the board's colour numbers and summoningSaving's order).
const COLOURS = ["White", "Green", "Yellow", "Blue", "Purple", "Red", "Cyan", "Teal"];
const NO_MAX = 9999;
// Most upgrades have no max, so no row has a Max button: the values line up down the list (+ stops at a max).

// ---- Upgrades ----------------------------------------------------------------------------------------------------

const UpgradesPart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const nodes = COLOURS.map(() => div());
    const reconcilers = nodes.map(createStaticRowReconciler);
    const counts = COLOURS.map(() => van.state(0));

    const UpgradeRow = (upgrade) => {
        const info = RowTitles({ bonus: upgrade.bonus, name: upgrade.name });
        if (upgrade.max === null)
            return SimpleNumberRow({
                entry: { name: upgrade.name, path: `Summon[0][${upgrade.n}]`, formatted: false, info },
                valueState: getLevelState(upgrade.n),
            });
        return ClampedLevelRow({
            valueState: getLevelState(upgrade.n),
            writePath: `Summon[0][${upgrade.n}]`,
            max: upgrade.max,
            integerMode: "round",
            name: upgrade.name,
            renderInfo: () => info,
        });
    };

    return {
        content: div(
            { class: "field-columns" },
            ...COLOURS.map((colour, c) =>
                div({ hidden: () => !counts[c].val }, AccountSection({ title: colour, body: nodes[c] }))
            )
        ),
        load: async () => {
            const [rawLevels, rawInfo] = await Promise.all([gga("Summon[0]"), readCList("SummonUPG")]);
            const levels = toIndexedArray(rawLevels ?? []);
            const upgrades = toIndexedArray(rawInfo ?? [])
                .map((raw, n) => {
                    const def = toIndexedArray(raw ?? []);
                    const max = toInt(def[8], { min: 0 });
                    return {
                        n,
                        raw: String(def[3] ?? "").trim(),
                        name: cleanName(def[3]),
                        colour: toInt(def[2], { min: 0 }),
                        bonus: bonusText(def[11]),
                        max: max && max < NO_MAX ? max : null,
                    };
                })
                .filter((upgrade) => upgrade.raw);
            COLOURS.forEach((_, c) => {
                const own = upgrades.filter((upgrade) => upgrade.colour === c);
                reconcilers[c](own.map((upgrade) => `${upgrade.raw}:${upgrade.max}`).join("|"), () =>
                    own.map(UpgradeRow)
                );
                counts[c].val = own.length;
            });
            upgrades.forEach((upgrade) => (getLevelState(upgrade.n).val = toInt(levels[upgrade.n], { min: 0 })));
        },
    };
};

// ---- Essence -----------------------------------------------------------------------------------------------------

const EssencePart = () => {
    const list = NumberList();
    return {
        content: list.node,
        load: async () => {
            const amounts = toIndexedArray((await gga("Summon[2]")) ?? []);
            list.show(
                COLOURS.map((colour, c) => ({
                    key: colour,
                    name: `${colour} Essence`,
                    path: `Summon[2][${c}]`,
                    value: toNum(amounts[c], 0),
                    float: true,
                }))
            );
        },
    };
};

// ---- Battles -----------------------------------------------------------------------------------------------------

const ENDLESS_PATH = "OptionsListAccount[319]";
const WON_PATH = "Summon[1]";
// The game keeps the win bonuses in a scratch cache that it rebuilds only after a real win's chest, or on a fresh start.
// After a save here it goes, so the game works the bonuses out again from the new wins at once.
const WIN_BONUS_CACHE = "DNSM.h.SummWinBonus";
// The opponents of each colour, in the game's ladder (cList.SummonEnemies[8], easiest first): the first 9 are White's,
// the next 15 Green's, and so on.
const COLOUR_SIZES = [9, 15, 11, 14, 13, 13, 14, 18];
// The list's opponents that aren't on the colour ladder: the Rift and stone trials, the bosses and the gambits.
const OFF_LADDER = /^(rift|Crystal|mini|Boss|baba)|^slimeB$/;
// A win the game saves under another id.
const WON_AS = { poopD: ["poopD", "poopSmall"] };

const BattlesPart = () => {
    const endless = NumberList();
    const won = van.state([]);
    const nodes = COLOURS.map(() => div());
    const reconcilers = nodes.map(createStaticRowReconciler);
    const counts = COLOURS.map(() => van.state(0));
    // The wins are one list in the game: a flip saves after the one before it, from the list the game holds now.
    const inTurn = oneAtATime();
    const isWon = (id) => (WON_AS[id] ?? [id]).some((saved) => won.val.includes(saved));

    const OpponentRow = (opponent) =>
        AccountToggleRow({
            info: RowTitles({ bonus: opponent.bonus, name: opponent.name }),
            words: ["Won", ""],
            name: opponent.name,
            checked: () => isWon(opponent.id),
            write: (on) =>
                inTurn(async () => {
                    const now = toIndexedArray((await gga(WON_PATH)) ?? []);
                    const saved = WON_AS[opponent.id] ?? [opponent.id];
                    const next = on
                        ? now.some((id) => saved.includes(id))
                            ? now
                            : [...now, opponent.id]
                        : now.filter((id) => !saved.includes(id));
                    await writeVerified(WON_PATH, next);
                    won.val = next;
                    await deleteGga(WIN_BONUS_CACHE);
                }),
        });

    return {
        content: div(
            endless.node,
            ...COLOURS.map((colour, c) =>
                div({ hidden: () => !counts[c].val }, AccountSection({ title: colour, body: nodes[c] }))
            )
        ),
        load: async () => {
            const [rawEndless, rawWon, rawEnemies] = await Promise.all([
                gga(ENDLESS_PATH),
                gga(WON_PATH),
                readCList("SummonEnemies"),
            ]);
            endless.show([
                {
                    key: "endless",
                    name: "Endless wins",
                    path: ENDLESS_PATH,
                    value: toInt(rawEndless, { min: 0 }),
                    formatted: false,
                    // A save clears the game's win bonuses, so they follow the new count at once.
                    afterWrite: () => deleteGga(WIN_BONUS_CACHE),
                },
            ]);
            won.val = toIndexedArray(rawWon ?? []);
            const columns = toIndexedArray(rawEnemies ?? []).map((raw) => toIndexedArray(raw ?? []));
            const [ids = [], names = [], bonusSlots = [], bonuses = [], ladder = []] = [0, 4, 5, 6, 8].map(
                (column) => columns[column]
            );
            const opponents = ids
                .map((id, i) => ({
                    id: String(id ?? ""),
                    raw: String(names[i] ?? ""),
                    name: cleanName(names[i]),
                    // The game's bonus for a win ("<x_Total_DMG"): "<x" is its multiplier's mark.
                    bonus: bonusText(String(bonuses[toInt(bonusSlots[i], { min: 1 }) - 1] ?? "").replace(/^</, "}")),
                    step: Number(ladder[i]),
                    i,
                }))
                .filter(
                    (opponent) => opponent.id && opponent.raw && opponent.raw !== "_" && Number.isFinite(opponent.step)
                )
                .filter((opponent) => !OFF_LADDER.test(opponent.id))
                .sort((a, b) => a.step - b.step || a.i - b.i);
            let first = 0;
            COLOURS.forEach((_, c) => {
                const own = opponents.slice(first, first + COLOUR_SIZES[c]);
                first += COLOUR_SIZES[c];
                reconcilers[c](own.map((opponent) => opponent.id).join("|"), () => own.map(OpponentRow));
                counts[c].val = own.length;
            });
        },
    };
};

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "upgrades", label: "Upgrades", part: UpgradesPart, keywords: ["Summoning Upgrades", "Board", "Familiar"] },
    { id: "essence", label: "Essence", part: EssencePart, keywords: ["Summoning Essence"] },
    {
        id: "battles",
        label: "Battles",
        part: BattlesPart,
        keywords: ["Rounds", "Endless", "Summoning Battles", "Opponents", "Win bonuses"],
    },
];

const SummoningTab = () => {
    const parts = new Map();
    const { loading, error, run } = useAccountLoad({ label: "Summoning" });
    const load = () => run(() => loadParts(parts));
    for (const tab of TABS) parts.set(tab.id, tab.part());

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container summoning-tab",
        title: "Summoning",
        description: "The board's upgrades, essence and battles.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading summoning",
        errorTitle: "Couldn't read summoning",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Summoning",
                page: "w6.summoning",
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: parts.get(tab.id).content })),
            })
        ),
    });
};

export default definePage({
    id: "w6.summoning",
    world: 6,
    system: "Summoning",
    // Its system has two sidebar entries: this page and Automation (2-automation.js).
    tab: "Summoning",
    description: "The board's upgrades, essence and battles.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: SummoningTab,
});
