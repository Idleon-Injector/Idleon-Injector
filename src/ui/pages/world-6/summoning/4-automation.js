/**
 * World 6 › Summoning › Automation: which summoning board upgrades the summoning automation buys. Each essence colour
 * has its own section: what it owns, what it saves for, its saving %, and its upgrades, each with a stop-at level,
 * a priority (High / Low / Balanced) and a switch.
 *
 * Reads readComputed("automation", "summoning") ({ waiting, essences, upgrades }) and saves
 * cheatConfig.automation.summoning.items (one { id, on, stopAt, priority } per upgrade) and
 * cheatConfig.automation.summoningSaving (one % per colour).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { fetchConfig, readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationRow,
    PickRow,
    SavingRow,
    createAutomationPicks,
    readAutomations,
    saveAutomation,
    setAtStart,
    switchAutomation,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const CHEAT = "automation summoning";
// The game's essence colours in Summon[2] order; also the keys of cheatConfig.automation.summoningSaving.
const ESSENCES = ["white", "green", "yellow", "blue", "purple", "red", "cyan", "teal"];
const title = (colour) => `${colour[0].toUpperCase()}${colour.slice(1)}`;

const lockedText = ({ lockedBy: { parent, lore } }) =>
    lore ? "Unlocks once Spelunking's Lore Boss 5 is beaten" : `Unlocks once ${cleanName(parent)} has a level`;

const UpgradeInfo = ({ name, upgrade }) =>
    div(
        { class: "account-row__name-group" },
        span({ class: "account-row__name" }, name),
        span({ class: "account-row__sub-label automation-bonus", hidden: () => !upgrade.val.bonus }, () =>
            cleanName(upgrade.val.bonus)
        ),
        span({ class: "account-row__sub-label", hidden: () => !upgrade.val.note }, () => upgrade.val.note ?? ""),
        span({ class: "account-row__sub-label" }, () => {
            const { level, max, unlocked, cost, colour } = upgrade.val;
            if (max !== null && level >= max) return "Max level";
            if (!unlocked) return lockedText(upgrade.val);
            // The board rounds a cost under 1000 up, as here; it pays the exact cost.
            return `Next level ${formatNumber(cost < 1000 ? Math.ceil(cost) : cost)} ${ESSENCES[colour]} essence`;
        })
    );

const SummoningAutomationTab = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    // Switching an upgrade on switches Summoning on too (now and at start), so buying starts at once.
    const picks = createAutomationPicks("summoning", {
        inItems: true,
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return setAtStart(CHEAT, true);
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
    });
    // What each colour saves for changes with every pick, so a pick's save reads the game again once it ends.
    const rowPicks = { ...picks, set: (id, patch) => picks.set(id, patch).finally(() => load()) };
    const { loading, error, run } = useAccountLoad({ label: "Summoning automation" });
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const waiting = van.state(null);
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade entry
    const essences = ESSENCES.map(() => van.state({ owned: 0, goal: null }));
    const saving = ESSENCES.map(() => van.state(null));
    const lists = ESSENCES.map(() => div({ class: "account-item-stack" }));
    const reconcilers = lists.map(createStaticRowReconciler);
    const switchNode = div();
    let reads = 0;

    const load = () =>
        run(async () => {
            const read = ++reads;
            const since = picks.edits(); // a save that ends while this reads makes the read old
            const [data, config] = await Promise.all([readComputed("automation", "summoning"), fetchConfig()]);
            await readSwitch();
            if (read !== reads) return; // a newer read is on its way; it shows its own answer
            picks.sync(config.cheatConfig.automation.summoning, since);
            ESSENCES.forEach((colour, i) => (saving[i].val = config.cheatConfig.automation.summoningSaving[colour]));
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));

            // The rows read these states as they are made, so they hold the game's entries first.
            for (const upgrade of data.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            ESSENCES.forEach((_, colour) => {
                const rows = data.upgrades.filter((upgrade) => upgrade.colour === colour);
                reconcilers[colour](rows.map(({ id }) => id).join("|"), () =>
                    rows.map(({ id, name }) => {
                        const upgrade = getOrCreateState(upgrades, id, {});
                        return PickRow({
                            picks: rowPicks,
                            id: String(id),
                            name: cleanName(name),
                            info: UpgradeInfo({ name: cleanName(name), upgrade }),
                            badge: () =>
                                `LV ${upgrade.val.level ?? 0}${upgrade.val.max ? ` / ${upgrade.val.max}` : ""}`,
                            priority: true,
                        });
                    })
                );
            });
            data.essences.forEach((essence, i) => (essences[i].val = essence));
            waiting.val = data.waiting;
            ids.val = data.upgrades.map(({ id }) => String(id));
        });

    const writeSaving = (colour) => async (next, gameTook) => {
        try {
            await saveAutomation("summoningSaving", { [colour]: next }, gameTook);
        } finally {
            await load();
        }
    };

    // What colour i is doing: paused, nothing on, saving for its goal, or buying cheapest first.
    const statusLine = (i) => {
        if (waiting.val) return waiting.val;
        const on = ids.val.some((id) => upgrades.get(Number(id))?.val.colour === i && picks.get(id).on.val);
        if (!on) return "Nothing switched on";
        const { goal } = essences[i].val;
        if (!goal) return "Buying cheapest first";
        return `Saving for ${cleanName(upgrades.get(goal.id)?.val.name)} (${formatNumber(goal.cost)})`;
    };

    // Enable all runs on one click; Disable all asks "Click again" first (#25).
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                try {
                    await picks.setAll(ids.val, on);
                } finally {
                    await load();
                }
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const switchedOn = () => ids.val.filter((id) => picks.get(id).on.val).length;

    load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on upgrades are bought with essence, each colour saving and buying on its own, and switching one on turns Summoning automation on. A colour saves for its cheapest High or Low upgrade (an affordable High one goes first) and buys Balanced ones cheapest first. Buying stops at the stop-at level; leave it empty for no limit. It pauses while the summoning board is open. Doubler slots stay manual.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    // With every upgrade on it still has work while Summoning itself is off: switching it on.
                    disabled: () => busy() || (switchedOn() === ids.val.length && Boolean(automation.val?.on)),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 summoning upgrade" : `all ${switchedOn()} summoning upgrades`}, in every colour.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING SUMMONING AUTOMATION",
        errorTitle: "SUMMONING AUTOMATION READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: switchNode }),
            ...ESSENCES.map((colour, i) =>
                AccountSection({
                    title: `${colour.toUpperCase()} ESSENCE`,
                    meta: span(
                        { class: "account-row__sub-label" },
                        () => `${formatNumber(essences[i].val.owned)} owned`
                    ),
                    body: [
                        span({ class: "automation-row__status automation-colour-status", role: "status" }, () =>
                            statusLine(i)
                        ),
                        SavingRow({ name: `${title(colour)} essence`, value: saving[i], write: writeSaving(colour) }),
                        lists[i],
                    ],
                })
            )
        ),
    });
};

export default definePage({
    id: "w6.summoning.automation",
    world: 6,
    system: "Summoning",
    tab: "Automation",
    description: "Summoning upgrades bought with essence by the summoning automation, each colour on its own.",
    keywords: ["Autobuy", "Auto buy", "Summoning Upgrades", "Familiar", "Stop at", "Priority"],
    component: SummoningAutomationTab,
});
