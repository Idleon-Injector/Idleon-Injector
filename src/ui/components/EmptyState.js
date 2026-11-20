import van from "../vendor/van-1.6.0.js";
import { Icons } from "../assets/icons.js";

const { div } = van.tags;

/** An empty or failed list: words only. A failure (`failed`) leads its title with the warning mark. */
export const EmptyState = ({ title, subtitle = null, failed = false }) =>
    div(
        { class: `empty-state ${failed ? "empty-state--failed" : ""}`.trim() },
        div({ class: "empty-state-title" }, failed ? Icons.Warning({ class: "empty-state-mark" }) : null, title),
        subtitle ? div({ class: "empty-state-subtitle" }, subtitle) : null
    );
