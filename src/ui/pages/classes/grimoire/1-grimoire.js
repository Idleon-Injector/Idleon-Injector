/**
 * Classes - Grimoire (Death Bringer)
 *
 * One page, the Grimoire's screens as its tabs: Upgrades and Bones. The Grimoire automation is in the Automation
 * section (automation/grimoire), linked beside the title.
 *
 * Data sources:
 *   gga.Grimoire[n]                - Grimoire upgrade n's level (cList.GrimoireUpg: [0] name, [4] max level, 999999 for
 *                                    none, [9] its line; "Ripped Page" rows are pages still to come)
 *   gga.DNSM.h.GrimoireTotLV       - the game's sum of the levels, emptied after a save so the game counts again
 *   gga.OptionsListAccount[329-333] - bones: collected in all, Femur, Ribcage, Cranium, Bovinae
 *   gga.OptionsListAccount[367]    - AFK Bones unlocked (1)
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { deleteGga, gga } from "../../../services/api.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { NumberList } from "../../../components/views/account/components/NumberList.js";
import { MasterclassPage, UpgradesPart } from "../../../components/views/account/masterclassParts.js";
import { toNum, writeVerified } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// The game counts the levels again once its sum is gone.
const forgetTotal = () => deleteGga("DNSM.h.GrimoireTotLV");

// ---- Upgrades ----------------------------------------------------------------------------------------------------

const UpgradesTab = ({ pending, reload, bulk }) =>
    UpgradesPart({
        levelsPath: "Grimoire",
        definitions: "GrimoireUpg",
        words: ["upgrade", "upgrades"],
        afterSave: forgetTotal,
        afterBulk: forgetTotal,
        pending,
        reload,
        bulk,
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

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    { id: "upgrades", label: "Upgrades", part: UpgradesTab, keywords: ["Wraith", "Grimoire upgrades"] },
    { id: "bones", label: "Bones", part: BonesTab, keywords: ["Bone currency", "Femur", "Ribcage", "Cranium"] },
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
            automation: { page: "automation.grimoire" },
        }),
});
