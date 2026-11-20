/**
 * Account - Player: Wardrobe (#101, ported from VoidKitten's #2)
 *
 * Loadouts: predefined ones for the class of the character in play, and ones the player saved. Picking one shows what
 * applying it would change (gear, tools, food, cards, prayers, lab chips, obols) and which picks aren't available.
 * Apply asks "Click again" (it replaces items), then saves the plan through writeManyVerified, so it is in the change
 * log and Undo puts it back; the game works the stats out again (`wide wardrobestats`), and the food stacks get their
 * size. The plan is read again first; a game that changed since the preview shows the new one instead.
 *
 * Perfect Equipped rebuilds the gear in play the same way: its writes, the stat update, then the food stacks.
 *
 * Saved loadouts and the largest golden food stack per character are cheatConfig.wide.wardrobe, saved to
 * config.custom.js from a fresh read of the whole config, as the Pets page saves its pets.
 *
 * Reads: readComputed("wardrobe", status | preview | capture | food | perfect | perfectFood) and the config.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import {
    executeCheatAction,
    fetchConfig,
    readComputed,
    saveConfigFile,
    updateSessionConfig,
} from "../../../services/api.js";
import { currentPlace, reloadPlace } from "../../../services/changeLog.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { useWriteStatus, writeManyVerified } from "../../../components/views/account/accountShared.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span, select, option, optgroup, input, ul, li } = van.tags;

const STATS_CHEAT = "wide wardrobestats";
const MAX_SAVED = 100;
const SLOT_NAMES = {
    "Equipment & specials": [
        "Helmet",
        "Weapon",
        "Shirt",
        "Pendant",
        "Pants",
        "Ring 1",
        "Shoes",
        "Ring 2",
        "Premium hat",
        "Keychain 1",
        "Trophy",
        "Keychain 2",
        "Cape",
        "Chat ring",
        "Nametag",
        "Outfit",
    ],
    Tools: ["Pickaxe", "Hatchet", "Fishing rod", "Catching net", "Trap", "Worship skull", "DNA gun"],
};
// Items the loadout leaves as they are.
const KEPT = /^(Keep|Keep current item|Locked - unchanged)$/;
const count = (value) => Number(value).toLocaleString("en-US");

const WardrobePage = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Wardrobe" });
    const applyWrite = useWriteStatus();
    const deleteWrite = useWriteStatus();
    const saveWrite = useWriteStatus();
    const perfectWrite = useWriteStatus();
    const loadoutSaid = useSaid();
    const saveSaid = useSaid();
    const perfectSaid = useSaid(6000);
    const status = van.state(null);
    const saved = van.state([]);
    const selected = van.state("");
    const preview = van.state(null);
    const previewing = van.state(false);
    const name = van.state("");
    let goldenFood = {};

    const busy = () =>
        loading.val ||
        [applyWrite, deleteWrite, saveWrite, perfectWrite].some(({ status: state }) => state.val === "loading");
    const fitsClass = (loadout) =>
        loadout.classes?.includes(status.val?.baseClass) &&
        (loadout.characterClass === undefined || loadout.characterClass === status.val?.characterClass);
    const savedChoices = () => saved.val.filter(fitsClass);
    const savedLoadout = () => saved.val.find((loadout) => loadout.id === selected.val) ?? null;
    const choiceName = () =>
        savedLoadout()?.name ?? status.val?.presets.find((preset) => preset.id === selected.val)?.name ?? "";

    // --- The config: saved loadouts and golden food ---

    const readSaved = async () => {
        const config = await fetchConfig();
        const wardrobe = config?.cheatConfig?.wide?.wardrobe ?? {};
        saved.val = Array.isArray(wardrobe.loadouts) ? wardrobe.loadouts : [];
        goldenFood = wardrobe.goldenfood && typeof wardrobe.goldenfood === "object" ? wardrobe.goldenfood : {};
    };

    // /api/config/save rewrites config.custom.js from what it is handed, so it gets the whole config, read again
    // after the session took the change. `change(wardrobe)` gets the saved wardrobe settings as they are now.
    const persist = async (change) => {
        await readSaved();
        const wardrobe = change({ loadouts: saved.val.slice(), goldenfood: { ...goldenFood } });
        const result = await updateSessionConfig({ cheatConfig: { wide: { wardrobe } } });
        if (!result?.message) throw new Error("The injector didn't take the change");
        const config = await fetchConfig();
        if (!config?.cheatConfig) throw new Error("Could not read the config back to save it");
        await saveConfigFile({
            cheatConfig: config.cheatConfig,
            startupCheats: config.startupCheats,
            injectorConfig: config.injectorConfig,
        });
        await readSaved();
    };

    // The largest golden food stack seen for a character, so a loadout's golden food keeps that size. A larger one
    // saved meanwhile (another tab, the Config page) stays.
    const rememberGolden = (character, quantity) =>
        quantity > (Number(goldenFood[character]) || 0)
            ? persist((wardrobe) => ({
                  ...wardrobe,
                  goldenfood: {
                      ...wardrobe.goldenfood,
                      [character]: Math.max(Number(wardrobe.goldenfood[character]) || 0, quantity),
                  },
              }))
            : undefined;

    // --- The game ---

    const readStatus = async () => {
        const value = await readComputed("wardrobe", "status", [{ goldenFood }]);
        if (!value || !Array.isArray(value.presets)) throw new Error("The game didn't send the Wardrobe");
        status.val = value;
        const ids = [...value.presets, ...savedChoices()].map(({ id }) => id);
        if (!ids.includes(selected.val)) selected.val = ids[0] ?? "";
        return value;
    };

    const planFor = () =>
        readComputed("wardrobe", "preview", [{ loadout: savedLoadout() ?? selected.val, goldenFood }]);

    // A newer pick replaces the preview of an older one still on its way.
    let previewRun = 0;
    const showPreview = async () => {
        const run = ++previewRun;
        preview.val = null;
        if (!selected.val) return;
        previewing.val = true;
        try {
            const plan = await planFor();
            if (run === previewRun) preview.val = plan;
        } catch (caught) {
            if (run === previewRun) loadoutSaid.say("failed", caught.message);
        } finally {
            if (run === previewRun) previewing.val = false;
        }
    };

    const load = () =>
        runLoad(async () => {
            await readSaved();
            const value = await readStatus();
            await showPreview();
            // Not saving it doesn't stop the page; the next read tries again.
            await Promise.resolve(rememberGolden(value.character, value.foodLimits.golden)).catch((caught) =>
                loadoutSaid.say("failed", `The golden food stack size wasn't saved: ${caught.message}`)
            );
        });

    // After gear changed: the stats again, then the food stacks the game hands back, then the stats once more (golden
    // food's bonus grows with its stack).
    const updateStats = () => executeCheatAction(STATS_CHEAT);
    const saveFood = async (food) => {
        await writeManyVerified(food);
        await updateStats();
    };
    // The food step of a run whose gear landed; it refuses a character other than the one planned for.
    const foodFor = async (character, name, read) => {
        try {
            return await read();
        } catch (caught) {
            throw new Error(`${name} landed on ${character}, but its food stacks weren't set: ${caught.message}`);
        }
    };
    // After a run failed, some of its writes may have landed (Undo puts them back): the stats and the preview catch
    // up, and the failure stays what is said.
    const catchUp = async () => {
        await updateStats().catch(() => {});
        const run = ++previewRun;
        try {
            await readStatus();
            const plan = selected.val ? await planFor() : null;
            if (run === previewRun) preview.val = plan;
        } catch {
            // The failure is already said.
        } finally {
            if (run === previewRun) previewing.val = false;
        }
    };

    // --- Apply ---

    const applyQuestion = () =>
        preview.val
            ? `replace ${preview.val.character}'s gear, tools, food, cards, prayers, lab chips and obols with ${preview.val.name}.`
            : null;

    const apply = () =>
        applyWrite.run(
            async () => {
                loadoutSaid.clear();
                const shown = preview.val;
                if (!shown) return { cancelled: true };
                const plan = await planFor();
                if (plan.fingerprint !== shown.fingerprint) {
                    preview.val = plan;
                    loadoutSaid.say(
                        "refused",
                        "The game changed since this preview, so it shows the new plan. Apply again."
                    );
                    return { cancelled: true };
                }
                await writeManyVerified(plan.writes);
                await updateStats();
                const food = await foodFor(plan.character, plan.name, () =>
                    readComputed("wardrobe", "food", [
                        { goldenMaximum: plan.foodLimits.golden, character: plan.character },
                    ])
                );
                await saveFood(food.writes);
                await rememberGolden(plan.character, food.limits.golden);
                await readStatus();
                await showPreview();
                loadoutSaid.say("done", `${plan.name} is on ${plan.character}. Undo puts back what it replaced.`);
            },
            {
                onError: (caught) => {
                    loadoutSaid.say("failed", caught.message);
                    void catchUp();
                },
            }
        );

    // --- Saved loadouts ---

    const deleteSaved = () =>
        deleteWrite.run(
            async () => {
                const loadout = savedLoadout();
                if (!loadout) return { cancelled: true };
                loadoutSaid.clear();
                await persist((wardrobe) => ({
                    ...wardrobe,
                    loadouts: wardrobe.loadouts.filter(({ id }) => id !== loadout.id),
                }));
                selected.val = status.val?.presets[0]?.id ?? "";
                await showPreview();
                loadoutSaid.say("done", `Deleted ${loadout.name}.`);
            },
            { onError: (caught) => loadoutSaid.say("failed", caught.message) }
        );

    const saveCurrent = () => {
        const label = name.val.trim();
        saveSaid.clear();
        if (busy()) return;
        if (!label) return saveSaid.say("refused", "Give the loadout a name first.");
        if (label.length > 80) return saveSaid.say("refused", "A name has 80 characters at most.");
        if (saved.val.length >= MAX_SAVED)
            return saveSaid.say("refused", `${MAX_SAVED} loadouts are saved; delete one first.`);
        const typed = name.val;
        return saveWrite.run(
            async () => {
                const loadout = { ...(await readComputed("wardrobe", "capture")), name: label };
                await persist((wardrobe) => ({ ...wardrobe, loadouts: [...wardrobe.loadouts, loadout] }));
                // A name typed while it saved is the next one; it stays.
                if (name.val === typed) name.val = "";
                selected.val = loadout.id;
                await showPreview();
                saveSaid.say("done", `Saved ${label} from ${status.val.character}.`);
            },
            { onError: (caught) => saveSaid.say("failed", caught.message) }
        );
    };

    // --- Perfect Equipped ---

    const perfectEquipped = () =>
        perfectWrite.run(
            async () => {
                perfectSaid.clear();
                // The character the question named; another one in play is refused before anything is written.
                const character = status.val.character;
                const plan = await readComputed("wardrobe", "perfect", [{ character }]);
                if (!plan.writes.length) {
                    perfectSaid.say("refused", "Nothing worn can be rebuilt.");
                    return { cancelled: true };
                }
                await writeManyVerified(plan.writes);
                await updateStats();
                const food = await foodFor(character, "Perfect Equipped", () =>
                    readComputed("wardrobe", "perfectFood", [{ character }])
                );
                if (food.length) await saveFood(food);
                await readStatus();
                await showPreview();
                perfectSaid.say(
                    "done",
                    `Rebuilt ${plan.writes.length} items for ${plan.primaryStat} and raised ${food.length} food stacks; ` +
                        `skipped ${plan.skipped.length}. Undo puts the old rolls back.`
                );
            },
            {
                onError: (caught) => {
                    perfectSaid.say("failed", caught.message);
                    void catchUp();
                },
            }
        );

    // An undo of a change made here (from Undo all or History) puts old gear back: the game works the stats out again.
    const place = currentPlace();
    let undone = reloadPlace.rawVal;
    van.derive(() => {
        const target = reloadPlace.val;
        if (!target || target === undone) return;
        undone = target;
        if (target.view === place.view && target.page === place.page)
            void updateStats()
                .then(load)
                .catch((caught) =>
                    loadoutSaid.say("failed", `Undone, but the stats weren't worked out again: ${caught.message}`)
                );
    });

    // --- View ---

    const picker = select(
        {
            class: "select-base wardrobe-picker",
            "aria-label": "Loadout",
            disabled: () => loading.val || !status.val,
            onchange: (event) => {
                selected.val = event.target.value;
                loadoutSaid.clear();
                void showPreview();
            },
        },
        () =>
            optgroup(
                { label: "Predefined" },
                ...(status.val?.presets ?? []).map((preset) =>
                    option({ value: preset.id, selected: () => selected.val === preset.id }, preset.name)
                )
            ),
        () =>
            savedChoices().length
                ? optgroup(
                      { label: "Saved" },
                      ...savedChoices().map((loadout) =>
                          option({ value: loadout.id, selected: () => selected.val === loadout.id }, loadout.name)
                      )
                  )
                : optgroup({ label: "Saved", hidden: true })
    );

    // A food stack's size follows its name, quieter.
    const slotRow = (label, item, quantity) =>
        div(
            { class: "wardrobe-slot" },
            span({ class: "wardrobe-slot__label" }, label),
            span(
                { class: KEPT.test(item) ? "wardrobe-slot__item wardrobe-slot__item--kept" : "wardrobe-slot__item" },
                item,
                quantity === null || quantity === undefined
                    ? null
                    : span({ class: "wardrobe-slot__count" }, ` × ${count(quantity)}`)
            )
        );

    const group = (section) =>
        div(
            { class: "wardrobe-group" },
            div({ class: "wardrobe-group__title" }, section.title),
            section.set ? div({ class: "wardrobe-group__note" }, `Card set: ${section.set}`) : null,
            ...section.items.map((item, slot) =>
                slotRow(
                    section.labels?.[slot] ?? SLOT_NAMES[section.title]?.[slot] ?? `Slot ${slot + 1}`,
                    item,
                    section.quantities?.[slot]
                )
            )
        );

    const previewView = () => {
        const plan = preview.val;
        if (!plan)
            return div(
                { class: "wardrobe-empty" },
                previewing.val ? "Working out the loadout…" : selected.val ? "" : "No loadout fits this class."
            );
        // What changes comes first; the reasons for the picks kept as they are follow it.
        return div(
            { class: "wardrobe-plan" },
            div({ class: "wardrobe-groups" }, ...plan.sections.map(group)),
            plan.notes.length
                ? div(
                      { class: "wardrobe-notes" },
                      div({ class: "wardrobe-group__title" }, `Not available (${plan.notes.length})`),
                      ul(...plan.notes.map((note) => li(note)))
                  )
                : null
        );
    };

    const loadoutNote = () => {
        const value = status.val;
        if (!value) return "";
        return `${value.character} · ${value.baseClass} · world ${value.world} · food stacks: golden ${count(
            value.foodLimits.golden
        )}, other ${count(value.foodLimits.regular)}`;
    };

    load();

    return PersistentAccountListPage({
        title: "WARDROBE",
        description:
            "Loadouts of gear, tools, food, cards, prayers, lab chips and obols for the character in play. Applying one replaces those items; Undo puts them back.",
        wrapActions: false,
        actions: BulkActionBar({
            actions: [
                // It replaces the rolls of the gear worn, so it is a danger button that asks in place.
                {
                    label: "Perfect Equipped",
                    variant: "danger",
                    status: perfectWrite.status,
                    disabled: () => busy() || !status.val,
                    tooltip: "Rebuild the gear in play with the best stones and crafting bonuses you have",
                    confirm: () =>
                        status.val
                            ? `rebuild ${status.val.character}'s gear. The upgrades it has now are replaced.`
                            : null,
                    onClick: perfectEquipped,
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        topNotices: Said({ said: perfectSaid.said, className: "said--line" }),
        state: { loading, error },
        loadingText: "READING THE WARDROBE",
        errorTitle: "WARDROBE READ FAILED",
        body: div(
            { class: "scrollable-panel content-stack" },
            div(
                {
                    class: "wardrobe-loadout",
                    "data-change-label": () =>
                        preview.val ? `${preview.val.name} on ${preview.val.character}` : "Loadout",
                },
                AccountSection({
                    title: "LOADOUT",
                    note: loadoutNote,
                    body: [
                        div(
                            { class: "wardrobe-controls" },
                            picker,
                            // It replaces items, so it is a danger button that asks in place.
                            ActionButton({
                                label: "Apply",
                                variant: "danger",
                                status: applyWrite.status,
                                disabled: () => busy() || previewing.val || !preview.val,
                                tooltip: "Put this loadout on the character in play",
                                confirm: applyQuestion,
                                onClick: apply,
                            }),
                            () =>
                                savedLoadout()
                                    ? ActionButton({
                                          label: "Delete",
                                          variant: "danger",
                                          status: deleteWrite.status,
                                          disabled: busy,
                                          tooltip: "Delete this saved loadout",
                                          confirm: () => `delete the saved loadout ${choiceName()}.`,
                                          onClick: deleteSaved,
                                      })
                                    : span()
                        ),
                        Said({ said: loadoutSaid.said, className: "said--line" }),
                        () => previewView(),
                    ],
                })
            ),
            AccountSection({
                title: "SAVE CURRENT",
                note: () =>
                    status.val ? `What ${status.val.character} wears and uses now, as a loadout of your own.` : "",
                body: [
                    div(
                        { class: "wardrobe-controls" },
                        input({
                            class: "wardrobe-name",
                            type: "text",
                            maxlength: 80,
                            placeholder: "Loadout name",
                            "aria-label": "Loadout name",
                            value: name,
                            oninput: (event) => (name.val = event.target.value),
                            onkeydown: (event) => {
                                if (event.key === "Enter") void saveCurrent();
                            },
                        }),
                        // Adds: a quiet button (DESIGN.md).
                        ActionButton({
                            label: "Save",
                            variant: "quiet",
                            status: saveWrite.status,
                            disabled: () => busy() || !status.val,
                            tooltip: "Save what the character in play wears and uses as a loadout",
                            onClick: saveCurrent,
                        })
                    ),
                    Said({ said: saveSaid.said, className: "said--line" }),
                ],
            })
        ),
    });
};

export default definePage({
    id: "account.wardrobe",
    world: "account",
    system: "Player",
    tab: "Wardrobe",
    description: "Loadouts of gear, tools, food, cards, prayers, chips and obols, and Perfect Equipped.",
    keywords: ["Wardrobe", "Loadouts", "Perfect Equipped", "Equipment", "Gear", "perfectequipped"],
    component: WardrobePage,
});
