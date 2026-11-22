/**
 * World 3 › Construction › Automation: which buildings the construction automation builds. Empty slots take a
 * saved-for building first, then the rest, the one closest to done first; a finished build is completed at once and
 * paid as soon as its salt is there. Buildings queued by hand are completed and paid, never removed.
 *
 * Reads readComputed("automation", "construction") (the queue and every building's row) and saves
 * cheatConfig.automation.construction, one { id, on, stopAt, save } per building.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationPage,
    AutomationStats,
    PickRow,
    automationColumns,
    createAutomationPicks,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);

const CHEAT = "automation construction";
// The construction menu's three rows of nine.
const SECTIONS = ["Buildings", "Towers", "Shrines"];
const COLUMNS = automationColumns({ values: ["Level", "Next level"], save: true, stopAt: "Stop at level" });

const timeLeft = (hours) => {
    const minutes = Math.ceil(hours * 60);
    const days = Math.floor(minutes / 1440);
    const rest = minutes % 1440;
    if (days) return `${days}d ${Math.floor(rest / 60)}h`;
    return rest >= 60 ? `${Math.floor(rest / 60)}h ${rest % 60}m` : `${rest}m`;
};

// What the next level is paid with and where the building is in its build.
const buildLine = (building) => {
    if (!building.unlocked) return `Build ${cleanName(building.previous)} first`;
    if (building.maxed) return "";
    const parts = [`Paid with ${cleanName(building.currency)}`];
    if (building.awaiting) parts.push("built, waiting for salt");
    else if (building.slot >= 0) {
        parts.push(`in slot ${building.slot + 1}`, `${Math.floor(building.percent)}%`);
        if (building.hoursLeft !== null) parts.push(`${timeLeft(building.hoursLeft)} left`);
    } else if (building.percent > 0) parts.push(`not in a slot, ${Math.floor(building.percent)}%`);
    return parts.join(" · ");
};

// The queue, beside the title: [amount, words] pairs for AutomationStats.
const queueStats = ({ building, slots, jelly, rate }) => [
    [`${building} of ${slots}`, "slots building"],
    ...(jelly ? [["Slot 8", "kept for the jelly"]] : []),
    [formatNumber(rate), "build/hr"],
];

const ConstructionAutomationTab = () => {
    const ids = van.state([]);
    const queue = van.state(null);
    const buildings = new Map(); // id -> state of the game's row
    const listNode = div();
    const reconcileSections = createStaticRowReconciler(listNode);

    const BuildingRow = (id, name) => {
        const building = getOrCreateState(buildings, id, null);
        return PickRow({
            picks,
            id,
            name,
            save: true,
            stopAtTitle: "Stop at level",
            values: [
                { name: "Level", text: () => (building.val ? `${building.val.level} / ${building.val.max}` : "") },
                {
                    name: "Next level",
                    quiet: true,
                    text: () => {
                        if (!building.val) return "";
                        if (!building.val.unlocked) return "Locked";
                        return building.val.maxed ? "Max" : costText(building.val.cost);
                    },
                },
            ],
            // The panel's bonus line (none before the first level) leads; the build's goes under the name.
            bonus: () => building.val?.bonus ?? "",
            detail: [
                span({ hidden: () => !building.val || !buildLine(building.val) }, () =>
                    building.val ? buildLine(building.val) : ""
                ),
            ],
        });
    };

    const tab = useAutomationTab({
        label: "Construction automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
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
                        body: data.buildings
                            .slice(9 * n, 9 * n + 9)
                            .map(({ id, name }) => BuildingRow(String(id), cleanName(name))),
                    })
                )
            );
            ids.val = data.buildings.map(({ id }) => String(id));
        },
    });
    const [automation] = tab.entries;
    // Switching a building on switches Construction on too (now and at start), in the same save; after every save the
    // tab reads the game again, so the queue and build lines follow.
    const picks = createAutomationPicks("construction", {
        cheat: CHEAT,
        entry: automation,
        afterSave: tab.afterSave,
        item: "a building",
    });

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every building on it still has work while Construction is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: ["building", "buildings"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return AutomationPage({
        description: "Builds switched-on buildings in free slots, then completes and pays them.",
        total: AutomationStats(() => (queue.val ? queueStats(queue.val) : [])),
        columns: COLUMNS,
        bulk,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "construction",
        body: [AccountSection({ title: "Settings", body: tab.switches }), COLUMNS.head("Building"), listNode],
    });
};

export default definePage({
    id: "w3.construction.automation",
    world: 3,
    system: "Construction",
    tab: "Automation",
    description: "Buildings, towers and shrines built, completed and paid with salt, each up to its stop-at.",
    keywords: ["Construction", "Automation", "Auto build", "Salt", "Stop at", "Save for it", "Priority"],
    component: ConstructionAutomationTab,
});
