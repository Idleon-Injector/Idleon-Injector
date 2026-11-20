/**
 * World 6 › Sneaking › Automation: which Ninja Knowledge upgrades the sneaking automation buys with jade coins, by
 * the shared rule (High / Low / Balanced, saving %), each up to its stop-at.
 *
 * Reads readComputed("automation", "sneaking") (jade, every upgrade with its bonus, level, next cost and lock) and
 * saves cheatConfig.automation.sneaking = { saving, items: [{ id: "row", on, stopAt, priority }] }.
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
    setAtStart,
    switchAutomation,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const CHEAT = "automation sneaking";

// The row's first render runs before its data lands, so unlockAt may be missing.
const lockedText = ({ unlockAt: { parent, reef } = {} }) => {
    if (reef) return `Unlocks at level ${reef} of the W7 Coral Reef's Ninja Knowledge upgrade`;
    return parent ? `Unlocks once ${cleanName(parent)} has a level` : "Unlocks with Sneaking mastery";
};

const SneakingAutomationTab = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    // Switching an upgrade on switches Sneaking on too (now and at start), so buying starts at once.
    const picks = createAutomationPicks("sneaking", {
        withSaving: true,
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return setAtStart(CHEAT, true);
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
    });
    const ids = van.state([]);
    const jade = van.state(null);
    const upgrades = new Map(); // id -> state of the game's row
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const { loading, error, run } = useAccountLoad({ label: "Sneaking automation" });

    const switchNode = div();
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const load = () =>
        run(async () => {
            const since = picks.edits(); // a save that ends while this reads makes the read old
            const [data, config] = await Promise.all([readComputed("automation", "sneaking"), fetchConfig()]);
            await readSwitch();
            picks.sync(config.cheatConfig.automation.sneaking, since);
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));

            jade.val = data.jade;
            reconcile(data.upgrades.map(({ id }) => id).join("|"), () =>
                data.upgrades.map(({ id, name }) => {
                    const upgrade = getOrCreateState(upgrades, String(id), {});
                    return PickRow({
                        picks,
                        id: String(id),
                        name: cleanName(name),
                        badge: () => `LV ${formatNumber(upgrade.val.level ?? 0)}`,
                        priority: true,
                        detail: [
                            span({ class: "account-row__sub-label" }, () => cleanName(upgrade.val.bonus ?? "")),
                            span({ class: "account-row__sub-label" }, () =>
                                upgrade.val.unlocked
                                    ? `Next level ${formatNumber(upgrade.val.cost)} jade`
                                    : lockedText(upgrade.val)
                            ),
                        ],
                    });
                })
            );
            for (const upgrade of data.upgrades) getOrCreateState(upgrades, String(upgrade.id), {}).val = upgrade;
            ids.val = data.upgrades.map(({ id }) => String(id));
        });

    // Enable all runs on one click; Disable all asks "Click again" first (#25). Stop-at and priority stay.
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                await picks.setAll(ids.val, on);
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const switchedOn = () => ids.val.filter((id) => picks.get(id).on.val).length;

    load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on Ninja Knowledge upgrades are bought with jade coins, and switching one on turns Sneaking on. It saves for the cheapest High or Low upgrade (High first when one is affordable) and buys Balanced ones cheapest first. They have no max level, so give each a stop-at unless it should take all your jade.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    // With every upgrade on it still has work while Sneaking itself is off: switching it on.
                    disabled: () => busy() || (switchedOn() === ids.val.length && Boolean(automation.val?.on)),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 upgrade" : `all ${switchedOn()} upgrades`}; their stop-at and priority stay.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING NINJA KNOWLEDGE",
        errorTitle: "NINJA KNOWLEDGE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({
                title: "AUTOMATION",
                note: () => (jade.val === null ? "" : `${formatNumber(jade.val)} JADE`),
                body: [switchNode, SavingRow({ picks })],
            }),
            AccountSection({ title: "NINJA KNOWLEDGE", body: listNode })
        ),
    });
};

export default definePage({
    id: "w6.sneaking.automation",
    world: 6,
    system: "Sneaking",
    tab: "Automation",
    description: "Ninja Knowledge upgrades bought with jade coins, each up to its stop-at, by priority.",
    keywords: ["Autobuy", "Auto buy", "Ninja Knowledge", "Jade", "Stop at"],
    component: SneakingAutomationTab,
});
