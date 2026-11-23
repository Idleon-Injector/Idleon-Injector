import van from "../../../../vendor/van-1.6.0.js";
import { joinClasses, resolveValue } from "../accountShared.js";

const { button, div, input, p, span } = van.tags;

/**
 * A pick out of a list that opens in place, under what asked for it (a character, a 3D Printer slot's item): no
 * dropdown and no popup. `opener` is the button that shows the pick and opens the list; `panel` is the list, placed by
 * the caller where it should open (under the row, or under the picker's line). With `search`, the list starts with a
 * field that narrows it as the player types. Up and Down move through the list, Enter picks, Escape closes it and goes
 * back to the opener; a pick closes it too.
 *
 * @param {object} opts
 * @param {*} opts.opener what the opener shows (text, nodes or a function of them)
 * @param {() => {id: string, label: string, note?: string}[]} opts.options `note`: a quiet second line ("Death Bringer")
 * @param {() => string} [opts.picked] the id picked now, marked in the list
 * @param {(id: string) => *} opts.onPick
 * @param {string} opts.name what is picked, read out by assistive technology ("Character")
 * @param {boolean} [opts.search]
 * @param {number} [opts.limit] how many options a search shows at most
 * @param {*} [opts.disabled]
 * @param {"field"|"row"} [opts.look] "field": a soft filled shape (a character); "row": a row's own title opens it
 * @param {() => string} [opts.label] the pick in words, read out with `name` (when `opener` is nodes)
 * @param {string} [opts.openerClass]
 * @param {string} [opts.panelClass]
 * @returns {{ opener: HTMLElement, panel: HTMLElement, list: HTMLElement, isOpen: () => boolean, close: () => void }}
 */
export const PickInPlace = ({
    opener: openerContent,
    options,
    picked = () => "",
    onPick,
    name,
    search = false,
    limit = 60,
    disabled = false,
    look = "field",
    label = null,
    openerClass = "",
    panelClass = "",
}) => {
    const open = van.state(false);
    const query = van.state("");
    const words = () => query.val.trim().toLowerCase();
    const shown = () => {
        const all = options();
        const matching = words() ? all.filter((option) => option.label.toLowerCase().includes(words())) : all;
        return matching.slice(0, search ? limit : matching.length);
    };
    let openerNode = null;
    const close = (backToOpener = false) => {
        open.val = false;
        query.val = "";
        if (backToOpener) openerNode?.focus?.({ preventScroll: true });
    };
    const pick = (id) => {
        close(true);
        onPick(id);
    };
    const field = search
        ? input({
              type: "text",
              class: "pick-in-place__search",
              placeholder: "Search",
              "aria-label": `Search ${name.toLowerCase()}`,
              value: query,
              oninput: (e) => (query.val = e.target.value),
              // Enter picks the first match; the keys stay in the list, not the row around it.
              onkeydown: (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  e.stopPropagation();
                  const [first] = shown();
                  if (first) pick(first.id);
              },
          })
        : null;
    const list = div({ class: "pick-in-place__list", role: "listbox", "aria-label": name }, () =>
        div(
            { class: "pick-in-place__options" },
            ...shown().map((option) =>
                button(
                    {
                        type: "button",
                        role: "option",
                        "data-id": option.id,
                        class: () => joinClasses("pick-in-place__option", picked() === option.id && "is-picked"),
                        "aria-selected": () => String(picked() === option.id),
                        onclick: () => pick(option.id),
                    },
                    option.note
                        ? span(
                              { class: "pick-in-place__option-text" },
                              span({ class: "pick-in-place__option-label" }, option.label),
                              span({ class: "pick-in-place__option-note" }, option.note)
                          )
                        : option.label
                )
            ),
            shown().length ? null : p({ class: "pick-in-place__none" }, "Nothing matches.")
        )
    );
    // Up and Down move between the search field and the options; Escape closes and goes back to the opener.
    const onkeydown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            return close(true);
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return undefined;
        const stops = [field, ...list.querySelectorAll(".pick-in-place__option")].filter(Boolean);
        const at = stops.indexOf(document.activeElement);
        const next = stops[Math.max(0, Math.min(stops.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))];
        if (!next) return undefined;
        e.preventDefault();
        next.focus?.();
        return undefined;
    };
    const panel = div(
        { class: joinClasses("pick-in-place", panelClass), hidden: () => !open.val, onkeydown },
        field,
        list
    );
    openerNode = button(
        {
            type: "button",
            class: joinClasses(look === "row" ? "row-opener" : "pick-in-place__opener", openerClass),
            "aria-expanded": () => String(open.val),
            "aria-label": () => `${name}: ${label ? label() : (resolveValue(openerContent) ?? "")}`,
            disabled,
            onclick: () => {
                open.val = !open.val;
                if (!open.val) return close();
                // The list takes focus where the player types or picks next.
                requestAnimationFrame(() =>
                    (
                        field ??
                        list.querySelector(".is-picked") ??
                        list.querySelector(".pick-in-place__option")
                    )?.focus?.({
                        preventScroll: true,
                    })
                );
                return undefined;
            },
        },
        look === "row" ? openerContent : span({ class: "pick-in-place__value" }, openerContent)
    );
    return { opener: openerNode, panel, list, isOpen: () => open.val, close: () => close() };
};
