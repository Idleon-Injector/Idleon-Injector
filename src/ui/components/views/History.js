/**
 * History › Changes (#31): every value a page saved this game session, newest first. Each action that saved values (a
 * field, a button, a bulk action) is one line in the shared list panel: when, what, on which page, with Undo (Undo all
 * for several values) at its end, putting the old values back on the character each was saved on. A line opens in
 * place to show its values, old → new. Save copies (#32) are the next page in this area (SaveCopies.js).
 */
import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { VIEWS } from "../../state/constants.js";
import { Icons } from "../../assets/icons.js";
import { fetchChanges } from "../../services/api.js";
import { changesVersion } from "../../services/changeLog.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";
import { AccountRow } from "./account/components/AccountRow.js";
import { ListPanel } from "./account/tabShared.js";
import { joinClasses } from "./account/accountShared.js";
import { EmptyState } from "../EmptyState.js";
import { undoAction } from "./account/undo.js";

const { div, span, button, time, details, summary } = van.tags;

const WASH_MS = 800;
// A bulk action lists this many values; the rest open under "N more".
export const SHOWN = 6;

const clock = (at) => new Date(at).toLocaleTimeString([], { hour12: false });
const hhmm = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
const values = (n) => `${n} ${n === 1 ? "value" : "values"}`;
// The undo's own words ("changed since: now 12") start a line of their own here.
const sentence = (text) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** A value as History shows it: numbers exact, anything else as JSON, long ones cut (the title has it all). */
export const shown = (value) => {
    if (value === undefined) return { text: "—", full: "nothing" };
    const full = typeof value === "number" ? String(value) : JSON.stringify(value);
    return { text: full.length > 28 ? `${full.slice(0, 27)}…` : full, full };
};

/** A value a line can say as it is: a number, or a short word ("Pets+"); never the game's lists and objects. */
export const isPlain = (value) => typeof value === "number" || (typeof value === "string" && value.length <= 16);

/** A value as a player reads it: plain ones as they are, a list or object by its size ("3 items"); the title has all. */
export const readable = (value) => {
    const { text, full } = shown(value);
    if (typeof value === "string") return { text: value.length > 28 ? `${value.slice(0, 27)}…` : value, full };
    if (Array.isArray(value)) return { text: `${value.length} ${value.length === 1 ? "item" : "items"}`, full };
    if (value && typeof value === "object") {
        const n = Object.keys(value).length;
        return { text: `${n} ${n === 1 ? "field" : "fields"}`, full };
    }
    return { text, full };
};

/** One value of an action: where it sits, old → new, and the character when the action saved on several. */
const Entry = (entry, oneCharacter, partly) => {
    const before = readable(entry.hasBefore ? entry.before : undefined);
    const after = readable(entry.after);
    return div(
        { class: joinClasses("change-entry", entry.undone && "is-undone-entry") },
        span({ class: "change-entry__path", title: entry.path }, entry.path),
        span(
            { class: "change-entry__values" },
            span({ class: "change-entry__before", title: before.full }, before.text),
            span({ class: "change-entry__arrow" }, "→"),
            span({ class: "change-entry__after", title: after.full }, after.text)
        ),
        span(
            { class: "change-entry__who" },
            entry.undone && partly ? "Undone" : oneCharacter ? "" : (entry.character ?? "")
        )
    );
};

let opened = 0;
/**
 * One action, a line of the list: its time, what it was (the page under it, with how many values and whose), the one
 * value's change when it saved one, then Undo / Undo all. The line opens its values under it; one line is open at a time
 * (`openId`).
 */
const Group = (data, openId) => {
    const state = van.state("idle"); // "idle" | "loading" | "refused" | "warned" (undone, with a warning)
    const reason = van.state("");
    const washed = van.state(false);
    const id = () => data.val.id;
    const detailId = `change-group-${++opened}`;
    const isOpen = () => openId.val === id();
    // "N more" stays as the player left it while the log refreshes (a save, an undo).
    let moreOpen = false;
    const left = () => data.val.entries.filter((entry) => !entry.undone);
    const characters = () => [...new Set(data.val.entries.map((entry) => entry.character).filter(Boolean))];

    const undo = async () => {
        if (state.val === "loading") return;
        state.val = "loading";
        reason.val = "";
        try {
            // The log is read again once it lands (changesVersion), so the line shows what the game holds now.
            const { warning } = await undoAction(id());
            reason.val = warning ?? "";
            state.val = warning ? "warned" : "idle";
            washed.val = true;
            setTimeout(() => (washed.val = false), WASH_MS);
        } catch (error) {
            reason.val = sentence(error?.message || "not undone");
            state.val = "refused";
        }
    };

    const undoButton = button(
        {
            type: "button",
            class: "account-btn btn-quiet btn-sm change-group__button",
            // Stays while it runs (busy, not gone), so a refusal leaves focus where it was.
            hidden: () => !left().length,
            "aria-disabled": () => String(state.val === "loading"),
            "aria-label": () =>
                `${data.val.entries.length === 1 ? "Undo" : "Undo all"}: ${data.val.label || data.val.page || "change"} at ${clock(data.val.time)}`,
            onclick: () => void undo(),
        },
        Icons.Undo({ class: "undo-all__icon" }),
        () => span(data.val.entries.length === 1 ? "Undo" : "Undo all")
    );
    const opener = button(
        {
            type: "button",
            class: "row-opener change-group__head",
            "aria-expanded": () => String(isOpen()),
            "aria-controls": detailId,
            onclick: () => (openId.val = isOpen() ? null : id()),
        },
        time({ class: "change-group__time", datetime: () => new Date(data.val.time).toISOString() }, () =>
            clock(data.val.time)
        ),
        span(
            { class: "account-row__titles change-group__titles" },
            span({ class: "account-row__bonus change-group__label" }, () => data.val.label || data.val.page || "WebUI"),
            span({ class: "account-row__name change-group__where" }, () =>
                [
                    data.val.label ? data.val.page || "WebUI" : "",
                    values(data.val.entries.length),
                    characters().length === 1 ? characters()[0] : "",
                ]
                    .filter(Boolean)
                    .join(" · ")
            )
        ),
        // A single plain value's change reads on the line itself ("8 → 7"); a list or object, or several values,
        // only opens under it: the page and the count under the name already say what happened.
        span({ class: "change-group__change" }, () => {
            const [entry] = data.val.entries;
            if (data.val.entries.length !== 1 || !entry.hasBefore || !isPlain(entry.before) || !isPlain(entry.after))
                return span();
            const before = readable(entry.before);
            const after = readable(entry.after);
            return span(
                { title: `${before.full} → ${after.full}` },
                span({ class: "change-group__before" }, before.text),
                span({ class: "change-entry__arrow" }, "→"),
                span({ class: "change-group__after" }, after.text)
            );
        })
    );

    // Once all of it is undone the button goes: focus moves to the line's opener, never back to the top of the page.
    van.derive(() => {
        if (!left().length && document.activeElement === undoButton) opener.focus({ preventScroll: true });
    });

    const row = AccountRow({
        rowClass: () =>
            joinClasses(
                "change-group",
                isOpen() && "is-open",
                !left().length && "is-all-undone",
                washed.val && "is-undone",
                state.val === "refused" && "is-refused"
            ),
        info: opener,
        controls: [
            span({ class: "change-group__reason", role: "status", title: () => reason.val }, () =>
                state.val === "refused" || state.val === "warned"
                    ? reason.val
                    : state.val === "loading"
                      ? "Saving…"
                      : left().length
                        ? ""
                        : `Undone${data.val.undoneAt ? ` ${hhmm(data.val.undoneAt)}` : ""}`
            ),
            undoButton,
        ],
    });
    row.append(
        // Drawn closed too (hidden), so its values stay with the line for search and screen readers.
        div({ id: detailId, class: "row-detail change-group__open", hidden: () => !isOpen() }, () => {
            const partly = left().length > 0 && left().length < data.val.entries.length;
            const entries = data.val.entries.map((entry) => Entry(entry, characters().length === 1, partly));
            const more = entries.splice(SHOWN);
            return div(
                { class: "change-group__entries" },
                ...entries,
                more.length
                    ? details(
                          { class: "change-group__more", open: moreOpen, ontoggle: (e) => (moreOpen = e.target.open) },
                          summary(
                              { class: "change-group__more-toggle" },
                              Icons.Chevron({ dir: "right", class: "group-chevron" }),
                              `${more.length} more`
                          ),
                          ...more
                      )
                    : null
            );
        })
    );
    return row;
};

export const History = () => {
    const loaded = van.state(false);
    const failed = van.state("");
    const count = van.state(0);
    const openId = van.state(null);
    const groups = new Map();
    const list = div({ class: "change-log" });

    // Lines keep their node (and Undo its focus) as the log grows; new actions go on top.
    const sync = (actions) => {
        for (const action of actions) {
            const group = groups.get(action.id);
            if (group) group.data.val = action;
            else {
                const data = van.state(action);
                groups.set(action.id, { data, node: Group(data, openId) });
            }
        }
        const ids = new Set(actions.map((action) => action.id));
        for (const [id, group] of groups)
            if (!ids.has(id)) {
                group.node.remove();
                groups.delete(id);
            }
        if (!ids.has(openId.val)) openId.val = null;
        let at = list.firstChild;
        for (const action of actions) {
            const node = groups.get(action.id).node;
            if (node === at) at = at.nextSibling;
            else list.insertBefore(node, at);
        }
        count.val = actions.length;
    };

    // Reads can overlap (a save during a read); only the newest one's answer is shown.
    let newest = 0;
    const load = async () => {
        const ticket = ++newest;
        try {
            const { actions } = await fetchChanges();
            if (ticket !== newest) return;
            sync(actions);
            failed.val = "";
        } catch (error) {
            if (ticket === newest) failed.val = error?.message || "Try again.";
        } finally {
            if (ticket === newest) loaded.val = true;
        }
    };

    // Read the log when the page opens and whenever a save or an undo changed it.
    van.derive(() => {
        changesVersion.val;
        if (store.app.activeTab === VIEWS.HISTORY.id) void load();
    });

    return div(
        { id: VIEWS.HISTORY.id, class: "tab-pane account-tab-layout" },
        div(
            { class: "account-sub-tab-content" },
            div(
                { class: "account-sub-tab-pane active history-pane" },
                AccountTabHeader({
                    title: "Changes",
                    description:
                        "Every value saved from these pages this game session, newest first. Undo puts the old values back on the character they were saved on.",
                }),
                () =>
                    failed.val
                        ? EmptyState({ failed: true, title: "Couldn't read the history", subtitle: failed.val })
                        : loaded.val && !count.val
                          ? EmptyState({
                                title: "No changes yet",
                                subtitle: "Values you save on any page show here, ready to undo.",
                            })
                          : span(),
                div({ class: "history-panel", hidden: () => !count.val }, ListPanel({ body: list }))
            )
        )
    );
};
