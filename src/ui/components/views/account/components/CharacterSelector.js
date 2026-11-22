import van from "../../../../vendor/van-1.6.0.js";
import { readCList, readGgaEntries } from "../../../../services/api.js";
import { toIndexedArray } from "../../../../utils/index.js";
import { normalCase } from "../accountShared.js";
import { PickInPlace } from "./PickInPlace.js";

const { div, span } = van.tags;

/**
 * The character a page shows (Prayers, 3D Printer, Traps), picked on the line under the title: "Character", the name
 * in the page's own shape, and a line about that character. The names open over the page, under the line, so nothing
 * below moves: each name with its class under it, in as many columns as the page is wide. Picking one calls `onChange`
 * with `{ target: { value } }`, the value `getValue` gives that name.
 */
export const createCharacterSelector = ({ id, selected, disabled, onChange, info, getValue = (name) => name }) => {
    const names = van.state([]);
    const classes = van.state({});
    const valueOf = (name) => String(getValue(name, names.val.indexOf(name)));
    const shownName = () => names.val.find((name) => valueOf(name) === String(selected.val)) ?? "";
    const pick = PickInPlace({
        name: "Character",
        opener: shownName,
        options: () => names.val.map((name) => ({ id: valueOf(name), label: name, note: classes.val[name] ?? "" })),
        picked: () => String(selected.val),
        onPick: (value) => onChange({ target: { value } }),
        disabled,
        openerClass: "character-picker__opener",
        panelClass: "character-picker__list",
    });
    pick.opener.id = id;
    // A click on the list's own ground keeps it open; anywhere else (or Tab past the end) closes it.
    pick.panel.tabIndex = -1;
    // The names run in columns: Left and Right step one name, Up and Down one line, Home and End to the ends.
    pick.panel.addEventListener("keydown", (e) => {
        const options = [...pick.panel.querySelectorAll(".pick-in-place__option")];
        const at = options.indexOf(document.activeElement);
        if (at < 0) return;
        const grid = pick.panel.querySelector(".pick-in-place__options");
        const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[e.key];
        const to = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : step === undefined ? null : at + step;
        if (to === null) return;
        e.preventDefault();
        e.stopPropagation();
        options[Math.max(0, Math.min(options.length - 1, to))].focus();
    });

    const node = div(
        {
            class: "character-picker",
            onfocusout: (e) => {
                if (pick.isOpen() && !node.contains(e.relatedTarget)) pick.close();
            },
        },
        div(
            { class: "character-picker__line" },
            span({ class: "character-picker__label" }, "Character"),
            pick.opener,
            info ? span({ class: "character-picker__info" }, info) : null
        ),
        pick.panel
    );

    // Each character's class, read once per roster: the game's capitals in normal case ("Death Bringer").
    let asked = "";
    const readClasses = async (roster) => {
        const key = roster.join("|");
        asked = key;
        try {
            const [classNames, entries] = await Promise.all([
                readCList("ClassNames"),
                readGgaEntries("PlayerDATABASE.h", roster, ["CharacterClass"]),
            ]);
            if (asked !== key) return;
            const list = toIndexedArray(classNames);
            const next = {};
            for (const name of roster) {
                const raw = list[Number(entries[name]?.h?.CharacterClass ?? entries[name]?.CharacterClass)];
                if (typeof raw === "string" && raw.length > 1) next[name] = normalCase(raw);
            }
            classes.val = next;
        } catch {
            // ponytail: a class is only a reminder under the name; without it the names still pick.
        }
    };

    return {
        node,
        setCharacters: (next) => {
            if (JSON.stringify(next) === JSON.stringify(names.val)) return;
            names.val = [...next];
            readClasses(names.val);
        },
    };
};
