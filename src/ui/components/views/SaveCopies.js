/**
 * History › Save copies (#32): the copies of the save the injector keeps (one per cloud save), as a timeline. Each line
 * is one copy of the character in play: its time and what changed since the copy before it ("Cards, Stamps, 3 more"),
 * grouped by day, today's open. Other characters' copies wait in one folded group at the end.
 *
 * Opening a copy compares it with the save now, one line per save key, the values the game moves by itself in one
 * closed line. Restore puts a key's values back, Restore all all of them. A restore is a fork, not an undo: the
 * injector copies the save first ("Before restore") and after ("Restored from 18:36"), and going back is restoring
 * "Before restore" like any other copy.
 */
import van from "../../vendor/van-1.6.0.js";
import store from "../../state/store.js";
import { VIEWS } from "../../state/constants.js";
import { Icons } from "../../assets/icons.js";
import { compareSaveCopy, fetchCopiesSince, fetchSaveCopies, restoreSaveCopy } from "../../services/api.js";
import { AccountTabHeader } from "./account/components/AccountTabHeader.js";
import { AccountRow } from "./account/components/AccountRow.js";
import { ListPanel } from "./account/tabShared.js";
import { NO_CHARACTER, readCharacterInPlay } from "./account/accountShared.js";
import { clearCaches } from "./account/undo.js";
import { EmptyState } from "../EmptyState.js";
import { SHOWN, shown } from "./History.js";

const { div, span, button, time } = van.tags;

const dayKey = (at) => new Date(at).toDateString();
const isToday = (at) => dayKey(at) === dayKey(Date.now());
/** A day's name in the list: "Today", "Yesterday", then the date ("Nov 22"). */
const dayName = (at) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (isToday(at)) return "Today";
    if (dayKey(at) === yesterday.toDateString()) return "Yesterday";
    return new Date(at).toLocaleDateString([], { month: "short", day: "numeric" });
};

const MINUTE = 60e3;
const ago = (at) => {
    const minutes = Math.floor((Date.now() - at) / MINUTE);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)} h ago`;
};
const hhmm = (at) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
/** How a restore names its copy: the time, and the day too once it isn't today's. */
export const copyName = (at) =>
    isToday(at) ? hhmm(at) : `${new Date(at).toLocaleDateString([], { day: "numeric", month: "short" })} ${hhmm(at)}`;

const values = (n) => `${n} ${n === 1 ? "value" : "values"}`;
const copies = (n) => `${n} ${n === 1 ? "copy" : "copies"}`;

// The game's names for the save keys a player changes, as the menu names their systems; any other key is split at
// its capitals ("AchieveReg" → "Achieve reg").
// ponytail: the keys players touch most; a key missing here still reads, only less nicely.
const KEY_NAMES = {
    AnvilPA: "Anvil production",
    AnvilPAstats: "Anvil stats",
    ArcadeUpg: "Arcade Shop",
    Atoms: "Atom Collider",
    BribeStatus: "Bribes",
    CauldronBubbles: "Bubbles",
    CauldronInfo: "Cauldrons",
    CauldronP2W: "Pay 2 Win",
    ChestMap: "Storage items",
    ChestQuantity: "Storage amounts",
    CogMap: "Cogs",
    CurrenciesOwned: "Currencies",
    Dream: "Equinox",
    EquipmentMap: "Equipment",
    Exp0: "EXP",
    FarmCrop: "Crops",
    FarmPlot: "Farming plots",
    FarmRank: "Farming ranks",
    FarmUpg: "Farming upgrades",
    ForgeItemQuantity: "Forge",
    GemItemsPurchased: "Gem shop",
    GemsOwned: "Gems",
    GemsPacksPurchased: "Gem packs",
    ServerGemsReceived: "Gems received",
    Holes: "Hole",
    ItemMap: "Inventory items",
    ItemQuantity: "Inventory amounts",
    KRbest: "Killroy",
    Lab: "Laboratory",
    Lv0: "Levels",
    MoneyBANK: "Money bank",
    Ninja: "Sneaking",
    OptionsListAccount: "Account options",
    PetsStored: "Stored pets",
    PlayerDATABASE: "Other characters",
    PostOfficeInfo: "Post Office",
    PrayersActive: "Prayers in use",
    PrayersUnlocked: "Prayers",
    Printer: "3D Printer",
    QuestComplete: "Quests",
    SaltLick: "Salt Lick",
    ShrineInfo: "Shrines",
    SkillLevels: "Talents",
    Spelunk: "Spelunking",
    StampLevel: "Stamps",
    StampLevelMAX: "Stamp max levels",
    StarSignProg: "Star sign progress",
    StarSignsUnlocked: "Star Signs",
    StatueG: "Statue tiers",
    StatueLevels: "Statues",
    Summon: "Summoning",
    Sushi: "Sushi Station",
    Territory: "Pet territory",
    Tess: "Tesseract",
    TotemInfo: "Worship",
    TowerInfo: "Construction",
    UpgVault: "Upgrade Vault",
    WeeklyBoss: "Weekly Bosses",
};
export const keyName = (key) =>
    KEY_NAMES[key] ?? key.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/ (\w)/g, (_, c) => ` ${c.toLowerCase()}`);

/** What changed since the copy before, as a line says it: "Cards, Stamps, 3 more". */
const sinceText = (since) => {
    if (!since) return "";
    if (since.first) return "Oldest copy";
    const names = [...new Set(since.keys.map(({ key }) => keyName(key)))];
    if (!names.length) return since.itself ? "Game's own progress" : "Same as before";
    return names.length <= 3 ? names.join(", ") : `${names[0]}, ${names[1]}, ${names.length - 2} more`;
};

/** What a restore's own copy says in the list; "" for a copy of a cloud save. */
export const labelText = (label) =>
    label?.kind === "before"
        ? "Before restore"
        : label?.kind === "restored"
          ? `Restored from ${label.from ? copyName(label.from) : "a copy"}`
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

/** The compare's lines: the player's own changes by key, and the values the game moved by itself by key. */
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
    if (changes.some((change) => change.gemsBought)) return "Gems bought since";
    if (changes.every((change) => change.neverRestored)) return "The game keeps count";
    return "Can't be restored";
};

// Where a value sits under its key, without the game's map wrapper: "Cards[0].h.mob0" → "0 › mob0".
const placeIn = (path, key) =>
    path
        .slice(key.length)
        .split(/[.[\]]+/)
        .filter((part) => part && part !== "h")
        .join(" › ");

/** One value: where it sits, the copy's value (what Restore puts back), and the value now, smaller. */
const Value = (change, key, markKept) => {
    const copy = shown(change.copy);
    const now = shown(change.now);
    return div(
        { class: `save-value ${change.restorable ? "" : "is-kept"}` },
        span({ class: "save-value__place", title: change.path }, placeIn(change.path, key) || keyName(key)),
        span({ class: "save-value__copy", title: copy.full }, copy.text),
        span({ class: "save-value__now", title: now.full }, `now ${now.text}`),
        span({ class: "save-value__kept" }, markKept && !change.restorable ? "kept" : "")
    );
};

const Values = (changes, key, markKept) => {
    const rows = changes.map((change) => Value(change, key, markKept));
    const more = rows.splice(SHOWN);
    const moreOpen = van.state(false);
    return div(
        { class: "save-values" },
        ...rows,
        more.length
            ? div(
                  button(
                      {
                          type: "button",
                          class: "save-values__more",
                          "aria-expanded": () => String(moreOpen.val),
                          onclick: () => (moreOpen.val = !moreOpen.val),
                      },
                      () => (moreOpen.val ? "Fewer" : `${more.length} more`)
                  ),
                  () => (moreOpen.val ? div(...more) : span())
              )
            : null
    );
};

let opened = 0;
/** A line that opens what's under it (a key's values, the game's own progress): the shared row with its opener. */
const OpenerRow = ({ name, note, open, controls = null, rowClass = "", body }) => {
    const id = `save-open-${++opened}`;
    const row = AccountRow({
        rowClass: () => `${rowClass} ${open.val ? "is-open" : ""}`,
        info: button(
            {
                type: "button",
                class: "row-opener save-key__toggle",
                "aria-expanded": () => String(open.val),
                "aria-controls": id,
                onclick: () => (open.val = !open.val),
            },
            span(
                { class: "account-row__titles" },
                span({ class: "account-row__bonus save-key__name" }, name),
                span({ class: "account-row__name save-key__count" }, note)
            )
        ),
        controls,
    });
    row.append(div({ id, class: "save-key__under", hidden: () => !open.val }, () => (open.val ? body() : span())));
    return row;
};

/** One opened copy: what differs from the save now, by key, with Restore per key and Restore all. */
const CopyBody = (copy, onRestored) => {
    const result = van.state(null); // { groups } once read
    const failed = van.state("");
    const busy = van.state(""); // the select being restored ("all" or a key), "" when none
    const status = van.state(""); // what the last restore did
    const refused = van.state(false);
    // Lines stay as the player left them when the compare is read again after a restore.
    const openStates = new Map();
    const openState = (name) => {
        if (!openStates.has(name)) openStates.set(name, van.state(false));
        return openStates.get(name);
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
        const what = name === "all" ? "everything" : keyName(name);
        try {
            const { ok, results, before, afterError, warning } = await restoreCopy(copy, select);
            const missed = results.filter((entry) => !entry.ok).length;
            refused.val = !ok;
            status.val = !before
                ? "Already the same."
                : results.some((entry) => entry.error === "changed since")
                  ? "Gems came in just now. Try again."
                  : missed === results.length
                    ? "Couldn't restore. Try again."
                    : `${missed ? `${missed} of ${results.length} not restored. ` : ""}${warning ?? `Restored ${what}.`} “Before restore” on top undoes it.${afterError ? " Its copy after couldn't be saved." : ""}`;
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

    // The compare is drawn again after a restore, so the button pressed may be gone: focus goes to the first line,
    // never back to the top of the page.
    const keepFocus = () => {
        if (!document.body || document.activeElement !== document.body) return;
        node.querySelector("button")?.focus();
    };

    const restoreButton = (select, name, title) =>
        button(
            {
                type: "button",
                class:
                    name === "all"
                        ? "account-btn btn-main btn-sm save-copy__restore-all"
                        : "account-btn btn-quiet btn-sm save-key__restore",
                // Stays while it runs (busy, not gone), so a refusal leaves focus where it was.
                "aria-disabled": () => String(Boolean(busy.val)),
                title,
                onclick: () => void restore(select, name),
            },
            () => span(busy.val === name ? "Restoring…" : name === "all" ? "Restore all" : "Restore")
        );

    const keyRow = ({ key, changes }, prefix) => {
        const restorable = changes.filter((change) => change.restorable);
        const why = keptBecause(changes);
        return OpenerRow({
            name: keyName(key),
            note: why ? `${values(changes.length)} · ${why}` : values(changes.length),
            open: openState(`${prefix}${key}`),
            rowClass: `save-key ${why ? "is-kept" : ""}`,
            controls: why
                ? span({ class: "save-key__kept" }, "Kept")
                : restoreButton(
                      restorable.map((change) => change.path),
                      key,
                      `Put back ${values(restorable.length)} as they were at ${hhmm(copy.time)}`
                  ),
            body: () => Values(changes, key, !why),
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
            if (!total) return div({ class: "save-copy__note" }, "Same as your save now.");
            const moved = itself.reduce((sum, group) => sum + group.changes.length, 0);
            return div(
                { class: "save-copy__keys" },
                ...(own.length
                    ? own.map((group) => keyRow(group, ""))
                    : [div({ class: "save-copy__note" }, "Only the game's own progress differs.")]),
                itself.length
                    ? OpenerRow({
                          name: "Game's own progress",
                          note: values(moved),
                          open: openState("\u0000itself"),
                          rowClass: "save-key is-itself",
                          body: () => div({ class: "save-copy__itself" }, ...itself.map((g) => keyRow(g, "own:"))),
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

/**
 * One copy in the timeline: its time, what changed since the copy before, and on the right how long ago (today) or
 * what a restore's copy is. A copy of another character names the character and its day instead, and doesn't open.
 */
const CopyRow = (copy, active, openId, since, onRestored) => {
    const mine = () => active.val !== null && copy.character === active.val;
    const isOpen = () => openId.val === copy.id && mine();
    let body = null;
    const bodyId = `save-copy-${copy.id}`;
    const what = () => (active.val === null || mine() ? sinceText(since.val) : copy.character);
    const quiet = () => mine() && Boolean(since.val) && (since.val.first || !since.val.keys.length);
    const when = () =>
        mine() || active.val === null
            ? labelText(copy.label) || (isToday(copy.time) ? ago(copy.time) : "")
            : dayName(copy.time);
    const parts = () => [
        time({ class: "save-copy__time", datetime: new Date(copy.time).toISOString() }, hhmm(copy.time)),
        span({ class: () => `save-copy__what ${quiet() ? "is-quiet" : ""}` }, what),
        span({ class: () => `save-copy__when ${copy.label ? "is-label" : ""}` }, when),
    ];
    const row = AccountRow({
        rowClass: () => `save-copy ${mine() ? "" : "is-other"} ${isOpen() ? "is-open" : ""}`,
        info: () =>
            mine()
                ? button(
                      {
                          type: "button",
                          class: "row-opener save-copy__head",
                          "aria-expanded": () => String(isOpen()),
                          "aria-controls": bodyId,
                          onclick: () => (openId.val = isOpen() ? null : copy.id),
                      },
                      ...parts()
                  )
                : div({ class: "save-copy__head" }, ...parts()),
    });
    row.append(
        div({ id: bodyId, class: "row-detail save-copy__open", hidden: () => !isOpen() }, () => {
            if (!isOpen()) {
                body = null;
                return span();
            }
            body ??= CopyBody(copy, onRestored);
            return body;
        })
    );
    return row;
};

export const SaveCopies = () => {
    const loaded = van.state(false);
    const failed = van.state("");
    const warning = van.state("");
    const count = van.state(0);
    const active = van.state(null);
    const openId = van.state(null);
    const list = div({ class: "save-copies__list" });

    // What changed in each copy since the one before, asked for a group's copies when it opens, newest first.
    const sinceOf = new Map(); // id -> state: undefined until asked, then the answer (null when unreadable)
    const asked = new Set();
    const askSince = async (ids) => {
        const wanted = ids.filter((id) => !asked.has(id));
        wanted.forEach((id) => asked.add(id));
        for (let i = 0; i < wanted.length; i += 25) {
            const chunk = wanted.slice(i, i + 25);
            try {
                const { since } = await fetchCopiesSince(chunk);
                for (const id of chunk) if (sinceOf.has(id)) sinceOf.get(id).val = since[id] ?? null;
            } catch {
                // Not said: the lines still work without it, and the next opening asks again.
                chunk.forEach((id) => asked.delete(id));
                return;
            }
        }
    };

    // One folding group per day, newest first, today's open; other characters' copies in one group at the end. A
    // group keeps its node (and whether the player opened it) when the list is read again.
    const groups = new Map();
    const group = (key, startOpen) => {
        if (groups.has(key)) return groups.get(key);
        const open = van.state(startOpen);
        const name = van.state("");
        const note = van.state("");
        const ids = [];
        const rows = div({ class: "save-copies__rows", hidden: () => !open.val });
        const node = div(
            { class: "account-section save-copies__day" },
            button(
                {
                    type: "button",
                    class: "account-section__header save-copies__day-toggle",
                    "aria-expanded": () => String(open.val),
                    onclick: () => {
                        open.val = !open.val;
                        if (open.val) void askSince(ids);
                    },
                },
                span({ class: "account-section__title save-copies__day-name" }, () => name.val),
                span({ class: "account-section__note save-copies__day-count" }, () => note.val)
            ),
            rows
        );
        groups.set(key, { node, rows, name, note, open, ids });
        return groups.get(key);
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
                sinceOf.delete(id);
            }
        const byGroup = new Map();
        const others = [];
        for (const copy of all) {
            if (active.val !== null && copy.character !== active.val) {
                others.push(copy);
                continue;
            }
            if (!byGroup.has(dayKey(copy.time))) byGroup.set(dayKey(copy.time), []);
            byGroup.get(dayKey(copy.time)).push(copy);
        }
        if (others.length) byGroup.set("\u0000other", others);
        for (const [key, entry] of groups)
            if (!byGroup.has(key)) {
                entry.node.remove();
                groups.delete(key);
            }
        [...byGroup].forEach(([key, inGroup], i) => {
            const other = key === "\u0000other";
            const entry = group(key, !other && isToday(inGroup[0].time));
            entry.name.val = other ? "Other characters" : dayName(inGroup[0].time);
            entry.note.val = other ? `${copies(inGroup.length)} · switch to open` : copies(inGroup.length);
            entry.ids.splice(0, entry.ids.length, ...inGroup.map((copy) => copy.id));
            place(list, entry.node, i);
            inGroup.forEach((copy, j) => {
                if (!rows.has(copy.id)) {
                    sinceOf.set(copy.id, van.state(undefined));
                    rows.set(
                        copy.id,
                        CopyRow(copy, active, openId, sinceOf.get(copy.id), () => void load())
                    );
                }
                place(entry.rows, rows.get(copy.id), j);
            });
            if (entry.open.val) void askSince(entry.ids);
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
            // A restore's two copies go on top: the open copy stays where it is on screen, under the pointer.
            const openRow = rows.get(openId.val);
            const wasAt = openRow?.getBoundingClientRect().top;
            sync(saved.copies);
            if (openRow?.isConnected) {
                let scroller = openRow.parentElement;
                while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
                    scroller = scroller.parentElement;
                }
                scroller?.scrollBy?.(0, openRow.getBoundingClientRect().top - wasAt);
            }
            count.val = saved.copies.length;
            warning.val = saved.warning ?? "";
            failed.val = "";
        } catch (error) {
            if (ticket === newest) failed.val = error?.message || "Couldn't read the copies. Try again.";
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
                { class: "account-sub-tab-pane active history-pane save-copies-page" },
                AccountTabHeader({
                    title: "Save copies",
                    description: "A copy of your save at every cloud save.",
                }),
                () =>
                    warning.val
                        ? div({ class: "save-copy__warning", role: "status" }, Icons.Warning(), span(warning.val))
                        : span(),
                () =>
                    loaded.val && !failed.val && count.val && active.val === null
                        ? div({ class: "save-copies__none" }, `${NO_CHARACTER} Pick one to compare.`)
                        : span(),
                () =>
                    failed.val
                        ? EmptyState({ failed: true, title: "Couldn't read the copies", subtitle: failed.val })
                        : loaded.val && !count.val
                          ? EmptyState({
                                title: "No copies yet",
                                subtitle: "Each cloud save leaves one here.",
                            })
                          : span(),
                div({ class: "save-copies__panel", hidden: () => !count.val }, ListPanel({ body: list }))
            )
        )
    );
};
