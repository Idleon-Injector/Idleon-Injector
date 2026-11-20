/**
 * A clicker's Automation tab (World 1 › Owl, World 2 › Kangaroo): each clicker's switch, its currency with the saving
 * %, and its upgrades, each with a stop-at level, High / Low / Balanced and a switch. Locked upgrades say what unlocks
 * them and can be switched on ahead.
 *
 * Reads readComputed("automation", key) ({ money, rate, upgrades }) and saves cheatConfig.automation[key] and
 * cheatConfig.automation[`${key}Saving`].
 */

import van from "../../../vendor/van-1.6.0.js";
import { fetchConfig, readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said, useSaid } from "../../inPlace.js";
import { BulkActionBar } from "./BulkActionBar.js";
import { useAccountLoad } from "./accountLoadPolicy.js";
import { cleanName, createStaticRowReconciler, getOrCreateState, useWriteStatus } from "./accountShared.js";
import {
    AutomationRow,
    PickRow,
    SavingRow,
    createAutomationPicks,
    readAutomations,
    setAtStart,
    switchAutomation,
} from "./automation.js";
import { AccountSection } from "./components/AccountSection.js";
import { PersistentAccountListPage } from "./components/PersistentAccountListPage.js";

const { div, span } = van.tags;

/** One clicker: `key` is its automation ("automation <key>"), `currency` names what it pays with. */
const ClickerGroup = ({ key, currency, upgradesTitle, lockedText }) => {
    const cheat = `automation ${key}`;
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find((entry) => entry.cheat === cheat) ?? null;
    };
    // Switching an upgrade on switches its automation on too (now and at start), so buying starts at once.
    const picks = createAutomationPicks(key, {
        savingKey: `${key}Saving`,
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return setAtStart(cheat, true);
            await switchAutomation(cheat, true);
            await readSwitch();
        },
    });
    const owned = van.state("");
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade
    const switchNode = div();
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const apply = (data, config, since) => {
        picks.sync(config.automation[key], since, config.automation[`${key}Saving`] ?? null);
        if (!switchNode.firstChild && automation.val)
            switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));
        owned.val =
            `${formatNumber(data.money)} ${currency}` +
            (data.rate === null ? "" : ` · ${formatNumber(data.rate)} per second`);
        reconcile(data.upgrades.map(({ id, name }) => `${id}:${name}`).join("|"), () =>
            data.upgrades.map(({ id, name }) => {
                const upgrade = getOrCreateState(upgrades, id, {});
                return PickRow({
                    picks,
                    id: String(id),
                    name: cleanName(name),
                    badge: () => `LV ${upgrade.val.level ?? 0}`,
                    detail: () =>
                        upgrade.val.unlocked
                            ? `Next level ${formatNumber(Math.ceil(upgrade.val.cost))} ${currency}`
                            : lockedText(upgrade.val),
                    withPriority: true,
                });
            })
        );
        for (const upgrade of data.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
        ids.val = data.upgrades.map(({ id }) => String(id));
    };

    return {
        key,
        automation,
        picks,
        ids,
        readSwitch,
        apply,
        switchNode,
        nodes: [
            AccountSection({
                title: currency.toUpperCase(),
                meta: span({ class: "account-row__sub-label" }, owned),
                body: SavingRow({ picks }),
            }),
            AccountSection({ title: upgradesTitle, body: listNode }),
        ],
    };
};

/**
 * The tab: `groups` are the clickers on the page, as { key, currency, upgradesTitle, lockedText(upgrade) }.
 * Enable all and Disable all cover every upgrade on the tab; Disable all asks "Click again" first.
 */
export const ClickerAutomationTab = ({ title, description, groups: specs }) => {
    const groups = specs.map(ClickerGroup);
    const { loading, error, run } = useAccountLoad({ label: `${title} automation` });
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();

    let reads = 0; // a read that a newer one overtook (Refresh twice, say) is dropped
    const load = () =>
        run(async () => {
            const read = ++reads;
            const since = groups.map(({ picks }) => picks.edits()); // a save that ends while this reads makes it old
            const [{ cheatConfig }, ...data] = await Promise.all([
                fetchConfig(),
                ...groups.map(({ key }) => readComputed("automation", key)),
            ]);
            await Promise.all(groups.map(({ readSwitch }) => readSwitch()));
            if (read !== reads) return;
            groups.forEach((group, i) => group.apply(data[i], cheatConfig, since[i]));
        });

    const all = () => groups.flatMap(({ picks, ids }) => ids.val.map((id) => picks.get(id)));
    const switchedOn = () => all().filter((item) => item.on.val).length;
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                for (const { picks, ids } of groups) await picks.setAll(ids.val, on);
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    // With every upgrade on it still has work while an automation itself is off: switching it on.
    const allRunning = () => groups.every(({ automation }) => automation.val?.on);

    load();

    return PersistentAccountListPage({
        title,
        description,
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    disabled: () => busy() || (switchedOn() === all().length && allRunning()),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 upgrade" : `all ${switchedOn()} upgrades`} on this tab.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: `READING ${title}`,
        errorTitle: `${title} READ FAILED`,
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({ title: "AUTOMATION", body: groups.map(({ switchNode }) => switchNode) }),
            ...groups.flatMap(({ nodes }) => nodes)
        ),
    });
};
