/**
 * World 7 › Bubba › Automation: which Bubba upgrades the Bubba automation buys with meat, by the shared rule
 * (High / Low / Balanced, saving %), each up to its stop-at.
 *
 * Reads readComputed("automation", "bubba") (meat, the goal, every upgrade) and saves cheatConfig.automation.bubba,
 * { saving, items: [{ id, on, stopAt, priority }] }.
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
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const CHEAT = "automation bubba";

const BubbaAutomationTab = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    const data = van.state(null); // the game's read: { waiting, meat, goal, upgrades }
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the upgrade's read
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const { loading, error, run } = useAccountLoad({ label: "Bubba automation" });

    const switchNode = div();
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    let reads = 0; // a read that a newer one overtook doesn't put its older status back
    const load = () =>
        run(async () => {
            const since = picks.edits(); // a save that ends while this reads makes the read old
            const mine = ++reads;
            const [read, config] = await Promise.all([readComputed("automation", "bubba"), fetchConfig()]);
            await readSwitch();
            if (mine !== reads) return;
            picks.sync(config.cheatConfig.automation.bubba, since);
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));

            reconcile(read.upgrades.map(({ id }) => id).join("|"), () =>
                read.upgrades.map(({ id, name }) => {
                    const upgrade = getOrCreateState(upgrades, id, {});
                    return PickRow({
                        picks,
                        id: String(id),
                        name: cleanName(name),
                        withPriority: true,
                        badge: () => `LV ${upgrade.val.level ?? 0}${upgrade.val.max ? ` / ${upgrade.val.max}` : ""}`,
                        sub: () => {
                            const { level, max, cost, unlockAt, unlocked } = upgrade.val;
                            if (max !== null && level >= max) return "Max level";
                            if (!unlocked) return `Unlocks at ${formatNumber(unlockAt)} meat made`;
                            return `Next level ${formatNumber(cost)} meat`;
                        },
                    });
                })
            );
            for (const upgrade of read.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            ids.val = read.upgrades.map(({ id }) => String(id));
            data.val = read;
        });

    // Switching an upgrade on switches the Bubba automation on too (now and at start), so buying starts at once.
    // After every save the page reads the game again, so the status line follows the picks.
    const picks = createAutomationPicks("bubba", {
        withSaving: true,
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            // Already running (from the Cheats page, say): only make sure it starts again next time.
            if (automation.val?.on) return setAtStart(CHEAT, true);
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
        onSaved: load,
    });

    const status = () => {
        const read = data.val;
        if (!read) return "";
        if (read.waiting) return read.waiting;
        if (!ids.val.some((id) => picks.get(id).on.val)) return "Nothing switched on";
        if (!read.goal) return "Buying cheapest first";
        const goal = read.upgrades.find(({ id }) => id === read.goal.id);
        return `Saving for ${cleanName(goal.name)} (${formatNumber(read.goal.cost)} meat)`;
    };

    // Enable all runs on one click; Disable all asks "Click again" first (#25).
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
            "Switched-on upgrades are bought with meat once the run's gift is picked, and switching one on turns the Bubba automation on. It saves for the cheapest High or Low upgrade (an affordable High one goes first) and buys Balanced ones cheapest first. Buying stops at the stop-at level; leave it empty for no limit. Pats and charisma stay manual.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    // With every upgrade on it still has work while the automation itself is off: switching it on.
                    disabled: () => busy() || (switchedOn() === ids.val.length && Boolean(automation.val?.on)),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 Bubba upgrade" : `all ${switchedOn()} Bubba upgrades`}.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING BUBBA",
        errorTitle: "BUBBA READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: switchNode }),
            AccountSection({
                title: "MEAT",
                meta: span({ class: "account-row__sub-label" }, () =>
                    data.val ? `${formatNumber(data.val.meat)} owned` : ""
                ),
                body: [
                    AccountRow({
                        info: span({ class: "account-row__name", role: "status" }, status),
                    }),
                    SavingRow({ picks, name: "Bubba" }),
                ],
            }),
            AccountSection({ title: "UPGRADES", body: listNode })
        ),
    });
};

export default definePage({
    id: "w7.bubba.automation",
    world: 7,
    system: "Bubba",
    tab: "Automation",
    description: "Bubba upgrades bought with meat by the automation, each up to its stop-at, High, Low or Balanced.",
    keywords: ["Autobuy", "Auto buy", "Clicker", "Stop at", "Priority"],
    component: BubbaAutomationTab,
});
