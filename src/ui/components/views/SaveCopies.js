/**
 * History › Save copies (#32): the copies of the save the injector keeps (one per cloud save), newest first. Opening a
 * copy of the character in play compares it with the save now, one box per save key; the values the game moves by
 * itself wait in one closed box. Restore puts a key's values back (or all of them) through writeManyVerified, so the
 * restore is one action in Changes ("Restored Cards from 18:36") and Undo takes it back.
 */
import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { VIEWS } from "../../state/constants.js";
import { Icons } from "../../assets/icons.js";
import { compareSaveCopy, fetchSaveCopies, saveCopyWrites } from "../../services/api.js";
import { withAction } from "../../services/changeLog.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";
import { NO_CHARACTER, readCharacterInPlay, writeManyVerified } from "./account/accountShared.js";
import { clearCaches, undoAction } from "./account/undo.js";
import { EmptyState } from "../EmptyState.js";
import { SHOWN, shown } from "./History.js";

const { div, span, button, time } = van.tags;

// The newest copies show; the rest open under "N older".
const COPIES_SHOWN = 12;

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

/**
 * Put back a copy's selected values ("all" or paths from the compare) as one action named `label`, on the copy's
 * character only. Resolves to { action, warning } (action null when nothing differed any more); a write that
 * failed rejects with the Error, carrying the action its landed values were logged under.
 */
export const restoreCopy = async (copy, select, label) => {
    const { writes } = await saveCopyWrites(copy.id, select);
    if (!writes.length) return { action: null };
    let action = null;
    try {
        await withAction({ label }, (made) => {
            action = made;
            return writeManyVerified(writes, { character: copy.character });
        });
    } catch (error) {
        error.action = action;
        throw error;
    }
    const cleared = await clearCaches(writes.map((write) => write.path.replace(/^gga\./, "")));
    return { action, warning: cleared ? null : "Restored. Totals may be off. Refresh." };
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
    const status = van.state(""); // what the last restore or undo did
    const refused = van.state(false);
    const lastAction = van.state(null);
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
        const label = `Restored ${name} from ${copyName(copy.time)}`;
        try {
            const { action, warning } = await restoreCopy(copy, select, label);
            lastAction.val = action;
            status.val = action ? (warning ?? `Restored ${name}.`) : "Nothing left to restore.";
        } catch (error) {
            lastAction.val = error.action?.entries ? error.action : null;
            const missed = (error.results ?? []).filter((entry) => !entry.ok).length;
            status.val = missed
                ? `${missed} of ${error.results.length} not restored.`
                : error?.message || "Couldn't restore. Try again.";
            refused.val = true;
        } finally {
            busy.val = "";
            onRestored();
            await read();
            keepFocus();
        }
    };

    const undo = async () => {
        const action = lastAction.val;
        if (!action || busy.val) return;
        busy.val = "undo";
        try {
            const { warning } = await undoAction(action.id);
            status.val = warning ?? "Undone.";
            refused.val = false;
            lastAction.val = null;
        } catch (error) {
            status.val = `Not undone: ${error?.message || "try again"}.`;
            refused.val = true;
        } finally {
            busy.val = "";
            await read();
            keepFocus();
        }
    };

    const undoButton = button(
        {
            type: "button",
            class: "btn-quiet btn-sm save-copy__undo",
            hidden: () => !lastAction.val,
            "aria-disabled": () => String(Boolean(busy.val)),
            title: "Put back the values this restore changed",
            onclick: () => void undo(),
        },
        Icons.Undo({ class: "undo-all__icon" }),
        span("Undo")
    );
    // The compare is drawn again after a restore or undo, so the button pressed may be gone: focus goes to Undo, or to
    // the first box's line, never back to the top of the page.
    const keepFocus = () => {
        if (!document.body || document.activeElement !== document.body) return;
        const next = lastAction.val ? undoButton : node.querySelector("button");
        next?.focus();
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
            span({ class: () => `save-copy__status ${refused.val ? "is-refused" : ""}`, role: "status" }, () =>
                busy.val === "undo" ? "saving…" : status.val
            ),
            undoButton,
            () => {
                // Everything but the game's own progress: that keeps moving, so an undo of it would be refused at
                // once ("changed since"), and it stays restorable key by key in its box.
                const paths = (result.val?.groups ?? []).flatMap((group) =>
                    group.changes.filter((change) => change.restorable && !change.onItsOwn).map((change) => change.path)
                );
                return paths.length
                    ? restoreButton(
                          paths,
                          "all",
                          `Put back every value outside "Changed on its own" as at ${hhmm(copy.time)}`
                      )
                    : span();
            }
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
    const olderOpen = van.state(false);
    const olderCount = van.state(0);
    const list = div({ class: "change-log save-copies" });
    const olderList = div({ class: "change-log", hidden: () => !olderOpen.val });

    // Rows keep their node (an open compare, focus) when the list is read again; new copies go on top.
    const rows = new Map();
    const sync = (all) => {
        const ids = new Set(all.map((copy) => copy.id));
        for (const [id, node] of rows)
            if (!ids.has(id)) {
                node.remove();
                rows.delete(id);
            }
        all.forEach((copy, i) => {
            if (!rows.has(copy.id))
                rows.set(
                    copy.id,
                    CopyRow(copy, active, openId, () => void load())
                );
            const into = i < COPIES_SHOWN ? list : olderList;
            const at = into.children[i < COPIES_SHOWN ? i : i - COPIES_SHOWN] ?? null;
            if (at !== rows.get(copy.id)) into.insertBefore(rows.get(copy.id), at);
        });
        olderCount.val = Math.max(0, all.length - COPIES_SHOWN);
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
                    description:
                        "A copy of the save at every cloud save, kept on this PC. Open one to see copy → now and put values back.",
                }),
                () =>
                    warning.val
                        ? div({ class: "save-copy__warning", role: "status" }, Icons.Warning(), span(warning.val))
                        : span(),
                () =>
                    loaded.val && !failed.val && count.val && active.val === null
                        ? div(
                              { class: "save-copy__note save-copies__none" },
                              "No character in play. Pick one to compare."
                          )
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
                list,
                div(
                    { class: "save-copies__older", hidden: () => !olderCount.val },
                    button(
                        {
                            type: "button",
                            class: "change-group__more-toggle save-key__more",
                            "aria-expanded": () => String(olderOpen.val),
                            onclick: () => (olderOpen.val = !olderOpen.val),
                        },
                        Icons.Chevron({ dir: "right", class: "group-chevron" }),
                        () => span(`${olderCount.val} older`)
                    ),
                    olderList
                )
            )
        )
    );
};
