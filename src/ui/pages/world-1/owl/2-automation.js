/**
 * World 1 › Owl › Automation: which Orion upgrades "automation orion" buys with feathers (see ClickerAutomationTab).
 */

import { definePage } from "../../../menu/menuModel.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { ClickerAutomationTab } from "../../../components/views/account/ClickerAutomationTab.js";

export default definePage({
    id: "w1.owl.automation",
    world: 1,
    system: "Owl",
    tab: "Automation",
    description: "Orion's upgrades bought with feathers, cheapest first, each up to its stop-at level.",
    keywords: ["Orion", "Autobuy", "Auto buy", "Clicker", "Feather Restart", "Mega Reset", "Stop at"],
    component: () =>
        ClickerAutomationTab({
            title: "AUTOMATION",
            description:
                "Switched-on upgrades are bought with feathers, and switching one on turns Orion's automation on. It saves for the cheapest High or Low upgrade (an affordable High one goes first) while Balanced ones are bought cheapest first. Buying stops at the stop-at level; leave it empty for no limit.",
            groups: [
                {
                    key: "orion",
                    currency: "feathers",
                    upgradesTitle: "UPGRADES",
                    lockedText: ({ unlockAt }) => `Unlocks at ${formatNumber(unlockAt)} feathers produced`,
                },
            ],
        }),
});
