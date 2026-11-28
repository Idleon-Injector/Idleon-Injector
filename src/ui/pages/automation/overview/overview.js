/**
 * Automation › Overview, the section's home: every automation declared with a label, with its switch and what it is
 * doing, so everything running can be seen and stopped in one place. A new system shows here by declaring its
 * automation; this page needs no edit. Each one's own page says what it buys.
 *
 * One list in the shared panel (ListPanel), its tray holding Enable all | Disable all like every automation page's.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage, whenShown } from "../../../menu/menuModel.js";
import { fetchConfig } from "../../../services/api.js";
import { Said, announce, useSaid } from "../../../components/inPlace.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { createStaticRowReconciler, useWriteStatus } from "../../../components/views/account/accountShared.js";
import {
    AutomationRow,
    inTurn,
    readAutomations,
    readWhileRunning,
    showAutomation,
    useStillWaiting,
    switchAll,
} from "../../../components/views/account/automation.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";

const { div } = van.tags;

const PAGE_ID = "automation.overview";
const noun = (n) => (n === 1 ? "automation" : "automations");

const OverviewPage = () => {
    const entries = new Map(); // cheat -> state of its entry
    const list = van.state([]);
    const read = van.state(false); // the list has been read once
    const { loading, error, run } = useAccountLoad({ label: "Automation" });
    // The page's line says when a read or a bulk switch is still waiting for the game: a wait isn't a failure.
    const waiting = useStillWaiting();
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const rowsNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(rowsNode);

    // The page's read, as a step: it reads after every switch asked for before it.
    const readList = async () => {
        const [automations, { startupCheats = [] }] = await Promise.all([readAutomations(), fetchConfig()]);
        for (const automation of automations) {
            if (!entries.has(automation.cheat)) entries.set(automation.cheat, van.state(automation));
            else showAutomation(entries.get(automation.cheat), automation);
        }
        list.val = automations.map((automation) => ({
            ...automation,
            atStart: startupCheats.includes(automation.cheat),
        }));
        read.val = true;
        reconcile(automations.map(({ cheat }) => cheat).join("|"), () =>
            automations.map(({ cheat }) => AutomationRow({ entry: entries.get(cheat), onSwitched: load }))
        );
        error.val = null; // this read, the newest to run, worked: an older one's failure goes
    };
    const load = () => run(() => inTurn(readList, waiting.onLate));

    // For the tools: off now or at start (a startup save that failed, say) still needs the switch. One that can't
    // start at launch (Sushi) is never wanted at start.
    // Each row's state as it shows now (a click shows at once, before its read), so a switch flipped while Disable all
    // asks changes what the answer stops, and the tray asks again (#323 review).
    const behind = (on) =>
        list.val.filter(
            (automation) =>
                (entries.get(automation.cheat)?.val?.on ?? automation.on) !== on ||
                automation.atStart !== (on && automation.startup)
        );
    // Which automations a tool switches is decided when its step runs; the list is read back after it, so each row
    // shows what runs, and a failure is said on the page's line, as on every automation page.
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                try {
                    await switchAll(on, (cheat) => entries.get(cheat), waiting.onLate);
                } finally {
                    await load();
                }
            },
            { onSuccess: () => bulkSaid.clear(), onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const running = () => behind(false).map(({ cheat }) => cheat);

    // Enable all runs on one press; Disable all asks in the tray first.
    const tools = (ask) => {
        const disableAll = ActionButton({
            label: "Disable all",
            variant: "danger",
            status: bulk.status,
            disabled: () => busy() || !running().length,
            onClick: (e) => {
                e.preventDefault();
                const question = () => {
                    const n = running().length;
                    ask({
                        question: `Disable ${n} ${noun(n)}, now and at start?`,
                        confirmLabel: n === 1 ? "Disable it" : "Disable them",
                        from: disableAll,
                        // A switch flipped while the question is open changes what the answer stops: it asks again.
                        lowers: running,
                        again: question,
                        // The answer isn't the Disable all button, so the outcome is said for screen readers here.
                        onConfirm: () =>
                            setAll(false).then(({ ok }) => announce(`Disable all: ${ok ? "done" : "failed"}`)),
                    });
                };
                question();
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Enable all",
                status: bulk.status,
                disabled: () => busy() || !behind(true).length,
                onClick: (e) => {
                    e.preventDefault();
                    return setAll(true);
                },
            }),
            disableAll
        );
    };

    load();
    // Shown again (back from a system's own page, which may have switched its automation since): read again.
    whenShown(PAGE_ID, load);
    // While one runs, the statuses follow the game; a failed read is said as the page's read error until one works.
    readWhileRunning({
        nodes: [rowsNode],
        running: () => list.val.some(({ on }) => on),
        busy,
        read: () => readList().catch((caught) => (error.val = caught.message)),
    });

    return PersistentAccountListPage({
        // The Automation section's measure, so its pages line up when switching between them.
        rootClass: "tab-container scroll-container automation-page",
        title: "Overview",
        description:
            "Does what you'd do by hand, with your own resources. A switch turns one on now and at every start.",
        actions: RefreshButton({ onRefresh: load, disabled: busy }),
        // Above the body, so it shows during the first load too.
        topNotices: Said({ said: waiting.over(bulkSaid.said), className: "said--line" }),
        state: { loading, error },
        loadingText: "Reading automations",
        errorTitle: "Couldn't read automations",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            ListPanel({
                className: "automation-list",
                body: rowsNode,
                // ponytail: the tools act on every automation, also while the top bar searches the page; switchAll
                // takes no list of cheats yet (a shared change in automation.js).
                tools: (_, ask) => tools(ask),
                toolsLabel: () => `All ${list.val.length} ${noun(list.val.length)}`,
                empty: () => (read.val && !list.val.length ? "No automations yet" : null),
            })
        ),
    });
};

export default definePage({
    id: "automation.overview",
    world: "automation",
    system: "Overview",
    description: "Every automation with its switch and what it is doing, to see and stop them in one place.",
    keywords: ["Automation", "Autobuy", "Auto buy", "Enable all", "Disable all"],
    component: OverviewPage,
});
