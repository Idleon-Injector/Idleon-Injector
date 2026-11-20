import van from "../../../vendor/van-1.6.0.js";

const { div, span, button } = van.tags;

/*
 * A value row's states (Equipped, Locked, Complete) now that the cap lives in the field and the badge is gone.
 *
 * CONCEPT ONLY (design/max-in-field): the three placements are drawn at once and the root's `data-state-place` shows
 * one, so the maintainer can pick by looking. The switch in the corner is part of the concept, not the design; once
 * one placement is picked, the other two and the switch go.
 *   name   - a muted word after the row's name
 *   column - a muted word in the badge's old column, just before the field
 *   mark   - a small dot after the name (filled: on, such as Equipped; a ring: off, such as Locked), its word on hover
 */
const PLACES = [
    ["name", "By name"],
    ["column", "Before field"],
    ["mark", "Marker"],
];
const STORAGE_KEY = "concept.statePlace";

const readPlace = () => {
    try {
        return PLACES.some(([id]) => id === localStorage.getItem(STORAGE_KEY))
            ? localStorage.getItem(STORAGE_KEY)
            : "name";
    } catch {
        return "name";
    }
};

const place = van.state(readPlace());

let switchMounted = false;
const mountSwitch = () => {
    // ponytail: concept-only, so it skips the test DOM (no documentElement) instead of faking one there.
    if (switchMounted || !document.documentElement?.dataset || !document.body) return;
    switchMounted = true;
    document.documentElement.dataset.statePlace = place.val;
    const choose = (id) => {
        place.val = id;
        document.documentElement.dataset.statePlace = id;
        try {
            localStorage.setItem(STORAGE_KEY, id);
        } catch {
            /* the pick just isn't remembered */
        }
    };
    van.add(
        document.body,
        div(
            { class: "concept-switch", role: "group", "aria-label": "Concept only: where row states go" },
            span({ class: "concept-switch__label" }, "Concept"),
            ...PLACES.map(([id, label]) =>
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm",
                        "aria-pressed": () => String(place.val === id),
                        onclick: () => choose(id),
                    },
                    label
                )
            )
        )
    );
};

// A walk over childNodes rather than querySelector, so it also runs on the tests' minimal DOM.
const findName = (node) => {
    if ((node.getAttribute?.("class") ?? "").split(" ").includes("account-row__name")) return node;
    for (const child of node.childNodes ?? []) {
        const found = findName(child);
        if (found) return found;
    }
    return null;
};

/** @param {() => Array<{ label: string, on?: boolean } | null>} renderStates */
export const RowStates = (renderStates) => {
    mountSwitch();
    const list = () => (renderStates() || []).filter(Boolean);
    const text = () =>
        list()
            .map((state) => state.label)
            .join(" · ");
    const word = (className) => span({ class: className, hidden: () => !list().length }, text);

    const nameWord = word("account-row__state account-row__state--name");
    const mark = span(
        {
            class: () => (list().some((state) => state.on) ? "account-row__mark is-on" : "account-row__mark"),
            hidden: () => !list().length,
            title: text,
        },
        span({ class: "sr-only" }, text)
    );

    return {
        column: word("account-row__state account-row__state--column"),
        // The name keeps its own node; it only moves into a line that holds the mark or the word after it.
        placeInInfo: (info) => {
            const name = findName(info);
            if (!name) return void info.append(mark, nameWord);
            const line = span({ class: "account-row__name-line" });
            name.replaceWith(line);
            line.append(name, mark, nameWord);
        },
    };
};
