import van from "../../../../vendor/van-1.6.0.js";
import { PickInPlace } from "./PickInPlace.js";

const { div, span } = van.tags;

/**
 * The character a page shows (Prayers, 3D Printer, Traps), picked on the line under the title: "Character", the name
 * in the page's own shape, and a line about that character. The names open in place under the line, like any pick in
 * place; picking one calls `onChange` with `{ target: { value } }`, the value `getValue` gives that name.
 */
export const createCharacterSelector = ({ id, selected, disabled, onChange, info, getValue = (name) => name }) => {
    const names = van.state([]);
    const valueOf = (name) => String(getValue(name, names.val.indexOf(name)));
    const shownName = () => names.val.find((name) => valueOf(name) === String(selected.val)) ?? "";
    const pick = PickInPlace({
        name: "Character",
        opener: shownName,
        options: () => names.val.map((name) => ({ id: valueOf(name), label: name })),
        picked: () => String(selected.val),
        onPick: (value) => onChange({ target: { value } }),
        disabled,
        openerClass: "character-picker__opener",
    });
    pick.opener.id = id;

    return {
        node: div(
            { class: "character-picker" },
            div(
                { class: "character-picker__line" },
                span({ class: "character-picker__label" }, "Character"),
                pick.opener,
                info ? span({ class: "character-picker__info" }, info) : null
            ),
            pick.panel
        ),
        setCharacters: (next) => {
            if (JSON.stringify(next) !== JSON.stringify(names.val)) names.val = [...next];
        },
    };
};
