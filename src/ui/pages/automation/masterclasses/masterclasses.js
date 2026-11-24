/**
 * Automation › Masterclasses: which upgrades the Grimoire, Compass, Tesseract and Royal Armory automations buy, one tab
 * each. Switched-on upgrades are bought with the class's currencies (bones, dust, tachyons, royal resources), each
 * currency saving and buying on its own by the shared rule ("Save for it", the tab's saving %), up to each stop-at.
 * The Royal Armory tab also rolls switched-on Royal Statues with parchments, the lowest level first.
 *
 * Reads readComputed("automation", tab) (the currencies, what each saves for, every upgrade; the Armory's statues and
 * parchments too) and saves cheatConfig.automation[tab] and [tab + "Saving"], and statues, each a plain list like Shops.
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
    normalCase,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationPage,
    AutomationRow,
    AutomationStats,
    PickRow,
    SAVING_DETAIL,
    SettingRow,
    automationColumns,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);
const capital = (word) => word[0].toUpperCase() + word.slice(1);
const upgradeName = (name) => cleanName(name, "", { stripMarker: true });

// One tab per masterclass: `unit` is how a cost names its currency ("15 femur"), `title` its line's name.
const TABS = [
    {
        id: "grimoire",
        label: "Grimoire",
        cheat: "automation grimoire",
        words: ["Grimoire upgrade", "Grimoire upgrades"],
        unit: (name) => name,
        title: capital,
    },
    {
        id: "compass",
        label: "Compass",
        cheat: "automation compass",
        words: ["Compass upgrade", "Compass upgrades"],
        unit: (name) => name,
        title: capital,
        hidden: "Not shown in the Compass yet",
    },
    {
        id: "tesseract",
        label: "Tesseract",
        cheat: "automation tesseract",
        words: ["Tesseract upgrade", "Tesseract upgrades"],
        unit: (name) => `${name} tachyons`,
        title: (name) => `${capital(name)} tachyons`,
    },
    {
        id: "armory",
        label: "Royal Armory",
        cheat: "automation armory",
        words: ["upgrade or statue", "upgrades and statues"],
        unit: (name) => name,
        title: (name) => name,
    },
];
const COLUMNS = automationColumns({
    values: ["Level", { name: "Next level", width: "9.5rem" }],
    save: true,
    stopAt: "Stop at level",
});
const STATUE_COLUMNS = automationColumns({ values: ["Level", "Odds"], stopAt: "Stop at level" });

const MasterclassesPage = () => {
    const activeTab = van.state(TABS[0].id);
    // Each tab shows its own automation's switch, made once the first read found it.
    const switchNodes = TABS.map(() => div());
    const tab = useAutomationTab({
        label: "Masterclass automation",
        cheats: TABS.map(({ cheat }) => cheat),
        switchColumn: COLUMNS.on,
        shownIn: switchNodes,
        read: async (saved) => {
            const reads = await Promise.all(TABS.map(({ id }) => readComputed("automation", id)));
            parts.forEach((part, i) => part.show(saved, reads[i]));
        },
    });
    const parts = TABS.map((spec, i) =>
        MasterclassPart({ spec, tab, entry: tab.entries[i], switchNode: switchNodes[i] })
    );
    const busy = () => tab.loading.val || parts.some((part) => part.bulk.busy());
    const open = () => parts[TABS.findIndex(({ id }) => id === activeTab.val)];
    // A bulk failure is said for the open tab.
    const bulkSaid = {
        get val() {
            return open().bulk.said.val;
        },
    };

    tab.load();

    return AutomationPage({
        title: "Masterclasses",
        page: "automation.masterclasses",
        description: "Buys switched-on upgrades with each class's own currency, each currency on its own.",
        total: AutomationStats(() => open().stats()),
        tabs: parts.map((part, i) => ({ ...TABS[i], columns: COLUMNS, bulk: part.bulk, body: part.body })),
        activeId: activeTab,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulkSaid), className: "said--line" }),
        what: "the masterclasses",
    });
};

/**
 * One masterclass's tab: its automation's switch, a line per currency it buys with, the saving %, then its upgrades
 * (and on the Royal Armory, its statues). `show(saved, data)` takes a read of the game.
 */
const MasterclassPart = ({ spec, tab, entry, switchNode }) => {
    const upgrades = new Map(); // id -> state of the upgrade as the game last read it
    const names = new Map(); // id -> the upgrade's name, for the "Saving for" lines
    const ids = van.state([]);
    const currencies = van.state([]); // [{ name, owned, goal }]
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);
    const currencyNode = div();
    const reconcileCurrencies = createStaticRowReconciler(currencyNode);

    // Switching an upgrade on switches the automation on too (now and at start), in the same save; after every save
    // the page reads the game again, so the currency lines follow.
    const picks = createAutomationPicks(spec.id, { cheat: spec.cheat, entry, afterSave: tab.afterSave });
    const saving = createAutomationSetting(`${spec.id}Saving`, { afterSave: tab.afterSave });
    const statues = spec.id === "armory" ? StatuesPart({ tab, entry }) : null;

    const onWith = (name) =>
        ids.val.some((id) => upgrades.get(Number(id))?.val.currency === name && picks.get(id).on.val);

    const UpgradeRow = (id) => {
        const upgrade = getOrCreateState(upgrades, id, {});
        return PickRow({
            picks,
            id: String(id),
            name: names.get(id),
            save: true,
            stopAtTitle: "Stop at level",
            bonus: () => upgrade.val.bonus ?? "",
            detail: () => {
                const { open, unlockAt } = upgrade.val;
                if (open !== false) return "";
                return unlockAt === undefined ? spec.hidden : `Unlocks at ${formatNumber(unlockAt)} total levels`;
            },
            values: [
                {
                    name: "Level",
                    text: () =>
                        `${upgrade.val.level ?? 0}${(upgrade.val.max ?? null) === null ? "" : ` / ${upgrade.val.max}`}`,
                },
                {
                    name: "Next level",
                    quiet: true,
                    text: () => {
                        const { level, max, open, cost, currency } = upgrade.val;
                        if ((max ?? null) !== null && level >= max) return "Max";
                        if (open === false) return spec.hidden ? "Hidden" : "Locked";
                        return `${costText(cost ?? 0)} ${spec.unit(currency ?? "")}`;
                    },
                },
            ],
        });
    };

    // A line per currency a switched-on upgrade buys with, while the automation runs: what it is doing.
    const CurrencyRow = (name) => {
        const line = () => {
            if (!entry.val?.on || !onWith(name)) return "";
            const goal = currencies.val.find((currency) => currency.name === name)?.goal;
            if (goal) return `Saving for ${names.get(goal.id)} (${costText(goal.cost)})`;
            return "Buying cheapest first";
        };
        return div(
            { hidden: () => !line() },
            AccountRow({
                rowClass: "automation-currency",
                info: div(
                    { class: "account-row__name-group" },
                    span({ class: "account-row__name" }, spec.title(name)),
                    span({ class: "automation-row__status", role: "status" }, line)
                ),
            })
        );
    };

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val], ...(statues ? [[statues.picks, statues.ids.val]] : [])],
        // With every row on it still has work while the automation is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(entry.val?.on) && tab.atStart(spec.cheat),
        words: spec.words,
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });

    return {
        bulk,
        // What it holds, beside the page's title while its tab is open: the Armory only the resources it buys with.
        stats: () => [
            ...currencies.val
                .filter((currency) => spec.id !== "armory" || onWith(currency.name))
                .map(({ name, owned }) => [heldText(owned), spec.unit(name)]),
            ...(statues ? statues.stats() : []),
        ],
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    switchNode,
                    currencyNode,
                    SettingRow({
                        setting: saving,
                        name: "While saving",
                        title: "% of goal",
                        detail: SAVING_DETAIL,
                        column: COLUMNS.stopAt,
                    }),
                ],
            }),
            ...(statues ? [statues.node] : []),
            COLUMNS.head("Upgrade"),
            listNode,
        ],
        show: (saved, data) => {
            picks.sync(saved[spec.id]);
            saving.sync(saved[`${spec.id}Saving`]);
            for (const upgrade of data.upgrades) {
                names.set(upgrade.id, upgradeName(upgrade.name));
                getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            }
            currencies.val = data.currencies;
            if (!switchNode.firstChild)
                switchNode.append(AutomationRow({ entry, onSwitched: tab.load, column: COLUMNS.on }));
            reconcileCurrencies(data.currencies.map(({ name }) => name).join("|"), () =>
                data.currencies.map(({ name }) => CurrencyRow(name))
            );
            reconcile(data.upgrades.map(({ id }) => id).join("|"), () => data.upgrades.map(({ id }) => UpgradeRow(id)));
            ids.val = data.upgrades.map(({ id }) => String(id));
            statues?.show(saved, data);
        },
    };
};

/** The Royal Statues, rolled with parchments: a row per statue, with its level, odds and stop-at. */
const StatuesPart = ({ tab, entry }) => {
    const statues = new Map(); // id -> state of the statue as the game last read it
    const ids = van.state([]);
    const parchments = van.state(0);
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);
    const picks = createAutomationPicks("statues", {
        cheat: "automation armory",
        entry,
        afterSave: tab.afterSave,
        item: "a statue",
    });

    const StatueRow = (id, name) => {
        const statue = getOrCreateState(statues, id, {});
        return PickRow({
            picks,
            id: String(id),
            name,
            stopAtTitle: "Stop at level",
            detail: () => (statue.val.level === 0 ? "Locked" : ""),
            values: [
                { name: "Level", text: () => String(statue.val.level ?? 0) },
                {
                    name: "Odds",
                    quiet: true,
                    text: () => (statue.val.odds ? `1 in ${formatNumber(Math.round(1 / statue.val.odds))}` : "Locked"),
                },
            ],
        });
    };

    return {
        picks,
        ids,
        stats: () => (ids.val.some((id) => picks.get(id).on.val) ? [[heldText(parchments.val), "parchments"]] : []),
        // Its own grid: statues have no "Save for it".
        node: div(
            { class: "automation-rows", style: `--value-columns: ${STATUE_COLUMNS.widths}` },
            STATUE_COLUMNS.head("Statue"),
            listNode
        ),
        show: (saved, data) => {
            picks.sync(saved.statues);
            parchments.val = data.parchments;
            for (const statue of data.statues) getOrCreateState(statues, statue.id, {}).val = statue;
            reconcile(data.statues.map(({ id }) => id).join("|"), () =>
                data.statues.map(({ id, line }) => StatueRow(id, normalCase(line.replace(/^.*千/, ""))))
            );
            ids.val = data.statues.map(({ id }) => String(id));
        },
    };
};

export default definePage({
    id: "automation.masterclasses",
    world: "automation",
    system: "Masterclasses",
    description: "Grimoire, Compass, Tesseract and Royal Armory upgrades bought with their own currencies.",
    keywords: [
        "Grimoire",
        "Compass",
        "Tesseract",
        "Royal Armory",
        "Royal Statues",
        "Deathbringer",
        "Death Bringer",
        "Wind Walker",
        "Arcane Cultist",
        "Royal Guardian",
        "Bones",
        "Dust",
        "Tachyons",
        "Parchment",
        "Autobuy",
        "Auto buy",
        "Masterclass",
        "Stop at",
        "Save for it",
    ],
    component: MasterclassesPage,
});
