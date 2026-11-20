import van from "../vendor/van-1.6.0.js";
import { CheatItem } from "./CheatItem.js";
import { Icons } from "../assets/icons.js";

const { div, details, summary } = van.tags;

/**
 * Lazy Rendering Category
 * Wraps <details> element and only renders children when opened.
 * @param {object} props - Component props
 * @param {string} props.category - Category name
 * @param {boolean} props.isOpen - Whether to start expanded
 * @param {Array} props.cheats - Array of cheat objects in this category
 * @returns {Element} Details element with lazy-loaded content
 */
export const LazyCategory = ({ category, isOpen, cheats }) => {
    const isExpanded = van.state(isOpen);

    return details(
        {
            class: "cheat-category",
            "data-category": category,
            open: isOpen,
            ontoggle: (e) => {
                isExpanded.val = e.target.open;
            },
        },
        summary(category, Icons.Chevron({ dir: "right", class: "group-chevron" })),
        () => {
            if (!isExpanded.val) {
                return div({ class: "cheat-category-content hidden" });
            }
            return div(
                { class: "cheat-category-content" },
                cheats.map((cheat) => CheatItem(cheat))
            );
        }
    );
};
