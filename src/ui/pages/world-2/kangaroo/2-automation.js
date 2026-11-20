/**
 * World 2 › Kangaroo › Automation: which Poppy and Tar Pit upgrades "automation poppy" and "automation tarpit" buy
 * (see ClickerAutomationTab).
 */

import { definePage } from "../../../menu/menuModel.js";
import { formatNumber } from "../../../utils/numberFormat.js";
import { ClickerAutomationTab } from "../../../components/views/account/ClickerAutomationTab.js";

export default definePage({
    id: "w2.kangaroo.automation",
    world: 2,
    system: "Kangaroo",
    tab: "Automation",
    description: "Poppy's and the Tar Pit's upgrades bought while her menu is open, each up to its stop-at level.",
    keywords: ["Poppy", "Tar Pit", "Autobuy", "Auto buy", "Clicker", "Stop at"],
    component: () =>
        ClickerAutomationTab({
            title: "AUTOMATION",
            description:
                "Switched-on upgrades are bought while Poppy's menu is open, because her fish only land then; switching one on turns its automation on. Each saves for its cheapest High or Low upgrade (an affordable High one goes first) while Balanced ones are bought cheapest first, up to the stop-at level. The reset spiral and shiny catching stay manual.",
            groups: [
                {
                    key: "poppy",
                    currency: "fish",
                    upgradesTitle: "UPGRADES",
                    lockedText: ({ unlockAt }) => `Unlocks at ${formatNumber(unlockAt)} fish caught`,
                },
                {
                    key: "tarpit",
                    currency: "tartar fish",
                    upgradesTitle: "TAR PIT",
                    lockedText: () => "Needs more megafish",
                },
            ],
        }),
});
