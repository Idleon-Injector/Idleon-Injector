/**
 * World 3 › Construction › Automation: which buildings the construction automation builds. Empty slots take a High,
 * then Low, then Balanced building, the one closest to done first; a finished build is completed at once and paid
 * as soon as its salt is there. Buildings queued by hand are completed and paid, never removed.
 *
 * Reads readComputed("automation", "construction") (the queue and every building's row) and saves
 * cheatConfig.automation.construction, one { id, on, stopAt, priority } per building.
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
    createAutomationPicks,
    readAutomations,
    setAtStart,
    switchAutomation,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const CHEAT = "automation construction";
// The construction menu's three rows of nine.
const SECTIONS = ["BUILDINGS", "TOWERS", "SHRINES"];

const timeLeft = (hours) => {
    const minutes = Math.ceil(hours * 60);
    const days = Math.floor(minutes / 1440);
    const rest = minutes % 1440;
    if (days) return `${days}d ${Math.floor(rest / 60)}h`;
    return rest >= 60 ? `${Math.floor(rest / 60)}h ${rest % 60}m` : `${rest}m`;
};

// What the next level costs and where the building is in its build.
const buildLine = (building) => {
    if (!building.unlocked) return `Locked: build ${cleanName(building.previous)} first`;
    if (building.maxed) return "Max level";
    const parts = [`Next level ${formatNumber(building.cost)} ${cleanName(building.currency)}`];
    if (building.awaiting) parts.push("built, waiting for salt");
    else if (building.slot >= 0) {
        parts.push(`in slot ${building.slot + 1}`, `${Math.floor(building.percent)}%`);
        if (building.hoursLeft !== null) parts.push(`${timeLeft(building.hoursLeft)} left`);
    } else if (building.percent > 0) parts.push(`not in a slot, ${Math.floor(building.percent)}%`);
    return parts.join(" · ");
};

const queueLine = ({ building, slots, jelly, rate }) =>
    [
        `${building} of ${slots} slots building`,
        ...(jelly ? ["slot 8 kept free for the jelly"] : []),
        `${formatNumber(rate)} build/hr`,
    ].join(" · ");

const ConstructionAutomationTab = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    // Switching a building on switches Construction on too (now and at start), so building starts at once.
    const picks = createAutomationPicks("construction", {
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return setAtStart(CHEAT, true);
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
    });
    const ids = van.state([]);
    const queue = van.state(null);
    const buildings = new Map(); // id -> state of the game's row
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const { loading, error, run } = useAccountLoad({ label: "Construction automation" });

    const switchNode = div();
    const listNode = div({ class: "content-stack" });
    const reconcileSections = createStaticRowReconciler(listNode);

    const BuildingRow = (id, name) => {
        const building = getOrCreateState(buildings, id, null);
        return PickRow({
            picks,
            id,
            name,
            priority: true,
            badge: () => (building.val ? `LV ${building.val.level} / ${building.val.max}` : ""),
            // The panel's bonus line (none before the first level), then the build's.
            detail: () =>
                div(
                    { class: "automation-pick__detail" },
                    ...(building.val?.bonus ? [div(building.val.bonus)] : []),
                    div(building.val ? buildLine(building.val) : "")
                ),
        });
    };

    const load = () =>
        run(async () => {
            const since = picks.edits(); // a save that ends while this reads makes the read old
            const [data, config] = await Promise.all([readComputed("automation", "construction"), fetchConfig()]);
            await readSwitch();
            picks.sync(config.cheatConfig.automation.construction, since);
            if (!switchNode.firstChild && automation.val)
                switchNode.append(
                    AutomationRow({ entry: automation, onSwitched: readSwitch }),
                    AccountRow({
                        info: div(
                            { class: "account-row__name-group" },
                            span({ class: "account-row__name" }, "Build queue"),
                            span({ class: "automation-row__status" }, () => (queue.val ? queueLine(queue.val) : ""))
                        ),
                    })
                );
            queue.val = data;
            reconcileSections(data.buildings.map(({ id, name }) => `${id}:${name}`).join("|"), () =>
                SECTIONS.map((title, n) =>
                    AccountSection({
                        title,
                        body: div(
                            { class: "account-item-stack" },
                            data.buildings
                                .slice(9 * n, 9 * n + 9)
                                .map(({ id, name }) => BuildingRow(String(id), cleanName(name)))
                        ),
                    })
                )
            );
            for (const building of data.buildings)
                getOrCreateState(buildings, String(building.id), null).val = building;
            ids.val = data.buildings.map(({ id }) => String(id));
        });

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
        title: "CONSTRUCTION - AUTOMATION",
        description:
            "Switched-on buildings are built as the build button does it, and switching one on turns Construction on. An empty slot takes a High, then Low, then Balanced building, the closest to done first; a finished build is completed at once and paid once its salt is there. Buildings you queue yourself keep their slot. Leave the stop-at empty for the max.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    // With every building on it still has work while Construction itself is off: switching it on.
                    disabled: () => busy() || (switchedOn() === ids.val.length && Boolean(automation.val?.on)),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 building" : `all ${switchedOn()} buildings, towers and shrines`}.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING CONSTRUCTION",
        errorTitle: "CONSTRUCTION READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: switchNode }),
            listNode
        ),
    });
};

export default definePage({
    id: "w3.construction.automation",
    world: 3,
    system: "Construction",
    tab: "Automation",
    description: "Buildings, towers and shrines built, completed and paid with salt, each up to its stop-at.",
    keywords: ["Construction", "Automation", "Auto build", "Salt", "Stop at"],
    component: ConstructionAutomationTab,
});
