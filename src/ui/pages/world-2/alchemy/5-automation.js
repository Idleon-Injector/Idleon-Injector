/**
 * World 2 › Alchemy › Automation: which alchemy bubbles the bubble automation raises, with the game's own upgrade.
 * Bubbles that have a max rise to one page-wide target % of it, the one furthest behind first; bubbles without a max
 * need a stop-at level, which also caps any bubble. A row pays with its materials, or with particles once the
 * particle buy is open for it. No "Save for it" and no saving.
 *
 * Reads readComputed("automation", "bubbles") (each cauldron's bubbles with level, % of max, costs and particle
 * option) and saves cheatConfig.automation.bubbles (one { id: "cauldron:bubble", on, stopAt, pay } per bubble, pay
 * left out for materials) and cheatConfig.automation.bubblesTarget.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { readComputed } from "../../../services/api.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { Said } from "../../../components/inPlace.js";
import {
    cleanName,
    normalCase,
    createStaticRowReconciler,
    getOrCreateState,
} from "../../../components/views/account/accountShared.js";
import {
    AutomationPage,
    AutomationStats,
    PickRow,
    SettingRow,
    automationColumns,
    createAutomationPicks,
    createAutomationSetting,
    useAutomationTab,
    usePicksBulk,
} from "../../../components/views/account/automation.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";

const { div, span } = van.tags;

const CHEAT = "automation bubbles";
const PAY = {
    field: "pay",
    title: "Pay with",
    options: [
        { value: null, label: "Materials" },
        { value: "particles", label: "Particles" },
    ],
};
const COLUMNS = automationColumns({ values: ["Level", "% of max"], selects: [PAY], stopAt: "Stop at level" });

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
    const ids = van.state([]);
    const bubbles = new Map(); // "cauldron:bubble" -> state of what the game read
    const particles = van.state(null);
    const listNode = div();
    const reconcile = createStaticRowReconciler(listNode);

    const BubbleRow = ({ id, name }) => {
        const item = picks.get(id);
        const pay = picks.field(id, "pay");
        const bubble = getOrCreateState(bubbles, id, {});
        return PickRow({
            picks,
            id,
            name,
            stopAtTitle: "Stop at level",
            selects: [PAY],
            values: [
                { name: "Level", text: () => formatNumber(bubble.val.level ?? 0) },
                {
                    name: "% of max",
                    quiet: true,
                    text: () => {
                        const { percent = null } = bubble.val;
                        return percent === null ? "No max" : `${(Math.floor(10 * percent) / 10).toFixed(1)}%`;
                    },
                },
            ],
            bonus: () => cleanName(bubble.val.bonus ?? ""),
            detail: [
                span(() => {
                    if (!bubble.val.costs) return "";
                    if (!(bubble.val.level > 0)) return "Not discovered yet; it can be switched on ahead";
                    if (bubble.val.percent === null && item.stopAt.val === null)
                        return "No max level: set a stop-at to raise it";
                    return costText(bubble.val, pay.val);
                }),
            ],
        });
    };

    const tab = useAutomationTab({
        label: "Bubble automation",
        cheats: [CHEAT],
        switchColumn: COLUMNS.on,
        read: async (automation) => {
            const data = await readComputed("automation", "bubbles");
            picks.sync(automation.bubbles);
            target.sync(automation.bubblesTarget);
            particles.val = data.atoms ? { owned: data.particles, charges: data.charges } : null;
            const all = data.cauldrons.flatMap((cauldron) => cauldron.bubbles);
            for (const bubble of all) getOrCreateState(bubbles, bubble.id, {}).val = bubble;
            reconcile(all.map(({ id }) => id).join("|"), () =>
                data.cauldrons.map((cauldron) =>
                    AccountSection({
                        title: normalCase(cauldron.name).replace(/-iq /i, "-IQ "),
                        body: cauldron.bubbles.map(({ id, name }) => BubbleRow({ id, name: cleanName(name) })),
                    })
                )
            );
            ids.val = all.map(({ id }) => id);
        },
    });
    const [automation] = tab.entries;
    // Switching a bubble on switches Bubbles on too (now and at start), in the same save; after every save the tab
    // reads the game again.
    const picks = createAutomationPicks("bubbles", {
        cheat: CHEAT,
        entry: automation,
        afterSave: tab.afterSave,
        item: "a bubble",
    });
    const target = createAutomationSetting("bubblesTarget", { afterSave: tab.afterSave });

    const bulk = usePicksBulk({
        targets: () => [[picks, ids.val]],
        // With every bubble on it still has work while Bubbles is off now or at start: switching it on.
        done: (on, total) => on === total && Boolean(automation.val?.on) && tab.atStart(CHEAT),
        words: ["bubble", "bubbles"],
        waiting: tab.waiting,
        loading: () => tab.loading.val,
    });
    const busy = () => tab.loading.val || bulk.busy();

    tab.load();

    return AutomationPage({
        description: "Raises switched-on bubbles. Pauses while alchemy is open or you hold Bargain Tags.",
        total: AutomationStats(() =>
            particles.val
                ? [
                      [formatNumber(particles.val.owned), "particles"],
                      [formatNumber(particles.val.charges), "charges"],
                  ]
                : []
        ),
        columns: COLUMNS,
        bulk,
        state: { loading: tab.loading, error: tab.error },
        load: tab.load,
        busy,
        notices: Said({ said: tab.waiting.over(bulk.said), className: "said--line" }),
        what: "bubbles",
        body: [
            AccountSection({
                title: "Settings",
                body: [
                    tab.switches,
                    SettingRow({
                        setting: target,
                        name: "Target",
                        title: "% of max",
                        mode: "float",
                        max: 99.9,
                        detail: "Bubbles with a max rise to this %, the furthest behind first",
                        column: COLUMNS.stopAt,
                    }),
                ],
            }),
            COLUMNS.head("Bubble"),
            listNode,
        ],
    });
};

export default definePage({
    id: "w2.bubbles.automation",
    world: 2,
    system: "Alchemy",
    tab: "Automation",
    description: "Alchemy bubbles raised with their own materials or particles, to a target % of their max.",
    keywords: ["Bubbles", "Autobuy", "Auto buy", "Auto upgrade", "Alchemy", "Particles", "Stop at"],
    component: BubblesAutomationPage,
});
