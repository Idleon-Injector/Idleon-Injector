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
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    PRIORITY,
    PickRow,
    createAutomationPicks,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);

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
    const parts = [`Next level ${costText(building.cost)} ${cleanName(building.currency)}`];
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
    const ids = van.state([]);
    const queue = van.state(null);
    const buildings = new Map(); // id -> state of the game's row
    const listNode = div({ class: "content-stack" });
    const reconcileSections = createStaticRowReconciler(listNode);

    const BuildingRow = (id, name) => {
        const building = getOrCreateState(buildings, id, null);
        return PickRow({
            picks,
            id,
            name,
            selects: [PRIORITY],
            stopAtTitle: "Stop at level",
            badge: () => (building.val ? `LV ${building.val.level} / ${building.val.max}` : ""),
            // The panel's bonus line (none before the first level), then the build's.
            detail: [
                span({ hidden: () => !building.val?.bonus }, () => building.val?.bonus ?? ""),
                span(() => (building.val ? buildLine(building.val) : "")),
            ],
        });
    };

    const tab = useAutomationTab({
        label: "Construction automation",
        cheats: [CHEAT],
        read: async (automation) => {
            const data = await readComputed("automation", "construction");
            picks.sync(automation.construction);
            queue.val = data;
            for (const building of data.buildings)
                getOrCreateState(buildings, String(building.id), null).val = building;
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
            ids.val = data.buildings.map(({ id }) => String(id));
        },
    });
    const [automation] = tab.entries;
    // Switching a building on switches Construction on too (now and at start), in the same save; after every save the
    // tab reads the game again, so the queue and build lines follow.
    const picks = createAutomationPicks("construction", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every building on it still has work while Construction is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        noun: (n) => (n === 1 ? "1 building" : `all ${n} buildings, towers and shrines`),
        waiting: tab.waiting,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return PersistentAccountListPage({
        title: "CONSTRUCTION - AUTOMATION",
        description:
            "Switched-on buildings are built as the build button does it, and switching one on turns Construction on. An empty slot takes a High, then Low, then Balanced building, the closest to done first; a finished build is completed at once and paid once its salt is there. Buildings you queue yourself keep their slot. Leave the stop-at empty for the max.",
        actions: BulkActionBar({ actions: bulk.actions(busy), refresh: { onClick: tab.load, disabled: busy } }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "READING CONSTRUCTION",
        errorTitle: "CONSTRUCTION READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({
                title: "AUTOMATION",
                body: [
                    tab.switches,
                    AccountRow({
                        info: div(
                            { class: "account-row__name-group" },
                            span({ class: "account-row__name" }, "Build queue"),
                            span({ class: "automation-row__status" }, () => (queue.val ? queueLine(queue.val) : ""))
                        ),
                    }),
                ],
            }),
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
