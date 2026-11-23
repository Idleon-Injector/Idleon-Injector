/**
 * World 7 › Sushi Station › Tools: Knowledge XP, which adds crafting-tree XP from nothing, so it stays with the
 * cheats. Auto Play and Sort are automation: they moved to Automation › Sushi Station (#249), linked by the title.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { executeCheatAction } from "../../../services/api.js";
import { AccountTabHeader } from "../../../components/views/account/components/AccountTabHeader.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
const { div, label, input, p, span } = van.tags;

function SushiToolsTab() {
    const pending = van.state(false);
    const feedback = van.state("");
    const knowledgeTier = van.state("1");
    const knowledgeQuantity = van.state("1");
    // The game says why it can't (Auto Play on, Knowledge locked, a bad tier), so a press always gets its answer.
    async function addXp() {
        pending.val = true;
        try {
            const response = await executeCheatAction(
                `w7 sushitools knowledge ${knowledgeTier.val} ${knowledgeQuantity.val}`
            );
            feedback.val = JSON.parse(response.message).message;
        } catch (error) {
            feedback.val = error.message;
        } finally {
            pending.val = false;
        }
    }
    const numberField = (title, value) =>
        label(
            { class: "sushi-setting" },
            span({ class: "sushi-setting__title" }, title),
            input({
                "aria-label": title,
                type: "number",
                min: 1,
                step: 1,
                value,
                oninput: (e) => {
                    value.val = e.target.value;
                },
            })
        );
    return div(
        { class: "tab-container" },
        AccountTabHeader({
            title: "SUSHI TOOLS",
            description: "Adds crafting-tree Knowledge XP. Auto Play has to be off.",
            automation: { page: "automation.sushi" },
        }),
        div(
            { class: "scrollable-panel", "aria-busy": () => pending.val },
            AccountSection({
                title: "KNOWLEDGE XP",
                rootClass: "sushi-automation-controls sushi-knowledge",
                body: [
                    p({ class: "sushi-setting__help" }, "Requires Knowledge. Adds crafting-tree XP only."),
                    div(
                        { class: "sushi-settings-grid" },
                        numberField("Simulation tier", knowledgeTier),
                        numberField("Simulation quantity", knowledgeQuantity)
                    ),
                    p({ class: "sushi-setting__help" }, "Each click adds XP again; board and fuel stay unchanged."),
                    ActionButton({ label: "Add Knowledge XP", disabled: () => pending.val, onClick: addXp }),
                    p({ role: "status", "aria-live": "polite", class: "sushi-automation-status" }, () =>
                        pending.val ? "Working…" : feedback.val
                    ),
                ],
            })
        )
    );
}

export default definePage({
    id: "w7.sushistation.tools",
    world: 7,
    system: "Sushi Station",
    tab: "Tools",
    description: "Knowledge XP for the sushi crafting tree.",
    keywords: ["Sushi", "Knowledge", "Knowledge XP"],
    component: SushiToolsTab,
});
