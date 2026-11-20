/**
 * Account › Automation › Overview: every automation (an "automation …" toggle) with its switch and what it is doing,
 * so everything running can be seen and stopped in one place. A new system shows here by declaring its automation;
 * this page needs no edit. Each one's own tab says what it buys.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { createStaticRowReconciler, useWriteStatus } from "../../../components/views/account/accountShared.js";
import { AutomationRow, readAutomations, switchAutomation } from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div } = van.tags;

const OverviewPage = () => {
    const entries = new Map(); // cheat -> state of its entry
    const list = van.state([]);
    const { loading, error, run } = useAccountLoad({ label: "Automation" });
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const rowsNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(rowsNode);

    const load = () =>
        run(async () => {
            const automations = await readAutomations();
            for (const automation of automations) {
                if (!entries.has(automation.cheat)) entries.set(automation.cheat, van.state(automation));
                else entries.get(automation.cheat).val = automation;
            }
            list.val = automations;
            reconcile(automations.map(({ cheat }) => cheat).join("|"), () =>
                automations.length
                    ? automations.map(({ cheat }) => AutomationRow({ entry: entries.get(cheat), onSwitched: load }))
                    : [EmptyState({ title: "No automations yet" })]
            );
        });

    // Enable all runs on one click; Disable all asks "Click again" first (#25).
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                const targets = list.val.filter((automation) => automation.on !== on);
                for (const { cheat } of targets) await switchAutomation(cheat, on);
                await load();
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const running = () => list.val.filter((automation) => automation.on).length;

    load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Everything the injector buys for you, with the game's own prices and currency. A switch turns an automation on now and at every start; its own tab picks what it buys.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    disabled: () => busy() || list.val.every((automation) => automation.on),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !running(),
                    confirm: () =>
                        `stop ${running() === 1 ? "1 automation" : `all ${running()} automations`}, now and at start.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING AUTOMATIONS",
        errorTitle: "AUTOMATION READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATIONS", body: rowsNode })
        ),
    });
};

export default definePage({
    id: "account.automation.overview",
    world: "account",
    system: "Automation",
    tab: "Overview",
    description: "Every automation with its switch and what it is doing, to see and stop them in one place.",
    keywords: ["Autobuy", "Auto buy", "Enable all", "Disable all"],
    component: OverviewPage,
});
