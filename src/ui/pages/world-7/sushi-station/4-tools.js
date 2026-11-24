/**
 * World 7 › Sushi Station › Tools: Knowledge XP, which adds crafting-tree XP from nothing, so it stays with the
 * cheats. Auto Play and Sort are automation: they moved to Automation › Sushi Station (#249), linked by the title.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { executeCheatAction } from "../../../services/api.js";
import { NumberInput } from "../../../components/NumberInput.js";
import { AccountTabHeader } from "../../../components/views/account/components/AccountTabHeader.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
const { div, span } = van.tags;

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
            let answer;
            try {
                answer = JSON.parse(response.message);
            } catch {
                // The XP may have gone in, so no "try again": the parser's words are never shown.
                throw new Error("Couldn't read Sushi's answer.");
            }
            feedback.val = answer.message;
        } catch (error) {
            feedback.val = error.message;
        } finally {
            pending.val = false;
        }
    }
    // The tool's own numbers sit in the tray with it (like Populate's units), each in the shared field.
    const numberField = (title, value) => {
        const step = (delta) => (value.val = String(Math.max(1, (Number.parseInt(value.val, 10) || 1) + delta)));
        return div(
            { class: "account-setall-row" },
            span({ class: "account-setall-row__label" }, title),
            div(
                { class: "account-setall-row__input" },
                NumberInput({
                    value,
                    mode: "int",
                    "aria-label": title,
                    oninput: (e) => (value.val = e.target.value),
                    onDecrement: () => step(-1),
                    onIncrement: () => step(1),
                })
            )
        );
    };
    return div(
        { class: "tab-container scroll-container" },
        AccountTabHeader({
            title: "Tools",
            description:
                "Adds crafting-tree Knowledge XP; the board and fuel stay. Needs Knowledge, with Auto Play off.",
            automation: { page: "automation.sushi" },
        }),
        div(
            { class: "account-list account-list--tabbed", "aria-busy": () => pending.val },
            ListPanel({
                tools: () => [
                    numberField("Tier", knowledgeTier),
                    numberField("Quantity", knowledgeQuantity),
                    div(
                        { class: "tabbed-list__tool-group" },
                        ActionButton({ label: "Add Knowledge XP", disabled: () => pending.val, onClick: addXp }),
                        span({ class: "account-write-feedback", role: "status" }, () =>
                            pending.val ? "Working…" : feedback.val
                        )
                    ),
                ],
                // The game's answer to the last press (why it couldn't, or what it added), where the tool is.
                toolsLabel: () => (pending.val ? "Working…" : feedback.val || "Each press adds the XP again"),
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
