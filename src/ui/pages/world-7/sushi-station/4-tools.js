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
import { useWriteStatus } from "../../../components/views/account/accountShared.js";
const { div, span } = van.tags;

function SushiToolsTab() {
    const { status, run } = useWriteStatus();
    const pending = () => status.val === "loading";
    const added = van.state("");
    const knowledgeTier = van.state("1");
    const knowledgeQuantity = van.state("1");
    // The game says why it can't (Auto Play on, Knowledge locked, a bad tier): the tray says it in the tool's place.
    const addXp = () =>
        run(async () => {
            added.val = "";
            const numbers = [knowledgeTier, knowledgeQuantity].map((field) => Number(field.val));
            if (!numbers.every((n) => Number.isSafeInteger(n) && n >= 1))
                throw new Error("Tier and quantity are whole numbers from 1.");
            const response = await executeCheatAction(`w7 sushitools knowledge ${numbers.join(" ")}`);
            try {
                added.val = JSON.parse(response.message).message;
            } catch {
                // The XP may have gone in, so no "try again": the parser's words are never shown.
                throw new Error("Couldn't read Sushi's answer.");
            }
        });
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
            { class: "account-page-shell__body" },
            div(
                { class: "account-list account-list--tabbed", "aria-busy": pending },
                ListPanel({
                    tools: () => [
                        numberField("Tier", knowledgeTier),
                        numberField("Quantity", knowledgeQuantity),
                        div(
                            { class: "tabbed-list__tool-group" },
                            ActionButton({ label: "Add Knowledge XP", status, disabled: pending, onClick: addXp }),
                            span({ class: "account-write-feedback", role: "status" }, added)
                        ),
                    ],
                    // What the last press added, where the tool is.
                    toolsLabel: () => (pending() ? "Working…" : added.val || "Each press adds the XP again"),
                })
            )
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
