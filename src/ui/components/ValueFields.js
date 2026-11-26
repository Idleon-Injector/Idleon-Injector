/**
 * The fields of a command that takes a value from a list (menu/valueCommands.js): one that suggests the values by name
 * as the player types, and an amount where the command takes one. Used by a cheat's row (SystemCheats' CheatRow), in a page's
 * cheats panel and the Cheats area; each runs what `read()` gives.
 */

import van from "../vendor/van-1.6.0.js";
import store from "../state/store.js";
import { VALUE_COMMANDS, codeOf, valuesOf } from "../menu/valueCommands.js";

const { datalist, input, option, span } = van.tags;

const AMOUNT_WORDS = { Amount: "an amount", Level: "a level", Stacks: "a stack count" };
export const withArticle = (noun) => `${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;

/** Why a typed number can't run ("Not a number.", "0 or more."), or "". The game's own commands cut "3abc" to 3. */
export const notANumber = (text) => {
    const number = Number(text);
    return !Number.isFinite(number) ? "Not a number." : number < 0 ? "0 or more." : "";
};

/**
 * @param {string} command - A key of VALUE_COMMANDS ("spawn")
 * @param {string} label - What the row is called, for screen readers
 * @returns {{ element: Element, read: () => ({ action: string } | { refuse: string, field: Element }) }}
 */
export const ValueFields = (command, label) => {
    const spec = VALUE_COMMANDS[command];
    const values = van.derive(() => valuesOf(command, store.data.cheats));
    const listId = `values-${command.replace(/\W+/g, "-")}`;
    // What the fields hold. The fields stay put and show these, so typing keeps focus.
    const text = van.state("");
    const count = van.state("");

    const choices = datalist({ id: listId });
    // The cheat list may load after the row.
    van.derive(() => choices.replaceChildren(...values.val.map((value) => option({ value: value.name }))));
    const choice = input({
        type: "text",
        class: "value-fields__choice",
        value: text,
        list: listId,
        autocomplete: "off",
        placeholder: spec.noun.charAt(0).toUpperCase() + spec.noun.slice(1),
        "aria-label": `${label}: ${spec.noun}`,
        oninput: (e) => (text.val = e.target.value),
        onclick: (e) => e.stopPropagation(),
    });
    const amount = spec.amount
        ? input({
              type: "text",
              inputmode: "decimal",
              class: "value-fields__amount",
              value: count,
              placeholder: spec.amount,
              "aria-label": `${label}: ${spec.amount.toLowerCase()}`,
              oninput: (e) => (count.val = e.target.value),
              onclick: (e) => e.stopPropagation(),
          })
        : null;

    const read = () => {
        const name = text.val.trim();
        if (!name) return { refuse: `Needs ${withArticle(spec.noun)}`, field: choice };
        const code = codeOf(name, values.val) ?? (spec.anyText ? name : null);
        if (!code) return { refuse: `Not ${withArticle(spec.noun)}.`, field: choice };
        const number = count.val.trim();
        if (spec.amountNeeded && !number) return { refuse: `Needs ${AMOUNT_WORDS[spec.amount]}`, field: amount };
        if (number && notANumber(number)) return { refuse: notANumber(number), field: amount };
        return { action: [command, code, number].filter(Boolean).join(" ") };
    };
    const element = span(
        { class: amount ? "value-fields" : "value-fields value-fields--single" },
        choice,
        choices,
        amount
    );
    return { element, read };
};
