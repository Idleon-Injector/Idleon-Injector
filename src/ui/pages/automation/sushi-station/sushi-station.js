/**
 * Automation › Sushi Station: Auto Play and Sort on the in-game sushi board, with Auto Play's settings. Knowledge XP
 * isn't automation (it adds XP from nothing), so it stays on Sushi Station's own Tools page.
 *
 * The automation pages' look (AutomationPage's parts): the page's buttons by the title (Auto Play, Sort, Refresh), then
 * one list whose Settings group holds Auto Play's line (what it is doing) and its settings, each saved on its own: a
 * number on Enter or on leaving its field, a switch on flip.
 */
import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { executeCheatAction, fetchConfig, saveConfigPart } from "../../../services/api.js";
import { NumberInput } from "../../../components/NumberInput.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { announce } from "../../../components/inPlace.js";
import { joinClasses } from "../../../components/views/account/accountShared.js";
const { div, label, input, span } = van.tags;

// The numbers Auto Play needs, with their names in a reason and their lowest value; the highest comes from the board.
const NUMBERS = {
    tier: ["Purchase tier", 1],
    targetTier: ["Target tier", 1],
    targetCount: ["Target quantity", 1],
    reserveSlots: ["Empty slots", 0],
};
const SWITCHES = {
    extendChain: "Extended East Wind chain",
    higherTier: "Higher East Wind tier limit",
    ingameButtons: "Show in-game buttons",
};

function SushiAutomation() {
    const enabled = van.state(false);
    const state = van.state({});
    const pending = van.state(false);
    const settingsLoaded = van.state(false);
    const loading = van.state(true);
    const error = van.state(null);
    // A number as its field shows it (text); a switch as true or false.
    const settings = Object.fromEntries(
        [...Object.keys(NUMBERS), ...Object.keys(SWITCHES)].map((key) => [key, van.state(key in NUMBERS ? "" : false)])
    );
    // What the last press or read said, on Auto Play's line in place of the game's words: a failure in red. It takes
    // the line's place, so nothing under it moves.
    const feedback = van.state("");
    const failed = van.state(false);
    const say = (text, isFailure = false) => {
        feedback.val = text;
        failed.val = isFailure;
    };
    let saved = null; // the settings as the config holds them
    const saves = []; // every setting's save, to know when one is running
    const settingsSaving = () => saves.some((save) => save.isBusy() || save.status.val === "loading");
    const show = (key) => (settings[key].val = key in NUMBERS ? String(saved[key] ?? "") : Boolean(saved[key]));
    // The settings as the config holds them, remembered as what is saved.
    const remember = (config) => {
        saved = { ...config.cheatConfig.w7.sushitools };
        return saved;
    };

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
                remember(config);
                Object.keys(settings).forEach(show);
            }
            state.val = await command("status");
            settingsLoaded.val = true;
            enabled.val = state.val.enabled;
            say("");
            error.val = null;
        } catch (caught) {
            // Before the first read the page has nothing to show: the shared failure says it. After it, the line does.
            if (!saved) error.val = caught.message;
            else say(caught.message, true);
        } finally {
            pending.val = false;
            loading.val = false;
        }
    }

    // The saved settings with `keys` as the page shows them; throws a short reason for one of those that can't be. Only
    // the numbers being saved are checked, so a saved one the board no longer allows doesn't hold back another's save.
    const draftWith = (keys) => {
        const draft = { ...saved };
        for (const key of keys) draft[key] = settings[key].val;
        const max = {
            tier: state.val.maxPurchaseTier,
            targetTier: state.val.maxTier + 1,
            targetCount: 120,
            reserveSlots: 119,
        };
        for (const key of keys.filter((key) => key in NUMBERS)) {
            const [name, min] = NUMBERS[key];
            const value = Number(draft[key]);
            if (String(draft[key]).trim() === "" || !Number.isInteger(value) || value < min || value > max[key])
                throw new Error(`${name}: ${min} to ${max[key]}`);
            draft[key] = value;
        }
        // The board's unlocked slots, once the status has read the board.
        const slots = state.val.working && state.val.working.length + state.val.reserved.length;
        if (slots && keys.includes("reserveSlots") && draft.reserveSlots >= slots)
            throw new Error(`Empty slots: ${slots - 1} at most on this board`);
        if (slots && keys.some((key) => key === "targetCount" || key === "reserveSlots"))
            if (draft.targetCount > slots - draft.reserveSlots)
                throw new Error(`Target quantity: ${slots - draft.reserveSlots} at most on this board`);
        return Object.fromEntries(Object.keys(settings).map((key) => [key, draft[key]]));
    };
    const same = (draft) => Object.keys(settings).every((key) => draft[key] === saved[key]);
    async function saveSettings(draft) {
        const { result, config } = await saveConfigPart(() => ({ cheatConfig: { w7: { sushitools: draft } } }));
        remember(config);
        if (result.message.includes("kept its old settings"))
            throw new Error("Saved, but the running game kept its old settings");
    }

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
            // Auto Play starts with the settings as the page shows them.
            if (action === "" && !enabled.val) {
                const draft = draftWith(Object.keys(settings));
                if (!same(draft)) await saveSettings(draft);
            }
            const result = await command(action);
            enabled.val = result.enabled;
            state.val = { ...state.val, error: null };
            say(result.message);
            announce(result.message);
        } catch (caught) {
            say(caught.message, true);
            announce(caught.message);
        } finally {
            pending.val = false;
        }
    }

    // The settings change only while Auto Play is off, and once they were read.
    const locked = () => enabled.val || !settingsLoaded.val;
    const busy = () => pending.val || loading.val;

    /** A number of Auto Play's: its own row, saved on Enter or on leaving the field. */
    const NumberRow = (key) => {
        const [name, min] = NUMBERS[key];
        const value = settings[key];
        const save = useAutoSave({
            prepare: () => {
                if (locked()) return { unchanged: true };
                const draft = draftWith([key]);
                if (draft[key] === saved[key]) return { unchanged: true };
                // Saved: the field shows what the config now holds, unless the player typed on meanwhile.
                const typed = value.val;
                // Only this setting goes: another row's save still running keeps its own value (#323 review).
                return {
                    write: () => saveSettings({ [key]: draft[key] }).then(() => value.val === typed && show(key)),
                };
            },
            // Escape: the saved number comes back.
            revert: () => saved && show(key),
        });
        saves.push(save);
        const step = (delta) => () => {
            if (locked()) return;
            const now = Number.parseInt(value.val, 10);
            value.val = String(Math.max(min, (Number.isNaN(now) ? min : now) + delta));
        };
        return AccountRow({
            rowClass: "value-row automation-setting",
            info: span({ class: "account-row__name" }, name),
            controls: [
                SaveState(save),
                div(
                    { class: "value-cells" },
                    div(
                        {
                            class: () =>
                                `value-cell column--field account-field-metric ${saveStateClass(save.status.val, save.undo)}`,
                            ...save.handlers,
                        },
                        span({ class: "value-cell__label" }, name),
                        NumberInput({
                            value,
                            mode: "int",
                            "aria-label": name,
                            disabled: locked,
                            onDecrement: step(-1),
                            onIncrement: step(1),
                        })
                    )
                ),
            ],
        });
    };

    /** A switch of Auto Play's, saved on flip; it goes back when the save fails. In-game buttons save on their own. */
    const SwitchRow = (key) => {
        const name = SWITCHES[key];
        const save = useAutoSave({ prepare: () => ({ unchanged: true }) });
        saves.push(save);
        let flips = 0;
        const flip = async (on) => {
            const mine = ++flips;
            settings[key].val = on;
            // Each flip saves only its own state, in the order flipped, so the last one wins.
            const { ok } = await save.run(() => saveSettings({ [key]: on }), "toggle");
            // A refused flip shows what the config holds, unless a newer flip is still to say its own.
            if (!ok && saved && mine === flips) show(key);
        };
        return AccountRow({
            rowClass: "value-row automation-setting",
            info: span({ class: "account-row__name" }, name),
            controls: [
                SaveState(save),
                div(
                    { class: "value-cells" },
                    div(
                        { class: "value-cell column--switch" },
                        span({ class: "value-cell__label" }, name),
                        label(
                            { class: "toggle-switch" },
                            input({
                                type: "checkbox",
                                role: "switch",
                                "aria-label": name,
                                checked: settings[key],
                                disabled: locked,
                                onchange: (e) => void flip(e.target.checked),
                            }),
                            span({ class: "slider", "aria-hidden": "true" })
                        )
                    )
                ),
            ],
        });
    };

    // Auto Play's own line: what it is doing now (the game's words), and the goal it idles at.
    const autoPlayRow = AccountRow({
        rowClass: "automation-row",
        info: div(
            { class: "account-row__name-group" },
            span({ class: "account-row__name" }, "Auto Play"),
            // Not a live region: it follows the game every two seconds. A press's outcome is announced (run).
            span(
                { class: () => joinClasses("automation-row__status", failed.val && !pending.val && "is-failed") },
                () =>
                    pending.val
                        ? "Working…"
                        : feedback.val || state.val.error || state.val.message || "Reading the board…"
            ),
            span({ class: "automation-pick__detail" }, () =>
                settingsLoaded.val
                    ? `Goal ${settings.targetCount.val || "…"} × tier ${settings.targetTier.val || "…"}+. Idles there; disable and enable to run again.`
                    : ""
            )
        ),
    });

    const root = PersistentAccountListPage({
        rootClass: "tab-container scroll-container automation-page",
        title: "Sushi Station",
        description: "Keep the in-game Sushi board open in sushi-move mode for Sort and Auto Play.",
        actions: [
            ActionButton({
                label: () => (enabled.val ? "Disable Auto Play" : "Enable Auto Play"),
                // The page's one main button; turning it off is the danger kind.
                variant: () => (enabled.val ? "danger" : "main"),
                disabled: () => busy() || (!enabled.val && !settingsLoaded.val),
                onClick: () => run(""),
            }),
            ActionButton({ label: "Sort", disabled: () => busy() || locked(), onClick: () => run("sort") }),
            RefreshButton({ onRefresh: refresh, disabled: busy }),
        ],
        state: { loading, error },
        loadingText: "Reading Sushi Station",
        errorTitle: "Couldn't read Sushi Station",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed", "aria-busy": () => String(pending.val) },
            ListPanel({
                className: "automation-list",
                body: div(
                    { class: "automation-rows sushi-settings", style: "--value-columns: 9.5rem" },
                    AccountSection({
                        title: "Settings",
                        body: [
                            autoPlayRow,
                            ...Object.keys(NUMBERS).map(NumberRow),
                            ...Object.keys(SWITCHES).map(SwitchRow),
                        ],
                    })
                ),
            })
        ),
    });
    refresh();
    // Follow Auto Play started, stopped or progressing elsewhere (the in-game buttons) while this page is on screen.
    let polling = false;
    let pollFailed = false;
    setInterval(async () => {
        if (polling || pending.val || !settingsLoaded.val || root.offsetParent === null || document.hidden) return;
        polling = true;
        const started = actions;
        try {
            const status = await command("status");
            if (started !== actions) return; // a click's own answer is newer
            if (pollFailed || status.message !== state.val.message || status.enabled !== enabled.val) say("");
            pollFailed = false;
            state.val = status;
            enabled.val = status.enabled;
        } catch (caught) {
            if (started !== actions) return;
            pollFailed = true;
            say(caught.message, true);
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
    keywords: ["Sushi", "Auto Play", "Sort", "Sushi tools", "Tools", "East Wind", "Purchase tier", "Target tier"],
    component: SushiAutomation,
});
