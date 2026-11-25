/**
 * Automation › Sushi Station: Auto Play and Sort on the in-game sushi board, with Auto Play's settings. Knowledge XP
 * isn't automation (it adds XP from nothing), so it stays on Sushi Station's own Tools page.
 */
import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { executeCheatAction, fetchConfig, saveConfigPart } from "../../../services/api.js";
import { AccountTabHeader } from "../../../components/views/account/components/AccountTabHeader.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
const { div, label, input, p, h3, span } = van.tags;

function SushiAutomation() {
    const enabled = van.state(false);
    const state = van.state({});
    const pending = van.state(false);
    const settingsLoaded = van.state(false);
    const settings = {
        tier: van.state(""),
        targetCount: van.state(""),
        targetTier: van.state(""),
        reserveSlots: van.state(""),
        extendChain: van.state(false),
        higherTier: van.state(false),
        ingameButtons: van.state(false),
    };
    const feedback = van.state("");
    let actions = 0; // counts refreshes and clicks, so a status poll that started before one doesn't undo it
    async function refresh() {
        actions++;
        pending.val = true;
        settingsLoaded.val = false;
        try {
            // A settings save running now holds the player's settings, and this read may come back from before it.
            const keepSettings = settingsSaving();
            const config = await fetchConfig();
            if (!keepSettings && !settingsSaving()) {
                const saved = remember(config);
                for (const [key, value] of Object.entries(settings)) value.val = saved[key];
            }
            state.val = await command("status");
            settingsLoaded.val = true;
            enabled.val = state.val.enabled;
            feedback.val = "";
        } catch (error) {
            feedback.val = error.message;
        } finally {
            pending.val = false;
        }
    }
    // The settings as they'd be saved; throws a short reason for a value that can't be.
    const readDraft = () => {
        const draft = Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value.val]));
        const ranges = {
            tier: ["purchase tier", 1, state.val.maxPurchaseTier],
            targetTier: ["target tier", 1, state.val.maxTier + 1],
            targetCount: ["target quantity", 1, 120],
            reserveSlots: ["empty slots", 0, 119],
        };
        for (const [key, [name, min, max]] of Object.entries(ranges)) {
            const value = Number(draft[key]);
            if (String(draft[key]).trim() === "" || !Number.isInteger(value) || value < min || value > max)
                throw new Error(`${name}: ${min} to ${max}`);
            draft[key] = value;
        }
        // The board's unlocked slots, once the status has read the board.
        const slots = state.val.working && state.val.working.length + state.val.reserved.length;
        if (slots && draft.reserveSlots >= slots) throw new Error(`empty slots: ${slots - 1} at most on this board`);
        if (slots && draft.targetCount > slots - draft.reserveSlots)
            throw new Error(`target quantity: ${slots - draft.reserveSlots} at most on this board`);
        return draft;
    };
    let savedDraft = null;
    // The settings as the config holds them, remembered as what is saved.
    const remember = (config) => {
        const saved = config.cheatConfig.w7.sushitools;
        savedDraft = JSON.stringify(Object.fromEntries(Object.keys(settings).map((key) => [key, saved[key]])));
        return saved;
    };
    async function saveSettings(draft = readDraft()) {
        const { result, config } = await saveConfigPart(() => ({ cheatConfig: { w7: { sushitools: draft } } }));
        remember(config);
        if (result.message.includes("kept its old settings"))
            throw new Error("saved, but the running game kept its old settings");
    }
    // The settings save on Enter, on leaving the section, or when a toggle changes.
    const settingsSave = useAutoSave({
        prepare: () => {
            if (!settingsLoaded.val || enabled.val) return { unchanged: true };
            const draft = readDraft();
            return JSON.stringify(draft) === savedDraft ? { unchanged: true } : { write: () => saveSettings(draft) };
        },
        revert: () => {
            if (!savedDraft) return;
            const saved = JSON.parse(savedDraft);
            for (const [key, value] of Object.entries(settings)) value.val = saved[key];
        },
    });
    const settingsSaving = () => settingsSave.isBusy() || settingsSave.status.val === "loading";
    async function command(action) {
        const response = await executeCheatAction("w7 sushitools" + (action ? " " + action : ""));
        // An answer that isn't the game's JSON is said plainly, never as the parser's words.
        try {
            return JSON.parse(response.message);
        } catch {
            throw new Error("Couldn't read Sushi. Try again.");
        }
    }
    async function run(action) {
        actions++;
        pending.val = true;
        try {
            if (action === "" && !enabled.val) await saveSettings();
            const result = await command(action);
            enabled.val = result.enabled;
            state.val = { ...state.val, error: null };
            feedback.val = result.message;
        } catch (error) {
            feedback.val = error.message;
        } finally {
            pending.val = false;
        }
    }
    // "Show in-game buttons" saves one at a time, each saving the switch as it is then, so the last choice wins.
    let buttonsSave = Promise.resolve();
    const locked = () => enabled.val || pending.val || !settingsLoaded.val;
    // Settings fields stay usable while they save, so a save never takes their focus away.
    const settingsLocked = () => enabled.val || !settingsLoaded.val;
    const numberField = (title, value, min = 1) =>
        label(
            { class: "sushi-setting" },
            span({ class: "sushi-setting__title" }, title),
            input({
                "aria-label": title,
                type: "number",
                min,
                step: 1,
                value,
                disabled: settingsLocked,
                oninput: (e) => {
                    value.val = e.target.value;
                },
            })
        );
    const toggle = (title, value, save = () => settingsSave.save()) =>
        label(
            { class: "toggle-switch sushi-toggle" },
            input({
                type: "checkbox",
                role: "switch",
                checked: value,
                disabled: settingsLocked,
                onchange: (e) => {
                    value.val = e.target.checked;
                    void save();
                },
            }),
            span({ class: "slider", "aria-hidden": "true" }),
            span({ class: "label" }, title)
        );
    const controls = div(
        { class: "scrollable-panel", "aria-busy": () => pending.val },
        div(
            { class: "sushi-tools-layout" },
            AccountSection({
                title: "AUTOMATION SETTINGS",
                rootClass: "sushi-automation-controls",
                body: [
                    div(
                        {
                            class: () => `content-stack ${saveStateClass(settingsSave.status.val, settingsSave.undo)}`,
                            ...settingsSave.handlers,
                        },
                        div(
                            { class: "sushi-settings-section" },
                            h3("PURCHASE"),
                            div({ class: "sushi-settings-grid" }, numberField("Purchase tier", settings.tier))
                        ),
                        div(
                            { class: "sushi-settings-section" },
                            h3("GOAL & BOARD"),
                            div(
                                { class: "sushi-settings-grid" },
                                numberField("Target tier", settings.targetTier),
                                numberField("Target quantity", settings.targetCount),
                                numberField("Empty slots", settings.reserveSlots, 0)
                            )
                        ),
                        div(
                            { class: "sushi-settings-section" },
                            h3("EAST WIND"),
                            div(
                                { class: "account-item-stack" },
                                toggle("Extended East Wind chain", settings.extendChain),
                                toggle("Higher East Wind tier limit", settings.higherTier)
                            )
                        )
                    ),
                    div(
                        { class: "sushi-automation-footer" },
                        p({ class: "sushi-setting__help" }, "Changes save as you make them. Auto Play saves them too."),
                        SaveState({ ...settingsSave, className: "save-state--inline" })
                    ),
                ],
            }),
            div(
                { class: "content-stack" },
                AccountSection({
                    title: "AUTOMATION",
                    rootClass: "sushi-automation-controls",
                    body: [
                        AccountRow({
                            info: "Target",
                            badge: () => `${settings.targetCount.val || "…"} × tier ${settings.targetTier.val || "…"}+`,
                        }),
                        p({ class: "sushi-setting__help" }, "Idles at the goal. Disable and enable to run again."),
                        div(
                            { class: "account-item-stack" },
                            ActionButton({
                                label: () => (enabled.val ? "Disable Auto Play" : "Enable Auto Play"),
                                // The page's one blue button; turning it off is the danger kind.
                                variant: () => (enabled.val ? "danger" : "main"),
                                disabled: () => pending.val || (!enabled.val && !settingsLoaded.val),
                                onClick: () => run(""),
                            }),
                            ActionButton({ label: "Sort", disabled: locked, onClick: () => run("sort") })
                        ),
                        // Saved on its own, so a board setting that can't be saved doesn't hold it back.
                        toggle(
                            "Show in-game buttons",
                            settings.ingameButtons,
                            () =>
                                (buttonsSave = buttonsSave.then(() =>
                                    settingsSave.run(() => saveSettings({ ingameButtons: settings.ingameButtons.val }))
                                ))
                        ),
                        div(
                            { class: "sushi-automation-info" },
                            p({ role: "status", "aria-live": "polite", class: "sushi-automation-status" }, () =>
                                pending.val
                                    ? "Working…"
                                    : feedback.val || state.val.error || state.val.message || "Connecting…"
                            )
                        ),
                    ],
                })
            )
        )
    );
    const root = div(
        { class: "tab-container" },
        AccountTabHeader({
            title: "Sushi Station",
            description: "Keep the in-game Sushi board open in sushi-move mode for Sort and Auto Play.",
            actions: RefreshButton({ onRefresh: refresh, disabled: () => pending.val }),
        }),
        controls
    );
    refresh();
    // Follow Auto Play started, stopped or progressing elsewhere (the in-game buttons) while this tab is on screen.
    let polling = false;
    let pollFailed = false;
    setInterval(async () => {
        if (polling || pending.val || !settingsLoaded.val || root.offsetParent === null || document.hidden) return;
        polling = true;
        const started = actions;
        try {
            const status = await command("status");
            if (started !== actions) return; // a click's own answer is newer
            if (pollFailed || status.message !== state.val.message || status.enabled !== enabled.val) feedback.val = "";
            pollFailed = false;
            state.val = status;
            enabled.val = status.enabled;
        } catch (error) {
            if (started !== actions) return;
            pollFailed = true;
            feedback.val = error.message;
        } finally {
            polling = false;
        }
    }, 2000);
    return root;
}

export default definePage({
    id: "automation.sushi",
    world: "automation",
    system: "Sushi Station",
    description: "Sort and Auto Play for the in-game sushi board.",
    keywords: ["Sushi", "Auto Play", "Sort", "Sushi tools", "Tools"],
    component: SushiAutomation,
});
