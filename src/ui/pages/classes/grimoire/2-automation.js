/**
 * Classes › Grimoire › Automation: which Grimoire upgrades the grimoire automation buys. Switched-on upgrades are
 * bought with bones, each bone type saving and buying on its own, by the shared High / Low / Balanced rule, up to
 * each stop-at level.
 *
 * Reads readComputed("automation", "grimoire") (the bones, what each saves for, every upgrade) and saves
 * cheatConfig.automation.grimoire, one { id, on, stopAt, priority } per upgrade, and grimoireSaving.
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
    SettingRow,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation grimoire";
const BONES = ["femur", "ribcage", "cranium", "bovinae"];
const upgradeName = (name) => cleanName(name, "", { stripMarker: true });
const capital = (word) => word[0].toUpperCase() + word.slice(1);

const GrimoireAutomationPage = () => {
    const bones = new Map(BONES.map((name) => [name, van.state({ name, owned: 0, goal: null })]));
    const upgrades = new Map(); // id -> state of the upgrade as the game last read it
    const names = new Map(); // id -> the upgrade's name, for the "Saving for" lines
    const ids = van.state([]);
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const UpgradeRow = (id) => {
        const upgrade = getOrCreateState(upgrades, id, {});
        return PickRow({
            picks,
            id: String(id),
            name: names.get(id),
            selects: [PRIORITY],
            stopAtTitle: "Stop at level",
            badge: () => `Lv ${upgrade.val.level ?? 0}${upgrade.val.max === null ? "" : ` / ${upgrade.val.max}`}`,
            detail: () => {
                const { level, max, unlocked, unlockAt, cost, bone } = upgrade.val;
                if (max !== null && level >= max) return "Max level";
                if (!unlocked) return `Unlocks at ${formatNumber(unlockAt)} total levels`;
                return `Next level ${costText(cost)} ${bone}`;
            },
        });
    };

    const tab = useAutomationTab({
        label: "Grimoire automation",
        cheats: [CHEAT],
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

    // One line per bone type: what it owns, and, while the automation runs, what it is doing.
    const BoneRow = (name) => {
        const bone = bones.get(name);
        const line = () => {
            if (!automation.val?.on) return "";
            const { goal } = bone.val;
            if (goal) return `Saving for ${names.get(goal.id)} (${costText(goal.cost)})`;
            const on = ids.val.some((id) => upgrades.get(Number(id))?.val.bone === name && picks.get(id).on.val);
            return on ? "Buying cheapest first" : "Nothing switched on";
        };
        return AccountRow({
            rowClass: "automation-currency",
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, capital(name)),
                span({ class: "account-row__sub-label" }, line)
            ),
            badge: () => `${heldText(bone.val.owned)} owned`,
        });
    };

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every upgrade on it still has work while the automation is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        noun: (n) => (n === 1 ? "1 Grimoire upgrade" : `all ${n} Grimoire upgrades`),
        waiting: tab.waiting,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return PersistentAccountListPage({
        title: "Automation",
        description:
            "Switched-on upgrades are bought with bones, each bone type on its own, and switching one on turns the automation on. Each bone type saves for its cheapest High or Low upgrade (High first once affordable) and buys Balanced ones cheapest first, up to the stop-at level. Bones only drop while your Death Bringer plays; buying works on any character.",
        actions: BulkActionBar({ actions: bulk.actions(busy), refresh: { onClick: tab.load, disabled: busy } }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: "Reading the Grimoire",
        errorTitle: "Grimoire read failed",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({ title: "Automation", body: tab.switches }),
            AccountSection({
                title: "Bones",
                body: div(
                    { class: "account-item-stack" },
                    BONES.map(BoneRow),
                    SettingRow({
                        setting: saving,
                        name: "Saving",
                        title: "% of the goal",
                        detail: "While a bone type saves for a High or Low upgrade, Balanced upgrades may cost up to this much of it.",
                    })
                ),
            }),
            AccountSection({ title: "Upgrades", body: listNode })
        ),
    });
};

export default definePage({
    id: "classes.grimoire.automation",
    world: "classes",
    system: "Grimoire",
    tab: "Automation",
    description: "Grimoire upgrades bought with bones, each bone type on its own, up to each stop-at level.",
    keywords: ["Deathbringer", "Death Bringer", "Autobuy", "Auto buy", "Masterclass", "Stop at"],
    component: GrimoireAutomationPage,
});
