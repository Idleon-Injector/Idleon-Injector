/**
 * Account - Player: Wardrobe (#101, ported from VoidKitten's #2)
 *
 * Loadouts: predefined ones for the class of the character in play, and ones the player saved. Picking one shows what
 * applying it would change (gear, tools, food, cards, prayers, lab chips, obols) and which picks aren't available.
 * Equip asks in the tray (it replaces items), then saves the plan through writeManyVerified, so it is in the change
 * log and Undo puts it back; the game works the stats out again (`wide wardrobestats`), and the food stacks get their
 * size. The plan is read again first; a game that changed since the preview shows the new one instead.
 *
 * Perfect Equipped rebuilds the gear in play the same way: its writes, the stat update, then the food stacks.
 *
 * Saved loadouts and the largest golden food stack per character are cheatConfig.wide.wardrobe, saved to
 * config.custom.js and the session from a fresh read, as the Pets page saves its pets.
 *
 * Reads: readComputed("wardrobe", status | preview | capture | food | perfect | perfectFood) and the config.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { executeCheatAction, fetchConfig, readComputed, saveConfigPart } from "../../../services/api.js";
import { currentPlace, reloadPlace } from "../../../services/changeLog.js";
import { useSaid } from "../../../components/inPlace.js";
import { saveFailureReason } from "../../../components/views/account/autoSave.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { useWriteStatus, writeManyVerified } from "../../../components/views/account/accountShared.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span, input } = van.tags;

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
// A tool whose failure the page says itself on the tray's line (its `onError`): the tray doesn't keep it as that tool's
// failure too, which would cover what another tool says next.
const sayingItsOwn = (write) => ({
    ...write,
    run: (task, { onError } = {}) =>
        write.run(async () => {
            try {
                return await task();
            } catch (caught) {
                onError?.(caught);
                return { cancelled: true };
            }
        }),
});

const WardrobePage = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Wardrobe" });
    const applyWrite = sayingItsOwn(useWriteStatus());
    const deleteWrite = sayingItsOwn(useWriteStatus());
    const saveWrite = sayingItsOwn(useWriteStatus());
    const perfectWrite = sayingItsOwn(useWriteStatus());
    // What the last press did, or why it couldn't, said on the tray's one line: the newest says it.
    const traySaid = useSaid(6000);
    const loadoutSaid = traySaid;
    const saveSaid = traySaid;
    const perfectSaid = traySaid;
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

    const wardrobeOf = (config) => {
        const wardrobe = config?.cheatConfig?.wide?.wardrobe ?? {};
        return {
            loadouts: Array.isArray(wardrobe.loadouts) ? wardrobe.loadouts : [],
            goldenfood: wardrobe.goldenfood && typeof wardrobe.goldenfood === "object" ? wardrobe.goldenfood : {},
        };
    };
    const readSaved = async (read = fetchConfig()) => {
        ({ loadouts: saved.val, goldenfood: goldenFood } = wardrobeOf(await read));
    };

    // `change(wardrobe)` gets the saved wardrobe settings as they are now and returns them changed; only they are sent.
    // ponytail: read-then-write; the menu's saves run one at a time, but another browser tab's save landing between this
    // read and this save is still lost (the server has no compare-and-set).
    const persist = async (change) => {
        try {
            const { result, config } = await saveConfigPart((now) => ({
                cheatConfig: { wide: { wardrobe: change(wardrobeOf(now)) } },
            }));
            // The game holds the whole config: the next read would take its old wardrobe back, and a save after it
            // would write that to the file.
            if (result.message.includes("kept its old settings")) throw new Error(result.message);
            await readSaved(config);
        } catch (caught) {
            await readSaved().catch(() => {});
            throw caught;
        }
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

    // An undo of a change made here (from Undo all or History) puts old gear back. useAccountLoad loads the page again
    // after it, and that load first has the game work the stats out again, so it reads them as they are now.
    const place = currentPlace();
    let undone = reloadPlace.rawVal;
    const load = () =>
        runLoad(async () => {
            // A load is newer than every preview and recheck before it: an Equip whose recheck read the game before
            // this load (a reload after an undo) doesn't write that plan, though the load hasn't read anything yet.
            previewRun++;
            const target = reloadPlace.rawVal;
            if (target && target !== undone) {
                undone = target;
                if (target.view === place.view && target.page === place.page)
                    await updateStats().catch((caught) =>
                        loadoutSaid.say("failed", `Undone, but the stats weren't worked out again: ${caught.message}`)
                    );
            }
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
    // Each save names the character it was planned for: the game writes nothing if another one is in play by then.
    // The food save comes after the gear landed, so its failure says so.
    const saveFood = async (food, character, name) => {
        await foodFor(character, name, () => writeManyVerified(food, { character }));
        await updateStats();
    };
    // The food step (its read or its save) of a run whose gear landed; it refuses a character other than the one
    // planned for.
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

    // --- Equip ---

    // The character and loadout of a run whose gear landed and whose food step hasn't finished yet.
    let unfinishedFood = null;
    const apply = () =>
        applyWrite.run(
            async () => {
                loadoutSaid.clear();
                const shown = preview.val;
                if (!shown) return { cancelled: true };
                const asked = selected.val;
                const run = previewRun;
                const plan = await planFor();
                // A loadout picked meanwhile isn't the one asked about: Equip stops quietly, and its preview stays.
                if (selected.val !== asked) return { cancelled: true };
                // A preview started during the recheck (a reload after an undo, say) is newer than it: the recheck may
                // have read the game before that change, though its plan matches the one shown.
                if (run !== previewRun || plan.fingerprint !== shown.fingerprint) {
                    // A newer preview of this loadout (a reload after an undo, say) shows its own plan; one that failed
                    // keeps its reason said.
                    if (run === previewRun) preview.val = plan;
                    else if (!preview.val && !previewing.val) return { cancelled: true };
                    loadoutSaid.say("refused", "The game changed. This is the new plan; equip again.");
                    return { cancelled: true };
                }
                // A run whose gear landed but whose food stacks weren't set: this Equip finishes them, though the
                // gear matches now.
                const thisRun = `${plan.character}\n${asked}`;
                if (!plan.writes.length && unfinishedFood !== thisRun) {
                    loadoutSaid.say("done", `${plan.character} already wears ${plan.name}. Nothing changed.`);
                    return { cancelled: true };
                }
                if (plan.writes.length) await writeManyVerified(plan.writes, { character: plan.character });
                unfinishedFood = thisRun;
                await updateStats();
                const food = await foodFor(plan.character, plan.name, () =>
                    readComputed("wardrobe", "food", [
                        { goldenMaximum: plan.foodLimits.golden, character: plan.character },
                    ])
                );
                await saveFood(food.writes, plan.character, plan.name);
                unfinishedFood = null;
                await rememberGolden(plan.character, food.limits.golden);
                await readStatus();
                await showPreview();
                loadoutSaid.say("done", `Equipped ${plan.name} on ${plan.character}.`);
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

    // A save whose file save failed may still be in the session's list (another tab's list kept it): Save pressed again
    // with that name replaces that entry, by its id, so the file gets one copy. Two loadouts may share a name, so only
    // that attempt's entry is replaced.
    let unsaved = null;
    const saveCurrent = () => {
        const label = name.val.trim();
        saveSaid.clear();
        if (busy()) return;
        if (!label) return saveSaid.say("refused", "Give the loadout a name first.");
        if (label.length > 80) return saveSaid.say("refused", "A name has 80 characters at most.");
        const typed = name.val;
        return saveWrite.run(
            async () => {
                const loadout = { ...(await readComputed("wardrobe", "capture")), name: label };
                if (unsaved?.label === label) loadout.id = unsaved.id;
                // Counted again on the list just read: another tab may have saved meanwhile.
                const full = `${MAX_SAVED} loadouts saved. Delete one first.`;
                try {
                    await persist((wardrobe) => {
                        const loadouts = wardrobe.loadouts.some(({ id }) => id === loadout.id)
                            ? wardrobe.loadouts.map((entry) => (entry.id === loadout.id ? loadout : entry))
                            : [...wardrobe.loadouts, loadout];
                        if (loadouts.length > MAX_SAVED) throw Object.assign(new Error(full), { full: true });
                        return { ...wardrobe, loadouts };
                    });
                    unsaved = null;
                } catch (caught) {
                    if (!caught.full) {
                        unsaved = { label, id: loadout.id };
                        throw caught;
                    }
                    saveSaid.say("refused", full);
                    return { cancelled: true };
                }
                // A name typed while it saved is the next one; it stays.
                if (name.val === typed) name.val = "";
                selected.val = loadout.id;
                await showPreview();
                saveSaid.say("done", `Added ${label}.`);
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
                await writeManyVerified(plan.writes, { character });
                await updateStats();
                const food = await foodFor(character, "Perfect Equipped", () =>
                    readComputed("wardrobe", "perfectFood", [{ character }])
                );
                if (food.length) await saveFood(food, character, "Perfect Equipped");
                await readStatus();
                await showPreview();
                perfectSaid.say(
                    "done",
                    `Rebuilt ${plan.writes.length} items for ${plan.primaryStat}, raised ${food.length} food stacks, ` +
                        `skipped ${plan.skipped.length}.`
                );
            },
            {
                onError: (caught) => {
                    perfectSaid.say("failed", caught.message);
                    void catchUp();
                },
            }
        );

    // --- View ---

    // The loadout, picked on the line under the title like a character: the class's own first, then the player's
    // ("Yours" under each).
    const choices = () => [
        ...(status.val?.presets ?? []).map((preset) => ({ id: preset.id, label: preset.name })),
        ...savedChoices().map((loadout) => ({ id: loadout.id, label: loadout.name, note: "Yours" })),
    ];
    const loadoutPick = PickInPlace({
        name: "Loadout",
        opener: () => choiceName() || "None",
        options: choices,
        picked: () => selected.val,
        onPick: (id) => {
            selected.val = id;
            loadoutSaid.clear();
            void showPreview();
        },
        search: true,
        disabled: () => loading.val || !status.val,
        openerClass: "character-picker__opener",
        panelClass: "character-picker__list",
    });
    loadoutPick.panel.tabIndex = -1;
    const inPlayLine = () => {
        const value = status.val;
        return value ? `${value.character} · ${value.baseClass} · World ${value.world}` : "";
    };
    const loadoutPicker = div(
        {
            class: "character-picker",
            onfocusout: (e) => {
                if (loadoutPick.isOpen() && !loadoutPicker.contains(e.relatedTarget)) loadoutPick.close();
            },
        },
        div(
            { class: "character-picker__line" },
            span({ class: "character-picker__label" }, "Loadout"),
            loadoutPick.opener,
            span({ class: "character-picker__info" }, inPlayLine)
        ),
        loadoutPick.panel
    );

    // A slot and what the loadout puts there; one it leaves as it is is muted. A food stack's size follows its name.
    const slotRow = (label, item, quantity) =>
        AccountRow({
            rowClass: "wardrobe-slot",
            info: span({ class: "account-row__name" }, label),
            controls: span(
                { class: KEPT.test(item) ? "wardrobe-slot__item wardrobe-slot__item--kept" : "wardrobe-slot__item" },
                KEPT.test(item) ? "Kept" : item,
                quantity === null || quantity === undefined
                    ? null
                    : span({ class: "wardrobe-slot__count" }, ` × ${count(quantity)}`)
            ),
        });

    const group = (section) =>
        AccountSection({
            title: section.title,
            // The food's stacks, as the game lets them grow for the character in play.
            note: section.set
                ? `Card set: ${section.set}`
                : section.title === "Food" && status.val
                  ? `Stacks: golden ${count(status.val.foodLimits.golden)}, other ${count(status.val.foodLimits.regular)}`
                  : null,
            body: section.items.map((item, slot) =>
                slotRow(
                    section.labels?.[slot] ?? SLOT_NAMES[section.title]?.[slot] ?? `Slot ${slot + 1}`,
                    item,
                    section.quantities?.[slot]
                )
            ),
        });

    // What the loadout changes, in the game's groups; then the picks it can't make, and why.
    const planView = () => {
        const plan = preview.val;
        if (!plan)
            return div(
                { class: "wardrobe-empty" },
                previewing.val
                    ? "Working out the loadout…"
                    : selected.val
                      ? "Nothing to show for this loadout."
                      : "No loadout fits this class."
            );
        return div(
            ...plan.sections.map(group),
            plan.notes.length
                ? AccountSection({
                      title: "Not available",
                      body: plan.notes.map((note) =>
                          AccountRow({ rowClass: "wardrobe-note", info: span({ class: "account-row__note" }, note) })
                      ),
                  })
                : null
        );
    };

    // The tray's line: what the last press did or why it couldn't, else what Equip would change.
    const trayLine = () => {
        const said = traySaid.said.val;
        // A failure in words: the game keeping its old value isn't said as the write's own message.
        if (said?.kind === "failed") {
            const reason = saveFailureReason(said.text);
            return `${reason.charAt(0).toUpperCase()}${reason.slice(1)}`;
        }
        if (said) return said.text;
        const plan = preview.val;
        if (!plan) return status.val ? `Loadouts for ${status.val.character}` : "";
        if (!plan.writes.length) return `${plan.character} already wears ${plan.name}`;
        return `${plan.name} changes ${plan.changes} slot${plan.changes === 1 ? "" : "s"} on ${plan.character}`;
    };

    const tools = (_, ask) => [
        // Equip replaces items, Delete takes a saved loadout away, Perfect equipped replaces the rolls of the gear
        // worn: each asks in the tray first.
        div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Equip",
                status: applyWrite.status,
                disabled: () => busy() || previewing.val || !preview.val,
                onClick: (e) => {
                    e.preventDefault();
                    const from = e.currentTarget;
                    const askEquip = () => {
                        const plan = preview.val;
                        if (!plan) return undefined;
                        // Nothing would be replaced: Equip says so without asking.
                        if (!plan.writes.length) return apply();
                        return ask({
                            question: `Equip ${plan.name} on ${plan.character}? Gear, tools, food, cards, prayers, chips and obols are replaced.`,
                            confirmLabel: "Equip it",
                            from,
                            // Two saved loadouts can share a name: the question is about this one's plan.
                            lowers: () => [selected.val, preview.val?.fingerprint],
                            again: askEquip,
                            onConfirm: apply,
                        });
                    };
                    askEquip();
                },
            }),
            // Only a loadout of the player's own can be deleted.
            () =>
                savedLoadout()
                    ? ActionButton({
                          label: "Delete",
                          variant: "danger",
                          status: deleteWrite.status,
                          disabled: busy,
                          onClick: (e) => {
                              e.preventDefault();
                              const from = e.currentTarget;
                              const askDelete = () =>
                                  ask({
                                      question: `Delete your loadout ${choiceName()}?`,
                                      confirmLabel: "Delete it",
                                      from,
                                      lowers: () => [selected.val],
                                      again: askDelete,
                                      onConfirm: deleteSaved,
                                  });
                              askDelete();
                          },
                      })
                    : span({ hidden: true })
        ),
        div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Perfect equipped",
                variant: "danger",
                status: perfectWrite.status,
                disabled: () => busy() || !status.val,
                onClick: (e) => {
                    e.preventDefault();
                    const from = e.currentTarget;
                    const askRebuild = () =>
                        ask({
                            question: `Rebuild ${status.val.character}'s worn gear? Its upgrades now are replaced.`,
                            confirmLabel: "Rebuild it",
                            from,
                            lowers: () => [status.val?.character],
                            again: askRebuild,
                            onConfirm: perfectEquipped,
                        });
                    askRebuild();
                },
            })
        ),
        // What the character in play wears now, as a loadout of the player's own, named in the tray.
        div(
            { class: "account-setall-row wardrobe-add" },
            input({
                class: "wardrobe-name",
                type: "text",
                maxlength: 80,
                placeholder: "Loadout name",
                "aria-label": "Loadout name",
                "data-name-field": "",
                value: name,
                oninput: (event) => (name.val = event.target.value),
                onkeydown: (event) => {
                    if (event.key === "Enter") void saveCurrent();
                },
            }),
            ActionButton({
                label: "Add loadout",
                status: saveWrite.status,
                disabled: () => busy() || !status.val,
                onClick: (e) => {
                    e.preventDefault();
                    return saveCurrent();
                },
            })
        ),
    ];

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Wardrobe",
        description: "Loadouts of gear, tools, food, cards, prayers, chips and obols for the character in play.",
        actions: RefreshButton({ onRefresh: load, disabled: busy }),
        toolbar: loadoutPicker,
        state: { loading, error },
        loadingText: "Reading the wardrobe",
        errorTitle: "Couldn't read the wardrobe",
        initialWrapperClass: "account-list",
        body: div(
            {
                class: "account-list account-list--tabbed wardrobe-loadout",
                "data-change-label": () =>
                    preview.val ? `${preview.val.name} on ${preview.val.character}` : "Loadout",
            },
            ListPanel({ body: div(() => planView()), tools, toolsLabel: trayLine })
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
