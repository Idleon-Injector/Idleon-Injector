/**
 * Classes › Grimoire › Automation: which Grimoire upgrades the grimoire automation buys. Switched-on upgrades are
 * bought with bones, each bone type saving and buying on its own, by the shared High / Low / Balanced rule, up to
 * each stop-at level.
 *
 * Reads readComputed("automation", "grimoire") (the bones, what each saves for, every upgrade) and saves
 * cheatConfig.automation.grimoire = { saving, items: [{ id, on, stopAt, priority }] }.
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

const CHEAT = "automation grimoire";
const BONES = ["femur", "ribcage", "cranium", "bovinae"];
const upgradeName = (name) => cleanName(name, "", { stripMarker: true });
const capital = (word) => word[0].toUpperCase() + word.slice(1);

const GrimoireAutomationPage = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    const bones = new Map(BONES.map((name) => [name, van.state({ name, owned: 0, goal: null })]));
    const upgrades = new Map(); // id -> state of the upgrade as the game last read it
    const names = new Map(); // id -> the upgrade's name, for the "Saving for" lines
    const ids = van.state([]);
    const readSaid = useSaid();

    let reads = 0; // the newest read wins; an older one that answers last is dropped
    const apply = (data) => {
        for (const upgrade of data.upgrades) {
            names.set(upgrade.id, upgradeName(upgrade.name));
            getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
        }
        for (const bone of data.bones) bones.get(bone.name).val = bone;
    };
    // After a save, worked or not, the goals and costs are read from the game again.
    const reread = async () => {
        const n = ++reads;
        try {
            const data = await readComputed("automation", "grimoire");
            if (n !== reads) return;
            apply(data);
            readSaid.clear();
        } catch (caught) {
            if (n === reads) readSaid.say("failed", `Couldn't read the bones again: ${caught.message}`);
        }
    };

    // Switching an upgrade on switches the Grimoire automation on too (now and at start), so buying starts at once.
    const picks = createAutomationPicks("grimoire", {
        saving: true,
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return setAtStart(CHEAT, true);
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
        onSaved: reread,
    });
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const { loading, error, run } = useAccountLoad({ label: "Grimoire automation" });

    const switchNode = div();
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const UpgradeRow = (id) => {
        const upgrade = getOrCreateState(upgrades, id, {});
        return PickRow({
            picks,
            id: String(id),
            name: names.get(id),
            priority: true,
            badge: () => `LV ${upgrade.val.level ?? 0}${upgrade.val.max === null ? "" : ` / ${upgrade.val.max}`}`,
            note: () => {
                const { level, max, unlocked, unlockAt, cost, bone } = upgrade.val;
                if (max !== null && level >= max) return "Max level";
                if (!unlocked) return `Unlocks at ${formatNumber(unlockAt)} total levels`;
                return `Next level ${formatNumber(cost)} ${bone}`;
            },
        });
    };

    // One line per bone type: what it owns, and what it is doing with its switched-on upgrades.
    const BoneRow = (name) => {
        const bone = bones.get(name);
        const line = () => {
            const { goal } = bone.val;
            if (goal) return `Saving for ${names.get(goal.id)} (${formatNumber(goal.cost)})`;
            const on = ids.val.some((id) => upgrades.get(id).val.bone === name && picks.get(String(id)).on.val);
            return on ? "Buying cheapest first" : "Nothing switched on";
        };
        return AccountRow({
            rowClass: "automation-currency",
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, capital(name)),
                span({ class: "account-row__sub-label" }, line)
            ),
            badge: () => `${formatNumber(bone.val.owned)} owned`,
        });
    };

    const load = () =>
        run(async () => {
            const since = picks.edits(); // a save that ends while this reads makes the read old
            const n = ++reads;
            const [data, config] = await Promise.all([readComputed("automation", "grimoire"), fetchConfig()]);
            await readSwitch();
            picks.sync(config.cheatConfig.automation.grimoire, since);
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));
            if (n === reads) apply(data);
            reconcile(data.upgrades.map(({ id }) => id).join("|"), () => data.upgrades.map(({ id }) => UpgradeRow(id)));
            ids.val = data.upgrades.map(({ id }) => id);
        });

    // Enable all runs on one click; Disable all asks "Click again" first (#25). Stop-at and priority stay.
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                await picks.setAll(
                    ids.val.map((id) => String(id)),
                    on
                );
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const switchedOn = () => ids.val.filter((id) => picks.get(String(id)).on.val).length;

    load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on upgrades are bought with bones, each bone type on its own, and switching one on turns the automation on. Each bone type saves for its cheapest High or Low upgrade (High first once affordable) and buys Balanced ones cheapest first, up to the stop-at level. Bones only drop while your Death Bringer plays; buying works on any character.",
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
                        `switch off ${switchedOn() === 1 ? "1 Grimoire upgrade" : `all ${switchedOn()} Grimoire upgrades`}.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING THE GRIMOIRE",
        errorTitle: "GRIMOIRE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: switchNode }),
            AccountSection({
                title: "BONES",
                body: div(
                    { class: "account-item-stack" },
                    Said({ said: readSaid.said, className: "said--line" }),
                    BONES.map(BoneRow),
                    SavingRow({
                        picks,
                        note: "While a bone type saves for a High or Low upgrade, Balanced upgrades may cost up to this % of it.",
                    })
                ),
            }),
            AccountSection({ title: "UPGRADES", body: listNode })
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
