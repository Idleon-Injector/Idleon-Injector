/**
 * World 2 › Bubbles › Automation: which alchemy bubbles the bubble automation raises, with the game's own upgrade.
 * Bubbles that have a max rise to one page-wide target % of it, the one furthest behind first; bubbles without a max
 * need a stop-at level, which also caps any bubble. A row pays with its materials, or with particles once the
 * particle buy is open for it.
 *
 * Reads readComputed("automation", "bubbles") (each cauldron's bubbles with level, % of max, costs and particle
 * option) and saves cheatConfig.automation.bubbles = { target, items: [{ id: "cauldron:bubble", on, stopAt, pay }] }.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { fetchConfig, readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { NumberInput, getNumberInputLiveRaw, setNumberInputValue } from "../../../components/NumberInput.js";
import { Said, useSaid } from "../../../components/inPlace.js";
import { BulkActionBar } from "../../../components/views/account/BulkActionBar.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import {
    cleanName,
    createStaticRowReconciler,
    getOrCreateState,
    useWriteStatus,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationRow,
    PickRow,
    createAutomationPicks,
    readAutomations,
    setAtStart,
    switchAutomation,
} from "../../../components/views/account/automation.js";
import { AccountRow } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";

const { div, span } = van.tags;

const CHEAT = "automation bubbles";
const PAY = {
    field: "pay",
    label: "Pay with",
    options: [
        { value: "materials", label: "Materials" },
        { value: "particles", label: "Particles" },
    ],
};

// The target: 0 to 99.9 with at most one decimal (a bubble's % of max never reaches 100).
const parseTarget = (raw) => {
    const text = String(raw ?? "").trim();
    if (!/^\d{1,2}(\.\d)?$/.test(text)) throw new Error("0 to 99.9, one decimal");
    return Number(text);
};

/** The page-wide target, in % of max: saves on Enter or on leaving the field, like a stop-at. */
const TargetRow = ({ picks }) => {
    const target = picks.setting("target");
    const draft = van.state(String(target.val));
    const show = () => setNumberInputValue(draft, String(target.val));
    const save = useAutoSave({
        prepare: () => {
            const typed = getNumberInputLiveRaw(draft) ?? draft.val;
            const next = parseTarget(typed);
            if (next === target.val) {
                show();
                return picks.fileBehind() ? { write: () => picks.resave() } : { unchanged: true };
            }
            // A value typed while this one saves stays in the field for the save after it.
            const stillTyped = () => (getNumberInputLiveRaw(draft) ?? draft.val) === typed;
            return { write: () => picks.setSetting("target", next).finally(() => stillTyped() && show()) };
        },
        revert: show,
    });
    const step = (delta) => () => {
        const current = Number(getNumberInputLiveRaw(draft) ?? draft.val);
        const base = Number.isFinite(current) ? current : target.val;
        setNumberInputValue(draft, String(Math.min(99.9, Math.max(0, Math.round(10 * (base + delta)) / 10))));
    };

    return {
        show,
        node: AccountRow({
            rowClass: "account-row--wide-controls automation-pick",
            info: div(
                { class: "account-row__name-group" },
                span({ class: "account-row__name" }, "Target"),
                span(
                    { class: "account-row__sub-label" },
                    "Bubbles that have a max rise to this % of it, the one furthest behind first. A stop-at still caps a bubble."
                )
            ),
            controls: div(
                { class: () => `account-field-metric ${saveStateClass(save.status.val, save.undo)}`, ...save.handlers },
                div(
                    { class: "account-inline-field__head" },
                    span({ class: "account-field-metric__label" }, "% of max"),
                    SaveState({ status: save.status, reason: save.reason, undo: save.undo })
                ),
                NumberInput({
                    mode: "float",
                    value: draft,
                    "aria-label": "Bubble target, in percent of max",
                    onDecrement: step(-1),
                    onIncrement: step(1),
                })
            ),
        }),
    };
};

// A row's next cost: every slot, or the particle buy on a Particles row.
const costText = (bubble, pay) => {
    if (pay === "particles") {
        if (bubble.particle.waiting) return bubble.particle.waiting;
        const liquids = bubble.costs.filter(({ liquid }) => liquid);
        return `Next level ${[
            `${formatNumber(bubble.particle.cost)} particles`,
            "1 charge",
            ...liquids.map(({ cost, name }) => `${formatNumber(cost)} ${name}`),
        ].join(", ")}`;
    }
    const short = bubble.costs.filter((slot) => slot.short).map(({ name }) => cleanName(name));
    const costs = bubble.costs.map(({ cost, name }) => `${formatNumber(cost)} ${cleanName(name)}`).join(", ");
    return `Next level ${costs}${short.length ? ` · not enough ${short.join(", ")}` : ""}`;
};

const BubblesAutomationPage = () => {
    const automation = van.state(null);
    const readSwitch = async () => {
        automation.val = (await readAutomations()).find(({ cheat }) => cheat === CHEAT) ?? null;
    };
    // Switching a bubble on switches Bubbles on too (now and at start), so raising starts at once.
    const picks = createAutomationPicks("bubbles", {
        fields: { pay: "materials" },
        settings: { target: 90 },
        onTurnedOn: async () => {
            await readSwitch(); // the overview may have switched it since this tab read it
            if (automation.val?.on) return setAtStart(CHEAT, true);
            await switchAutomation(CHEAT, true);
            await readSwitch();
        },
    });
    const ids = van.state([]);
    const bubbles = new Map(); // "cauldron:bubble" -> state of what the game read
    const particles = van.state(null);
    const bulk = useWriteStatus();
    const bulkSaid = useSaid();
    const { loading, error, run } = useAccountLoad({ label: "Bubble automation" });

    const switchNode = div();
    const targetRow = TargetRow({ picks });
    const listNode = div({ class: "content-stack" });
    const reconcile = createStaticRowReconciler(listNode);

    const BubbleRow = ({ id, name }) => {
        const item = picks.get(id);
        const bubble = getOrCreateState(bubbles, id, {});
        return PickRow({
            picks,
            id,
            name,
            stopAtTitle: "Stop at level",
            badge: () => {
                const { level = 0, percent = null } = bubble.val;
                return `LV ${formatNumber(level)} · ${percent === null ? "no max" : `${(Math.floor(10 * percent) / 10).toFixed(1)}%`}`;
            },
            notes: [
                () => cleanName(bubble.val.bonus ?? ""),
                () => {
                    if (!bubble.val.costs) return "";
                    if (!(bubble.val.level > 0)) return "Not discovered yet; it can be switched on ahead";
                    if (bubble.val.percent === null && item.stopAt.val === null)
                        return "No max level: set a stop-at to raise it";
                    return costText(bubble.val, item.pay.val);
                },
            ],
            choice: PAY,
        });
    };

    const load = () =>
        run(async () => {
            const since = picks.edits(); // a save that ends while this reads makes the read old
            const [data, config] = await Promise.all([readComputed("automation", "bubbles"), fetchConfig()]);
            await readSwitch();
            picks.sync(config.cheatConfig.automation.bubbles, since);
            if (since === picks.edits()) targetRow.show();
            if (!switchNode.firstChild && automation.val)
                switchNode.append(AutomationRow({ entry: automation, onSwitched: readSwitch }));
            particles.val = data.atoms ? { owned: data.particles, charges: data.charges } : null;

            const all = data.cauldrons.flatMap((cauldron) => cauldron.bubbles);
            reconcile(all.map(({ id }) => id).join("|"), () =>
                data.cauldrons.map((cauldron) =>
                    AccountSection({
                        title: cauldron.name,
                        body: div(
                            { class: "account-item-stack" },
                            cauldron.bubbles.map(({ id, name }) => BubbleRow({ id, name: cleanName(name) }))
                        ),
                    })
                )
            );
            for (const bubble of all) getOrCreateState(bubbles, bubble.id, {}).val = bubble;
            ids.val = all.map(({ id }) => id);
        });

    // Enable all runs on one click; Disable all asks "Click again" first (#25). Both keep stop-at and pay with.
    const setAll = (on) =>
        bulk.run(
            async () => {
                bulkSaid.clear();
                await picks.setAll(ids.val, on);
            },
            { onError: (caught) => bulkSaid.say("failed", caught.message) }
        );
    const busy = () => loading.val || bulk.status.val === "loading";
    const switchedOn = () => ids.val.filter((id) => picks.get(id).on.val).length;

    load();

    return PersistentAccountListPage({
        title: "AUTOMATION",
        description:
            "Switched-on bubbles are raised with the game's own upgrade, paying materials, or particles on a Particles row once the particle buy opens; switching one on turns Bubbles on. It pauses while the alchemy menu is open or you hold Bargain Tags, which any upgrade uses up. A free extra level can pass the stop-at.",
        actions: BulkActionBar({
            actions: [
                {
                    label: "Enable all",
                    status: bulk.status,
                    disabled: () => busy() || (switchedOn() === ids.val.length && Boolean(automation.val?.on)),
                    onClick: () => setAll(true),
                },
                {
                    label: "Disable all",
                    variant: "danger",
                    status: bulk.status,
                    disabled: () => busy() || !switchedOn(),
                    confirm: () =>
                        `switch off ${switchedOn() === 1 ? "1 bubble" : `all ${switchedOn()} bubbles`}, in every cauldron.`,
                    onClick: () => setAll(false),
                },
            ],
            refresh: { onClick: load, disabled: busy },
        }),
        state: { loading, error },
        loadingText: "READING BUBBLES",
        errorTitle: "BUBBLE READ FAILED",
        initialWrapperClass: "scrollable-panel",
        body: div(
            { class: "scrollable-panel content-stack bubbles-automation" },
            Said({ said: bulkSaid.said, className: "said--line" }),
            AccountSection({
                title: "SETTINGS",
                meta: span({ class: "account-row__sub-label" }, () =>
                    particles.val
                        ? `${formatNumber(particles.val.owned)} particles · ${formatNumber(particles.val.charges)} charges`
                        : ""
                ),
                body: div({ class: "account-item-stack" }, switchNode, targetRow.node),
            }),
            listNode
        ),
    });
};

export default definePage({
    id: "w2.bubbles.automation",
    world: 2,
    system: "Bubbles",
    tab: "Automation",
    description: "Alchemy bubbles raised with their own materials or particles, to a target % of their max.",
    keywords: ["Autobuy", "Auto buy", "Auto upgrade", "Alchemy", "Particles", "Stop at"],
    component: BubblesAutomationPage,
});
