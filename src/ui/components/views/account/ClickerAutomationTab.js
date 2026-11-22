/**
 * A clicker's tab on Account › Clickers › Automation (Orion, Poppy): each clicker's switch and how much it may spend
 * while saving, then its upgrades, each with what it does (the game's own line), its level, next cost, a stop-at level,
 * "Save for it" and a switch. Locked upgrades say what unlocks them and can be switched on ahead.
 *
 * Reads readComputed("automation", key) ({ money, rate, upgrades }) and saves cheatConfig.automation[key] and
 * cheatConfig.automation[`${key}Saving`].
 */

import van from "../../../vendor/van-1.6.0.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../inPlace.js";
import { cleanName, createStaticRowReconciler, getOrCreateState } from "./accountShared.js";
import {
    PickRow,
    SAVING_DETAIL,
    SettingRow,
    automationColumns,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "./automation.js";
import { AccountSection } from "./components/AccountSection.js";

const { div } = van.tags;

export const CLICKER_COLUMNS = automationColumns({
    values: ["Level", "Next level"],
    save: true,
    stopAt: "Stop at level",
});

// One clicker: `key` is its automation ("automation <key>"), `currency` names what it pays with.
const ClickerGroup = ({ key, currency, lockedText, entry, afterSave }) => {
    // Switching an upgrade on switches its automation on too (now and at start), in the same save.
    const picks = createAutomationPicks(key, { cheat: `automation ${key}`, entry, afterSave });
    const saving = createAutomationSetting(`${key}Saving`, { afterSave });
    const data = van.state(null); // the game's read: { money, rate, upgrades }
    const ids = van.state([]);
    const upgrades = new Map(); // id -> state of the game's upgrade
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);

    const apply = (read, automation) => {
        picks.sync(automation[key]);
        saving.sync(automation[`${key}Saving`]);
        reconcile(read.upgrades.map(({ id, name }) => `${id}:${name}`).join("|"), () =>
            read.upgrades.map(({ id, name }) => {
                const upgrade = getOrCreateState(upgrades, id, {});
                return PickRow({
                    picks,
                    id: String(id),
                    name: cleanName(name),
                    bonus: () => upgrade.val.bonus ?? "",
                    detail: () => (upgrade.val.unlocked === false ? lockedText(upgrade.val) : ""),
                    values: [
                        { name: "Level", text: () => formatNumber(upgrade.val.level ?? 0) },
                        {
                            name: "Next level",
                            quiet: true,
                            text: () =>
                                upgrade.val.unlocked === false
                                    ? "Locked"
                                    : formatNumber(Math.ceil(upgrade.val.cost ?? 0)),
                        },
                    ],
                    save: true,
                    stopAtTitle: "Stop at level",
                });
            })
        );
        for (const upgrade of read.upgrades) getOrCreateState(upgrades, upgrade.id, {}).val = upgrade;
        ids.val = read.upgrades.map(({ id }) => String(id));
        data.val = read;
    };

    return { key, currency, picks, saving, ids, data, apply, listNode };
};

/**
 * One clicker's tab for the Automation page's TabbedList: `groups` are its automations, as { key, name, currency,
 * lockedText(upgrade) }; `words` names one and many of their upgrades for the tray. Enable all and Disable all cover
 * every upgrade on the tab; Disable all asks in the tray first. Returns the tab ({ id, label, columns, bulk, body }) with
 * what the page shows of it: `stats()` beside the title, `description`, `state`, `load`, `busy` and `notices`.
 */
export const useClickerAutomation = ({ id, label, description, words, groups: specs }) => {
    const groups = [];
    const tab = useAutomationTab({
        label: `${label} automation`,
        cheats: specs.map(({ key }) => `automation ${key}`),
        switchColumn: CLICKER_COLUMNS.on,
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
        words,
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const several = groups.length > 1;

    tab.load();

    return {
        id,
        label,
        description,
        columns: CLICKER_COLUMNS,
        bulk,
        stats: () =>
            groups.flatMap(({ data, currency }) =>
                data.val
                    ? [
                          [formatNumber(data.val.money), currency],
                          ...(data.val.rate === null ? [] : [[formatNumber(data.val.rate), "per second"]]),
                      ]
                    : []
            ),
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy: () => tab.loading.val || bulk.busy(),
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    tab.switches,
                    ...groups.map(({ saving, currency }) =>
                        SettingRow({
                            setting: saving,
                            name: several ? `While saving ${currency}` : "While saving",
                            title: "% of goal",
                            detail: SAVING_DETAIL,
                            column: CLICKER_COLUMNS.stopAt,
                        })
                    ),
                ],
            }),
            CLICKER_COLUMNS.head("Upgrade"),
            ...groups.map(({ listNode }, i) =>
                several ? AccountSection({ title: specs[i].name, body: listNode }) : listNode
            ),
        ],
    };
};
