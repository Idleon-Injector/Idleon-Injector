/**
 * A clicker's Automation tab (Account › Orion, Account › Poppy): each clicker's switch, its currency with the saving
 * %, and its upgrades, each with High / Low / Balanced, a stop-at level and a switch. Locked upgrades say what unlocks
 * them and can be switched on ahead.
 *
 * Reads readComputed("automation", key) ({ money, rate, upgrades }) and saves cheatConfig.automation[key] and
 * cheatConfig.automation[`${key}Saving`].
 */

import van from "../../../vendor/van-1.6.0.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../inPlace.js";
import { BulkActionBar } from "./BulkActionBar.js";
import { cleanName, createStaticRowReconciler, getOrCreateState } from "./accountShared.js";
import {
    PRIORITY,
    PickRow,
    SettingRow,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "./automation.js";
import { AccountSection } from "./components/AccountSection.js";
import { PersistentAccountListPage } from "./components/PersistentAccountListPage.js";

const { div, span } = van.tags;

/** The words under a clicker's saving %. */
export const SAVING_DETAIL = "While it saves for a High or Low upgrade, Balanced ones may cost up to this much of it.";

// One clicker: `key` is its automation ("automation <key>"), `currency` names what it pays with.
const ClickerGroup = ({ key, currency, upgradesTitle, lockedText, entry, afterSave }) => {
    // Switching an upgrade on switches its automation on too (now and at start), in the same save.
    const picks = createAutomationPicks(key, { cheat: `automation ${key}`, entry, afterSave });
    const saving = createAutomationSetting(`${key}Saving`, { afterSave });
    const owned = van.state("");
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade
    const listNode = div({ class: "account-item-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const apply = (data, automation) => {
        picks.sync(automation[key]);
        saving.sync(automation[`${key}Saving`]);
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
                    selects: [PRIORITY],
                    stopAtTitle: "Stop at level",
                });
            })
        );
        for (const upgrade of data.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
        ids.val = data.upgrades.map(({ id }) => String(id));
    };

    return {
        key,
        picks,
        ids,
        apply,
        nodes: [
            AccountSection({
                title: currency.toUpperCase(),
                meta: span({ class: "account-row__sub-label" }, owned),
                body: SettingRow({ setting: saving, name: "Saving", title: "% of the goal", detail: SAVING_DETAIL }),
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
    const groups = [];
    const tab = useAutomationTab({
        label: `${title} automation`,
        cheats: specs.map(({ key }) => `automation ${key}`),
        read: async (automation) => {
            const data = await Promise.all(groups.map(({ key }) => readComputed("automation", key)));
            groups.forEach((group, i) => group.apply(data[i], automation));
        },
    });
    specs.forEach((spec, i) => groups.push(ClickerGroup({ ...spec, entry: tab.entries[i], afterSave: tab.afterSave })));
    const bulk = usePicksBulk({
        targets: () => groups.map(({ picks, ids }) => [picks, ids.val]),
        // With every upgrade on it still has work while an automation is off now or at start: switching it on.
        done: (on, total) =>
            on === total && specs.every(({ key }, i) => tab.entries[i].val?.on && tab.atStart(`automation ${key}`)),
        noun: (n) => (n === 1 ? "1 upgrade on this tab" : `all ${n} upgrades on this tab`),
        waiting: tab.waiting,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return PersistentAccountListPage({
        title,
        description,
        actions: BulkActionBar({
            actions: bulk.actions(busy),
            refresh: { onClick: tab.load, disabled: busy },
        }),
        topNotices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        state: { loading: tab.loading, error: tab.error },
        loadingText: `READING ${title}`,
        errorTitle: `${title} READ FAILED`,
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack" },
            AccountSection({ title: "AUTOMATION", body: tab.switches }),
            ...groups.flatMap(({ nodes }) => nodes)
        ),
    });
};
