/**
 * Classes - Grimoire (Death Bringer)
 *
 * One page, the Grimoire's screens as its tabs: Upgrades, Bones, and the Grimoire automation last.
 *
 * Data sources:
 *   gga.Grimoire[n]                - Grimoire upgrade n's level (cList.GrimoireUpg: [0] name, [4] max level, 999999 for
 *                                    none, [9] its line; "Ripped Page" rows are pages still to come)
 *   gga.DNSM.h.GrimoireTotLV       - the game's sum of the levels, emptied after a save so the game counts again
 *   gga.OptionsListAccount[329-333] - bones: collected in all, Femur, Ribcage, Cranium, Bovinae
 *   gga.OptionsListAccount[367]    - AFK Bones unlocked (1)
 *   readComputed("automation", "grimoire") and cheatConfig.automation.grimoire / grimoireSaving - the automation
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga, readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { MasterclassPage, UpgradesPart } from "../../../components/views/account/masterclassParts.js";
import {
    AutomationStats,
    PickRow,
    SAVING_DETAIL,
    SettingRow,
    automationColumns,
    automationPart,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    toNum,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// The game counts the levels again once its sum is gone.
const forgetTotal = () => deleteGga("DNSM.h.GrimoireTotLV");

// ---- Upgrades ----------------------------------------------------------------------------------------------------

const UpgradesTab = ({ pending, reload }) =>
    UpgradesPart({
        levelsPath: "Grimoire",
        definitions: "GrimoireUpg",
        words: ["upgrade", "upgrades"],
        afterSave: forgetTotal,
        afterBulk: forgetTotal,
        pending,
        reload,
    });

// ---- Bones -------------------------------------------------------------------------------------------------------

const BONES = [
    { key: "femur", name: "Femur", index: 330 },
    { key: "ribcage", name: "Ribcage", index: 331 },
    { key: "cranium", name: "Cranium", index: 332 },
    { key: "bovinae", name: "Bovinae", index: 333 },
    { key: "total", name: "Bones collected", index: 329 },
];
const AFK_BONES = "OptionsListAccount[367]";

const BonesTab = () => {
    const list = NumberList();
    const afk = van.state(0);
    const afkRow = AccountToggleRow({
        info: span({ class: "account-row__name" }, "AFK Bones"),
        words: ["Unlocked", ""],
        name: "AFK Bones",
        checked: () => afk.val === 1,
        write: async (on) => {
            await writeVerified(AFK_BONES, on ? 1 : 0);
            afk.val = on ? 1 : 0;
        },
    });
    return {
        content: div({ class: "field-columns" }, list.node, afkRow),
        load: async () => {
            const [values, rawAfk] = await Promise.all([
                Promise.all(BONES.map((bone) => gga(`OptionsListAccount[${bone.index}]`))),
                gga(AFK_BONES),
            ]);
            list.show(
                BONES.map((bone, i) => ({
                    key: bone.key,
                    name: bone.name,
                    path: `OptionsListAccount[${bone.index}]`,
                    value: toNum(values[i], 0),
                }))
            );
            afk.val = toNum(rawAfk, 0) ? 1 : 0;
        },
    };
};

// ---- Automation --------------------------------------------------------------------------------------------------

// Like the game's own panels, small amounts show whole: a cost rounded up, what is held rounded down.
const costText = (value) => formatNumber(value < 1000 ? Math.ceil(value) : value);
const heldText = (value) => formatNumber(value < 1000 ? Math.floor(value) : value);

const CHEAT = "automation grimoire";
const BONE_KINDS = ["femur", "ribcage", "cranium", "bovinae"];
const capital = (word) => word[0].toUpperCase() + word.slice(1);
const COLUMNS = automationColumns({
    values: ["Level", { name: "Next level", width: "7.5rem" }],
    save: true,
    stopAt: "Stop at level",
});

// Which Grimoire upgrades the automation buys with bones, each bone type saving and buying on its own, by the shared
// rule ("Save for it", saving %), each up to its stop-at.
const AutomationTab = () => {
    const bones = new Map(BONE_KINDS.map((name) => [name, van.state({ name, owned: 0, goal: null })]));
    const upgrades = new Map(); // id -> the upgrade as the game last read it
    const names = new Map(); // id -> its name, for the "Saving for" lines
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
                names.set(upgrade.id, cleanName(upgrade.name, "", { stripMarker: true }));
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

    // One line per bone type while the automation runs: what it is doing. What each holds sits beside the title.
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

    return automationPart({
        tab,
        columns: COLUMNS,
        bulk,
        total: AutomationStats(() => BONE_KINDS.map((name) => [heldText(bones.get(name).val.owned), name])),
        said: tab.waiting.over(bulk.said),
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    tab.switches,
                    ...BONE_KINDS.map(BoneRow),
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

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "upgrades", label: "Upgrades", part: UpgradesTab, keywords: ["Wraith", "Grimoire upgrades"] },
    { id: "bones", label: "Bones", part: BonesTab, keywords: ["Bone currency", "Femur", "Ribcage", "Cranium"] },
    {
        id: "automation",
        label: "Automation",
        part: AutomationTab,
        keywords: ["Autobuy", "Auto buy", "Stop at", "Save for it", "Priority"],
    },
];

export default definePage({
    id: "classes.grimoire",
    world: "classes",
    system: "Grimoire",
    description: "The Death Bringer's Grimoire upgrades and bones.",
    keywords: ["Deathbringer", "Death Bringer", "Masterclass"],
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: () =>
        MasterclassPage({
            name: "Grimoire",
            page: "classes.grimoire",
            description: "The Death Bringer's Grimoire upgrades and bones.",
            tabs: TABS,
        }),
});
