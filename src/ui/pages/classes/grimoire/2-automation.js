/**
 * Classes › Grimoire › Automation: which Grimoire upgrades the grimoire automation buys. Switched-on upgrades are
 * bought with bones, each bone type saving and buying on its own, by the shared rule ("Save for it", saving %), up
 * to each stop-at level.
 *
 * Reads readComputed("automation", "grimoire") (the bones, what each saves for, every upgrade) and saves
 * cheatConfig.automation.grimoire, one { id, on, stopAt, save } per upgrade, and grimoireSaving.
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

const CHEAT = "automation grimoire";
const BONES = ["femur", "ribcage", "cranium", "bovinae"];
const upgradeName = (name) => cleanName(name, "", { stripMarker: true });
const capital = (word) => word[0].toUpperCase() + word.slice(1);
const COLUMNS = automationColumns({
    values: ["Level", { name: "Next level", width: "7.5rem" }],
    save: true,
    stopAt: "Stop at level",
});

const GrimoireAutomationPage = () => {
    const bones = new Map(BONES.map((name) => [name, van.state({ name, owned: 0, goal: null })]));
    const upgrades = new Map(); // id -> state of the upgrade as the game last read it
    const names = new Map(); // id -> the upgrade's name, for the "Saving for" lines
    const ids = van.state([]);
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);

    const UpgradeRow = (id) => {
        const upgrade = getOrCreateState(upgrades, id, {});
        return PickRow({
            picks,
            id: String(id),
            name: names.get(id),
            save: true,
            stopAtTitle: "Stop at level",
            bonus: () => upgrade.val.bonus ?? "",
            detail: () =>
                upgrade.val.unlocked === false ? `Unlocks at ${formatNumber(upgrade.val.unlockAt)} total levels` : "",
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
                        const { level, max, unlocked, cost, bone } = upgrade.val;
                        if ((max ?? null) !== null && level >= max) return "Max";
                        if (unlocked === false) return "Locked";
                        return `${costText(cost ?? 0)} ${bone ?? ""}`;
                    },
                },
            ],
        });
    };

    const tab = useAutomationTab({
        label: "Grimoire automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
        read: async (automation) => {
            const data = await readComputed("automation", "grimoire");
            picks.sync(automation.grimoire);
            saving.sync(automation.grimoireSaving);
            for (const upgrade of data.upgrades) {
                names.set(upgrade.id, upgradeName(upgrade.name));
                getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
            }
            for (const bone of data.bones) bones.get(bone.name).val = bone;
            reconcile(data.upgrades.map(({ id }) => id).join("|"), () => data.upgrades.map(({ id }) => UpgradeRow(id)));
            ids.val = data.upgrades.map(({ id }) => String(id));
        },
    });
    const [automation] = tab.entries;
    // Switching an upgrade on switches the Grimoire automation on too (now and at start), in the same save; after
    // every save the tab reads the game again, so the bone lines follow.
    const picks = createAutomationPicks("grimoire", { cheat: CHEAT, entry: automation, afterSave: tab.afterSave });
    const saving = createAutomationSetting("grimoireSaving", { afterSave: tab.afterSave });

    // One line per bone type while the automation runs: what it is doing. What each owns sits beside the title.
    const BoneRow = (name) => {
        const bone = bones.get(name);
        const line = () => {
            if (!automation.val?.on) return "";
            const { goal } = bone.val;
            if (goal) return `Saving for ${names.get(goal.id)} (${costText(goal.cost)})`;
            const on = ids.val.some((id) => upgrades.get(Number(id))?.val.bone === name && picks.get(id).on.val);
            return on ? "Buying cheapest first" : "Nothing switched on";
        };
        return div(
            { hidden: () => !line() },
            AccountRow({
                rowClass: "automation-currency",
                info: div(
                    { class: "account-row__name-group" },
                    span({ class: "account-row__name" }, capital(name)),
                    span({ class: "automation-row__status", role: "status" }, line)
                ),
            })
        );
    };

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while the automation is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: ["Grimoire upgrade", "Grimoire upgrades"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return AutomationPage({
        description: "Buys switched-on upgrades with bones, each bone type on its own.",
        total: AutomationStats(() => BONES.map((name) => [heldText(bones.get(name).val.owned), name])),
        columns: COLUMNS,
        bulk,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "the Grimoire",
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    tab.switches,
                    ...BONES.map(BoneRow),
                    SettingRow({
                        setting: saving,
                        name: "While saving",
                        title: "% of goal",
                        detail: SAVING_DETAIL,
                        column: COLUMNS.stopAt,
                    }),
                ],
            }),
            COLUMNS.head("Upgrade"),
            listNode,
        ],
    });
};

export default definePage({
    id: "classes.grimoire.automation",
    world: "classes",
    system: "Grimoire",
    tab: "Automation",
    description: "Grimoire upgrades bought with bones, each bone type on its own, up to each stop-at level.",
    keywords: [
        "Deathbringer",
        "Death Bringer",
        "Autobuy",
        "Auto buy",
        "Masterclass",
        "Stop at",
        "Save for it",
        "Priority",
    ],
    component: GrimoireAutomationPage,
});
