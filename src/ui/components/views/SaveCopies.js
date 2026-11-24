/**
 * History › Save copies (#32): the copies of the save the injector keeps (one per cloud save), newest first. Opening a
 * copy of the character in play compares it with the save now, one box per save key; the values the game moves by
 * itself wait in one closed box. Restore puts a key's values back, or all of them. A restore is a fork, not an undo:
 * the injector copies the save first ("Before restore") and after ("Restored from 18:36 (Cards)"), and going back is
 * restoring "Before restore" like any other copy.
 */
import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { VIEWS } from "../../state/constants.js";
import { Icons } from "../../assets/icons.js";
import { compareSaveCopy, fetchSaveCopies, restoreSaveCopy } from "../../services/api.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";
import { NO_CHARACTER, readCharacterInPlay } from "./account/accountShared.js";
import { clearCaches } from "./account/undo.js";
import { EmptyState } from "../EmptyState.js";
import { SHOWN, shown } from "./History.js";

const { div, span, button, time } = van.tags;

const dayKey = (at) => new Date(at).toDateString();
/** A day's name in the list: "Today", "Yesterday", then the date ("Nov 22"). */
const dayName = (at) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dayKey(at) === dayKey(Date.now())) return "Today";
    if (dayKey(at) === yesterday.toDateString()) return "Yesterday";
    return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
};

const MINUTE = 60e3;
const ago = (at) => {
    const minutes = Math.floor((Date.now() - at) / MINUTE);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? "yesterday" : `${days} days ago`;
};
const hhmm = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
/** How a restore names its copy: the time, and the day too once it isn't today's. */
export const copyName = (at) =>
    new Date(at).toDateString() === new Date().toDateString()
        ? hhmm(at)
        : `${new Date(at).toLocaleDateString([], { day: "numeric", month: "short" })} ${hhmm(at)}`;

const values = (n) => `${n} ${n === 1 ? "value" : "values"}`;

/** What a restore's own copy says in the list; "" for a copy of a cloud save. */
export const labelText = (label) =>
    label?.kind === "before"
        ? "Before restore"
        : label?.kind === "restored"
          ? `Restored from ${label.from ? copyName(label.from) : "a copy"} (${label.what})`
          : "";

/**
 * Put back a copy's selected values ("all" or paths from the compare), on the copy's character only. Resolves to the
 * server's answer ({ ok, results, before, after }, `before` null when nothing differed any more) with `warning` when
 * the game's cached totals weren't cleared. A gem bought a moment ago refuses the whole restore ("changed since").
 */
export const restoreCopy = async (copy, select) => {
    const answer = await restoreSaveCopy(copy.id, select);
    // The values that landed (or that the game kept differently) change the totals built from them.
    const cleared = await clearCaches(
        answer.results
            .filter((result) => result.ok || result.error === "Write mismatch")
            .map((result) => result.path.replace(/^gga\./, ""))
    );
    return { ...answer, warning: cleared ? null : "Restored. Totals may be off. Refresh." };
};

/** The compare's boxes: the player's own changes by key, and the values the game moved by itself by key. */
const sortGroups = (groups) => {
    const own = [];
    const itself = [];
    for (const { key, changes } of groups) {
        const mine = changes.filter((change) => !change.onItsOwn);
        const moved = changes.filter((change) => change.onItsOwn);
        if (mine.length) own.push({ key, changes: mine });
        if (moved.length) itself.push({ key, changes: moved });
    }
    return { own, itself };
};

/** Why a key's values stay as they are, when none of them can be restored; "" when some can. */
const keptBecause = (changes) => {
    if (changes.some((change) => change.restorable)) return "";
    if (changes.some((change) => change.gemsBought)) return "Kept. Gems were bought since this copy.";
    if (changes.every((change) => change.neverRestored)) return "Never restored. The game keeps count of these.";
    return "Can't be restored.";
};

// A key with some values kept marks those; a key kept whole says why once, on its line.
const Value = (change, markKept) => {
    const before = shown(change.copy);
    const after = shown(change.now);
    return div(
        { class: `change-entry ${change.restorable ? "" : "is-kept-entry"}` },
        span({ class: "change-entry__path", title: change.path }, change.path),
        span(
            { class: "change-entry__values" },
            span({ class: "change-entry__before", title: before.full }, before.text),
            span({ class: "change-entry__arrow" }, "→"),
            span({ class: "change-entry__after", title: after.full }, after.text)
        ),
        span({ class: "change-entry__who" }, markKept && !change.restorable ? "kept" : "")
    );
};

/** A box that opens: a head (its toggle, then `extra`), and `body()` drawn while open. */
const Box = ({ name, note = "", extra = null, open, body, className = "" }) => {
    const id = `save-key-${Math.random().toString(36).slice(2)}`;
    return div(
        { class: () => `save-key ${className} ${open.val ? "is-open" : ""}` },
        div(
            { class: "save-key__head" },
            button(
                {
                    type: "button",
                    class: "save-key__toggle",
                    "aria-expanded": () => String(open.val),
                    "aria-controls": id,
                    onclick: () => (open.val = !open.val),
                },
                Icons.Chevron({ dir: "right", class: "group-chevron save-key__chevron" }),
                span({ class: "save-key__name" }, name),
                span({ class: "save-key__count" }, note)
            ),
            extra
        ),
        div({ id, class: "save-key__body", hidden: () => !open.val }, () => (open.val ? body() : span()))
    );
};

const Values = (changes, markKept) => {
    const rows = changes.map((change) => Value(change, markKept));
    const more = rows.splice(SHOWN);
    const moreOpen = van.state(false);
    return div(
        { class: "change-group__entries" },
        ...rows,
        more.length
            ? div(
                  button(
                      {
                          type: "button",
                          class: "change-group__more-toggle save-key__more",
                          "aria-expanded": () => String(moreOpen.val),
                          onclick: () => (moreOpen.val = !moreOpen.val),
                      },
                      Icons.Chevron({ dir: "right", class: "group-chevron" }),
                      `${more.length} more`
                  ),
                  () => (moreOpen.val ? div(...more) : span())
              )
            : null
    );
};

/** One opened copy: what differs from the save now, by key, with Restore per key and Restore all. */
const CopyBody = (copy, onRestored) => {
    const result = van.state(null); // { groups } once read
    const failed = van.state("");
    const busy = van.state(""); // the select being restored ("all" or a key), "" when none
    const status = van.state(""); // what the last restore did
    const refused = van.state(false);
    // Boxes stay as the player left them when the compare is read again after a restore.
    const opened = new Map();
    const openState = (name) => {
        if (!opened.has(name)) opened.set(name, van.state(false));
        return opened.get(name);
    };

    // Reads can overlap (a restore's read and a reopened tab's); only the newest one's answer is shown.
    let newest = 0;
    const read = async () => {
        const ticket = ++newest;
        try {
            const { groups } = await compareSaveCopy(copy.id);
            if (ticket !== newest) return;
            result.val = { groups };
            failed.val = "";
        } catch (error) {
            if (ticket !== newest) return;
            failed.val = /taken while playing/.test(error?.message ?? "")
                ? `Switch to ${copy.character} to compare.`
                : error?.message || "Couldn't read the save. Try again.";
        }
    };

    const restore = async (select, name) => {
        if (busy.val) return;
        busy.val = name;
        refused.val = false;
        status.val = "";
        const what = name === "all" ? "everything" : name;
        try {
            const { ok, results, before, afterError, warning } = await restoreCopy(copy, select);
            const missed = results.filter((entry) => !entry.ok).length;
            refused.val = !ok;
            status.val = !before
                ? "Nothing left to restore."
                : results.some((entry) => entry.error === "changed since")
                  ? "Gems came in just now. Try again."
                  : missed === results.length
                    ? "Couldn't restore. Try again."
                    : `${missed ? `${missed} of ${results.length} not restored. ` : ""}${warning ?? `Restored ${what}.`} To go back, restore "Before restore".${afterError ? " The copy after it couldn't be saved." : ""}`;
        } catch (error) {
            status.val = error?.message || "Couldn't restore. Try again.";
            refused.val = true;
        } finally {
            busy.val = "";
            onRestored();
            await read();
            keepFocus();
        }
    };

    // The compare is drawn again after a restore, so the button pressed may be gone: focus goes to the first box's
    // line, never back to the top of the page.
    const keepFocus = () => {
        if (!document.body || document.activeElement !== document.body) return;
        node.querySelector("button")?.focus();
    };

    const restoreButton = (select, name, title) =>
        button(
            {
                type: "button",
                class: "btn-quiet btn-sm save-key__restore",
                // Stays while it runs (busy, not gone), so a refusal leaves focus where it was.
                "aria-disabled": () => String(Boolean(busy.val)),
                title,
                onclick: () => void restore(select, name),
            },
            Icons.Undo({ class: "undo-all__icon" }),
            () => span(busy.val === name ? "saving…" : name === "all" ? "Restore all" : "Restore")
        );

    const keyBox = ({ key, changes }, prefix) => {
        const restorable = changes.filter((change) => change.restorable);
        const why = keptBecause(changes);
        return Box({
            name: key,
            note: values(changes.length),
            open: openState(`${prefix}${key}`),
            className: why ? "is-kept" : "",
            extra: why
                ? span({ class: "save-key__why" }, why)
                : restoreButton(
                      restorable.map((change) => change.path),
                      key,
                      `Put back ${values(restorable.length)} as they were at ${hhmm(copy.time)}`
                  ),
            body: () => Values(changes, !why),
        });
    };

    void read();
    const node = div(
        { class: "save-copy__body" },
        () => {
            if (failed.val) return div({ class: "save-copy__note is-failed", role: "status" }, failed.val);
            if (!result.val) return div({ class: "save-copy__note" }, "Reading the save…");
            const { own, itself } = sortGroups(result.val.groups);
            const total = result.val.groups.reduce((sum, group) => sum + group.changes.length, 0);
            if (!total) return div({ class: "save-copy__note" }, "Same as the save now.");
            const moved = itself.reduce((sum, group) => sum + group.changes.length, 0);
            return div(
                { class: "save-copy__keys" },
                own.length
                    ? div(...own.map((group) => keyBox(group, "")))
                    : div({ class: "save-copy__note" }, "Only the game's own progress differs."),
                itself.length
                    ? Box({
                          name: "Changed on its own",
                          note: values(moved),
                          open: openState("\u0000itself"),
                          className: "is-itself",
                          body: () => div({ class: "save-copy__itself" }, ...itself.map((g) => keyBox(g, "own:"))),
                      })
                    : null
            );
        },
        div(
            { class: "save-copy__bar", hidden: () => !result.val || failed.val },
            span(
                { class: () => `save-copy__status ${refused.val ? "is-refused" : ""}`, role: "status" },
                () => status.val
            ),
            () =>
                result.val?.groups.some((group) => group.changes.some((change) => change.restorable))
                    ? restoreButton("all", "all", `Put back every value as it was at ${hhmm(copy.time)}`)
                    : span()
        )
    );
    return node;
};

/** One copy in the list: when and whose. The character in play's copies open to their compare. */
const CopyRow = (copy, active, openId, onRestored) => {
    const mine = () => active.val !== null && copy.character === active.val;
    const isOpen = () => openId.val === copy.id && mine();
    let body = null;
    const bodyId = `save-copy-${copy.id}`;
    const when = [
        time({ class: "change-group__time save-copy__ago", datetime: new Date(copy.time).toISOString() }, () =>
            ago(copy.time)
        ),
        span({ class: "change-group__time" }, hhmm(copy.time)),
        copy.label ? span({ class: "save-copy__label" }, labelText(copy.label)) : null,
    ];
    return div(
        { class: () => `change-group save-copy ${mine() ? "" : "is-other"} ${isOpen() ? "is-open" : ""}` },
        () =>
            mine()
                ? button(
                      {
                          type: "button",
                          class: "change-group__head save-copy__head",
                          "aria-expanded": () => String(isOpen()),
                          "aria-controls": bodyId,
                          onclick: () => (openId.val = isOpen() ? null : copy.id),
                      },
                      Icons.Chevron({ dir: "right", class: "group-chevron save-copy__chevron" }),
                      ...when,
                      span({ class: "change-group__who" }, copy.character)
                  )
                : div(
                      { class: "change-group__head save-copy__head" },
                      ...when,
                      span({ class: "change-group__who" }, copy.character),
                      span(
                          { class: "save-copy__hint" },
                          active.val === null ? "" : `Switch to ${copy.character} to compare`
                      )
                  ),
        div({ id: bodyId, class: "save-copy__open", hidden: () => !isOpen() }, () => {
            if (!isOpen()) {
                body = null;
                return span();
            }
            body ??= CopyBody(copy, onRestored);
            return body;
        })
    );
};

export const SaveCopies = () => {
    const loaded = van.state(false);
    const failed = van.state("");
    const warning = van.state("");
    const count = van.state(0);
    const active = van.state(null);
    const openId = van.state(null);
    const list = div({ class: "save-copies" });

    // One folding group per day, newest first; today's starts open. A group keeps its node (and whether the player
    // opened it) when the list is read again.
    const days = new Map();
    const dayGroup = (key, today) => {
        if (days.has(key)) return days.get(key);
        const open = van.state(today);
        const name = van.state("");
        const copies = van.state(0);
        const rows = div({ class: "change-log", hidden: () => !open.val });
        const node = div(
            { class: "save-copies__day" },
            button(
                {
                    type: "button",
                    class: "save-copies__day-toggle",
                    "aria-expanded": () => String(open.val),
                    onclick: () => (open.val = !open.val),
                },
                Icons.Chevron({ dir: "right", class: "group-chevron" }),
                span({ class: "save-copies__day-name" }, () => name.val),
                span({ class: "save-copies__day-count" }, () => `${copies.val} ${copies.val === 1 ? "copy" : "copies"}`)
            ),
            rows
        );
        days.set(key, { node, rows, name, copies });
        return days.get(key);
    };

    // Rows keep their node (an open compare, focus) when the list is read again; new copies go on top.
    const rows = new Map();
    const place = (into, node, i) => {
        const at = into.children[i] ?? null;
        if (at !== node) into.insertBefore(node, at);
    };
    const sync = (all) => {
        const ids = new Set(all.map((copy) => copy.id));
        for (const [id, node] of rows)
            if (!ids.has(id)) {
                node.remove();
                rows.delete(id);
            }
        const byDay = new Map();
        for (const copy of all) {
            if (!byDay.has(dayKey(copy.time))) byDay.set(dayKey(copy.time), []);
            byDay.get(dayKey(copy.time)).push(copy);
        }
        for (const [key, group] of days)
            if (!byDay.has(key)) {
                group.node.remove();
                days.delete(key);
            }
        [...byDay].forEach(([key, copies], i) => {
            const group = dayGroup(key, key === dayKey(Date.now()));
            group.name.val = dayName(copies[0].time);
            group.copies.val = copies.length;
            place(list, group.node, i);
            copies.forEach((copy, j) => {
                if (!rows.has(copy.id))
                    rows.set(
                        copy.id,
                        CopyRow(copy, active, openId, () => void load())
                    );
                place(group.rows, rows.get(copy.id), j);
            });
        });
    };

    let newest = 0;
    const load = async () => {
        const ticket = ++newest;
        try {
            const [saved, inPlay] = await Promise.all([
                fetchSaveCopies(),
                readCharacterInPlay().catch((error) => {
                    if (error.message === NO_CHARACTER) return null;
                    throw error;
                }),
            ]);
            if (ticket !== newest) return;
            active.val = inPlay;
            sync(saved.copies);
            count.val = saved.copies.length;
            warning.val = saved.warning ?? "";
            failed.val = "";
        } catch (error) {
            if (ticket === newest) failed.val = error?.message || "The save copies couldn't be read.";
        } finally {
            if (ticket === newest) loaded.val = true;
        }
    };

    // Read the list whenever the tab opens: a copy comes every few minutes, and a restore or undo elsewhere changes
    // what an open compare shows, so it closes.
    van.derive(() => {
        if (store.app.activeTab !== VIEWS.SAVE_COPIES.id) return;
        openId.val = null;
        void load();
    });

    return div(
        { id: VIEWS.SAVE_COPIES.id, class: "tab-pane account-tab-layout" },
        div(
            { class: "account-sub-tab-content" },
            div(
                { class: "account-sub-tab-pane active history-pane" },
                AccountTabHeader({
                    title: "HISTORY - SAVE COPIES",
                    description: "Copies of your save from every cloud save. Open one to compare and restore.",
                }),
                () =>
                    warning.val
                        ? div({ class: "save-copy__warning", role: "status" }, Icons.Warning(), span(warning.val))
                        : span(),
                () =>
                    loaded.val && !failed.val && count.val && active.val === null
                        ? div({ class: "save-copy__note save-copies__none" }, `${NO_CHARACTER} Pick one to compare.`)
                        : span(),
                () =>
                    failed.val
                        ? EmptyState({ failed: true, title: "SAVE COPIES NOT READ", subtitle: failed.val })
                        : loaded.val && !count.val
                          ? EmptyState({
                                title: "NO SAVE COPIES YET",
                                subtitle:
                                    "The game saves to the cloud every few minutes. Each save leaves a copy here.",
                            })
                          : span(),
                list
            )
        )
    );
};
