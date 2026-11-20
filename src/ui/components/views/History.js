/**
 * History › Changes (#31): every value a page saved this game session, newest first, grouped by the action that
 * saved it (a field, a button, a bulk action). Each group puts its old values back with Undo / Undo all, on the
 * character each value was saved on. Save copies (#32) get the next tab in this area.
 */
import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { VIEWS } from "../../state/constants.js";
import { Icons } from "../../assets/icons.js";
import { fetchChanges } from "../../services/api.js";
import { changesVersion } from "../../services/changeLog.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";
import { EmptyState } from "../EmptyState.js";
import { undoAction } from "./account/undo.js";

const { div, span, button, time, details, summary } = van.tags;

const WASH_MS = 800;
// A bulk action lists this many values; the rest open under "N more".
const SHOWN = 6;

const clock = (at) => new Date(at).toLocaleTimeString([], { hour12: false });

/** A value as History shows it: numbers exact, anything else as JSON, long ones cut (the title has it all). */
const shown = (value) => {
    if (value === undefined) return { text: "—", full: "nothing" };
    const full = typeof value === "number" ? String(value) : JSON.stringify(value);
    return { text: full.length > 28 ? `${full.slice(0, 27)}…` : full, full };
};

const Entry = (entry, oneCharacter, partly) => {
    const before = shown(entry.hasBefore ? entry.before : undefined);
    const after = shown(entry.after);
    return div(
        { class: `change-entry ${entry.undone ? "is-undone-entry" : ""}` },
        span({ class: "change-entry__path", title: entry.path }, entry.path),
        span(
            { class: "change-entry__values" },
            span({ class: "change-entry__before", title: before.full }, before.text),
            span({ class: "change-entry__arrow" }, "→"),
            span({ class: "change-entry__after", title: after.full }, after.text)
        ),
        span(
            { class: "change-entry__who" },
            entry.undone && partly ? "undone" : oneCharacter ? "" : (entry.character ?? "")
        )
    );
};

/** One action: when, where, what it was, its values, and Undo / Undo all. */
const Group = (data) => {
    const state = van.state("idle"); // "idle" | "loading" | "refused"
    const reason = van.state("");
    const washed = van.state(false);
    // "N more" stays as the player left it while the log refreshes (a save, an undo).
    let moreOpen = false;
    const left = () => data.val.entries.filter((entry) => !entry.undone);
    const characters = () => [...new Set(data.val.entries.map((entry) => entry.character).filter(Boolean))];

    const undo = async () => {
        if (state.val === "loading") return;
        state.val = "loading";
        try {
            await undoAction(data.val.id);
            state.val = "idle";
            washed.val = true;
            setTimeout(() => (washed.val = false), WASH_MS);
        } catch (error) {
            reason.val = error?.message || "not undone";
            state.val = "refused";
        }
    };

    return div(
        {
            class: () =>
                [
                    "change-group",
                    left().length ? "" : "is-all-undone",
                    washed.val ? "is-undone" : "",
                    state.val === "refused" ? "is-refused" : "",
                ].join(" "),
        },
        div(
            { class: "change-group__head" },
            time({ class: "change-group__time" }, () => clock(data.val.time)),
            span({ class: "change-group__page" }, () => data.val.page || "WebUI"),
            span({ class: "change-group__label" }, () => data.val.label),
            span({ class: "change-group__count" }, () => {
                const count = data.val.entries.length;
                return `${count} ${count === 1 ? "value" : "values"}`;
            }),
            span({ class: "change-group__who" }, () => (characters().length === 1 ? characters()[0] : "")),
            span(
                { class: "change-group__undo" },
                span({ class: "change-group__reason", role: "status" }, () =>
                    state.val === "refused"
                        ? reason.val
                        : state.val === "loading"
                          ? "saving…"
                          : left().length
                            ? ""
                            : `undone ${data.val.undoneAt ? clock(data.val.undoneAt) : ""}`.trim()
                ),
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm undo-all__button change-group__button",
                        // Stays while it runs (busy, not gone), so a refusal leaves focus where it was.
                        hidden: () => !left().length,
                        "aria-disabled": () => String(state.val === "loading"),
                        title: () =>
                            `Put back the ${left().length === 1 ? "value" : `${left().length} values`} this changed`,
                        onclick: () => void undo(),
                    },
                    Icons.Undo({ class: "undo-all__icon" }),
                    () => span(data.val.entries.length === 1 ? "Undo" : "Undo all")
                )
            )
        ),
        () => {
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
        }
    );
};

export const History = () => {
    const loaded = van.state(false);
    const failed = van.state("");
    const count = van.state(0);
    const groups = new Map();
    const list = div({ class: "change-log" });

    // Groups keep their node (and Undo its focus) as the log grows; new actions go on top.
    const sync = (actions) => {
        for (const action of actions) {
            const group = groups.get(action.id);
            if (group) group.data.val = action;
            else {
                const data = van.state(action);
                groups.set(action.id, { data, node: Group(data) });
            }
        }
        const ids = new Set(actions.map((action) => action.id));
        for (const [id, group] of groups)
            if (!ids.has(id)) {
                group.node.remove();
                groups.delete(id);
            }
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
            if (ticket === newest) failed.val = error?.message || "The change log couldn't be read.";
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
                    title: "HISTORY - CHANGES",
                    description:
                        "Every value saved from these pages this game session, newest first. Undo puts the old values back on the character they were saved on.",
                }),
                () =>
                    failed.val
                        ? EmptyState({ failed: true, title: "HISTORY NOT READ", subtitle: failed.val })
                        : loaded.val && !count.val
                          ? EmptyState({
                                title: "NO CHANGES YET",
                                subtitle: "Values you save on any page show here, ready to undo.",
                            })
                          : span(),
                list
            )
        )
    );
};
