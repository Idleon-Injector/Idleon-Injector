import van from "../../../../vendor/van-1.6.0.js";
import { AccountSection } from "./AccountSection.js";

const { div } = van.tags;

/**
 * A game board whose squares open their row under it, in the same panel (Research's grid, the Sushi station), the cog
 * board's way (#251): the same square again closes it, and so does Escape on the board or in the row, which gives focus
 * back to the square; in a field holding a draft Escape only puts the game's value back (the row does that). A press
 * from the keyboard takes focus into the row; a mouse press scrolls and focuses nothing.
 *
 * @param {object} opts
 * @param {string} opts.id the editor's id, for the squares' `aria-controls`
 * @param {(index: number) => string} opts.title the picked square's line ("Slot 3")
 * @param {(index: number) => HTMLElement} opts.row its row, built the first time it's picked and kept in the page,
 *   hidden, while another is picked, so its save state and Undo stay with it (VanJS drops the bindings of a row taken out)
 * @returns {{picked: {val: number|null}, toggle: (index: number, event?: Event) => void, close: () => void,
 *   squareProps: (index: number) => object, wrap: (board: HTMLElement) => HTMLElement}}
 */
export const createBoardEditor = ({ id, title, row }) => {
    const picked = van.state(null);
    const built = new Set();
    const editor = div({
        id,
        class: "board-editor",
        role: "region",
        "aria-label": () => (picked.val === null ? "" : title(picked.val)),
        tabindex: "-1",
        hidden: () => picked.val === null,
    });
    const close = () => (picked.val = null);
    const toggle = (index, event) => {
        if (picked.val === index) return close();
        if (!built.has(index)) {
            built.add(index);
            van.add(
                editor,
                div(
                    { class: "board-editor__square", hidden: () => picked.val !== index },
                    AccountSection({ title: title(index), body: row(index) })
                )
            );
        }
        picked.val = index;
        // A click with no pointer is a key press; after VanJS shows the row, whose update was queued first.
        if (event?.detail === 0) setTimeout(() => editor.focus());
    };
    return {
        picked,
        toggle,
        close,
        squareProps: (index) => ({
            type: "button",
            "data-square": index,
            "aria-expanded": () => String(picked.val === index),
            "aria-controls": id,
            onclick: (e) => toggle(index, e),
        }),
        wrap: (board) => {
            const node = div(board, editor);
            // The field's text as Escape reached the board, before its row put the game's value back.
            let escapeFrom;
            node.addEventListener("keydown", (e) => (escapeFrom = e.target.value), true);
            node.addEventListener("keydown", (e) => {
                if (e.key !== "Escape" || e.defaultPrevented || picked.val === null || e.target.value !== escapeFrom)
                    return;
                e.preventDefault();
                const square = node.querySelector(`[data-square="${picked.val}"]`);
                close();
                square?.focus({ preventScroll: true });
            });
            return node;
        },
    };
};
