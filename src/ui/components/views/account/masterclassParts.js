/**
 * The masterclasses' pages (Classes: Grimoire, Compass, Tesseract, Royal Armory) are built from the same pieces: an
 * upgrade list in the game's order with the bonus first and Max all | Reset all in the tray, a list of what the class
 * spends (bones, dust, tachyons), and the page around them, one sidebar entry with the game's screens as tabs.
 */

import van from "../../../vendor/van-1.6.0.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "./ClampedLevelRow.js";
import { useAccountLoad } from "./accountLoadPolicy.js";
import { RefreshButton } from "./components/AccountPageChrome.js";
import { RowTitles } from "./components/AccountRow.js";
import { ActionButton } from "./components/ActionButton.js";
import { PersistentAccountListPage } from "./components/PersistentAccountListPage.js";
import { TabbedList, loadParts, toolsPerTab } from "./tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    normalCase,
    createStaticRowReconciler,
    runBulkSet,
    toInt,
    useWriteStatus,
    writeVerified,
} from "./accountShared.js";

const { div } = van.tags;

/** The game's max level for an upgrade without one. */
export const NO_MAX = 999999;
// The game's own placeholders: pages still to come in the Grimoire and Tesseract, the Compass's last abominations.
const PLACEHOLDERS = ["These_pages_are_missing...", "Titan_doesnt_exist"];

export const plural = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;

// "Knockout!_(#)_製": the name before the game's marks; one the game writes in capitals ("FULL_CLEAR") in normal case.
const upgradeName = (raw) => {
    const name = cleanName(raw, "", { stripMarker: true })
        .replace(/\s*\(#\)$/, "")
        .trim();
    return name === name.toUpperCase() ? normalCase(name) : name;
};

// The bonus is the part of the game's line that holds its number ("You have slain the carrot abomination! @ +{%
// Tempest Move Speed": "Tempest Move Speed").
const upgradeBonus = (line) => {
    const parts = String(line ?? "").split("_@_");
    return bonusText(parts.find((part) => /[{}]/.test(part)) ?? parts[0]);
};

/**
 * One masterclass upgrade list, a tab's worth: the upgrades of `definitions` (a game list) whose levels live at
 * `levelsPath`, in the game's order (or `orderPath`'s), the game's placeholders left out. A level saves on Enter or on
 * leaving its field; an upgrade with a max shows it ("3 / 50") and + stops there. Max all fills the upgrades that have a
 * max (and brings one above it down), on one press; Reset all asks in the tray. Both act on what the top bar's search
 * shows.
 *
 * @param {object} opts
 * @param {string} opts.levelsPath where the levels live ("Grimoire")
 * @param {string} opts.definitions the game's list ("GrimoireUpg"): [0] name, [maxAt] max level, the last its line
 * @param {number} [opts.maxAt]
 * @param {string} [opts.orderPath] a game list of indexes, the order the game shows them in (the Royal Armory's)
 * @param {(def: Array) => boolean} [opts.only] the upgrades of this tab (a Compass path)
 * @param {[string, string]} opts.words what the tray's line counts ("upgrade", "upgrades")
 * @param {(upgrade: object) => *} [opts.afterSave] after a level saved, or a refused save that changed it (a cache the
 *   game rebuilds from it)
 * @param {(upgrades: object[]) => *} [opts.afterBulk] after Max all or Reset all, worked or not, with the upgrades
 *   whose level changed (or can't be read)
 * @param {() => boolean} opts.pending true while the page reads, or after a read that failed
 * @param {() => *} opts.reload reads the page again
 * @param {object} [opts.bulk] the page's useWriteStatus, shared with its Set all (a bulk write runs alone)
 */
export const UpgradesPart = ({
    levelsPath,
    definitions,
    maxAt = 4,
    orderPath = null,
    only = () => true,
    words,
    afterSave = null,
    afterBulk = null,
    pending,
    reload,
    bulk = useWriteStatus(),
}) => {
    const getLevel = createIndexedStateGetter(0);
    const upgrades = van.state([]);
    const rowOf = new Map();
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const pathOf = (upgrade) => `${levelsPath}[${upgrade.n}]`;
    // The levels the game holds now, or null when they can't be read (a read with no value included).
    const readLevels = () =>
        gga(levelsPath).then(
            (raw) => (raw === null || raw === undefined ? null : toIndexedArray(raw)),
            () => null
        );
    // Of the upgrades a save tried, those whose level the game holds now isn't the one it held just before the save
    // (`before`, read then); all of them when either read failed. A refused save may still have landed; one that
    // didn't leaves the caches as they are.
    const changedOf = async (tried, before) => {
        const now = await readLevels();
        if (!now || !before) return tried;
        return tried.filter((upgrade) => Number(now[upgrade.n] ?? 0) !== Number(before[upgrade.n] ?? 0));
    };

    const UpgradeRow = (upgrade) => {
        const row = ClampedLevelRow({
            valueState: getLevel(upgrade.n),
            max: upgrade.max ?? Infinity,
            integerMode: "trunc",
            name: upgrade.name,
            renderInfo: () => RowTitles({ bonus: upgrade.bonus, name: upgrade.name }),
            writePath: afterSave ? null : pathOf(upgrade),
            write: afterSave
                ? async (level) => {
                      const before = await readLevels();
                      try {
                          await writeVerified(pathOf(upgrade), level);
                      } catch (error) {
                          // A failed save that still changed the level: its cache goes too, and the failure is said.
                          if ((await changedOf([upgrade], before)).length)
                              await Promise.resolve(afterSave(upgrade)).catch(() => {});
                          throw error;
                      }
                      await afterSave(upgrade);
                      return level;
                  }
                : null,
        });
        rowOf.set(upgrade.n, row);
        return row;
    };

    const shown = () => upgrades.val.filter((upgrade) => shownBySearch(rowOf.get(upgrade.n)));
    const capped = () => shown().filter((upgrade) => upgrade.max !== null);
    const setLevels = async (entries, targetOf) => {
        const result = await bulk.run(async () => {
            // Nothing to change (every upgrade shown already at its max): no write, and no cache to clear.
            const toChange = () => entries.filter((upgrade) => getLevel(upgrade.n).val !== targetOf(upgrade));
            if (!toChange().length) return { cancelled: true };
            const before = afterBulk ? await readLevels() : null;
            // Taken after the read, so a row saved meanwhile is in the writes and the hook alike.
            const tried = toChange();
            try {
                await runBulkSet({
                    entries: tried,
                    getTargetValue: targetOf,
                    getValueState: (upgrade) => getLevel(upgrade.n),
                    getPath: pathOf,
                });
            } finally {
                // Worked or not, the upgrades whose level changed (or can't be read) go to the hook, and only those.
                const changed = afterBulk ? await changedOf(tried, before) : [];
                if (changed.length) await afterBulk(changed);
            }
        });
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: div({ class: "field-columns" }, listNode),
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [rawLevels, rawDefs, rawOrder] = await Promise.all([
                gga(levelsPath),
                readCList(definitions),
                orderPath ? readCList(orderPath) : null,
            ]);
            const levels = toIndexedArray(rawLevels ?? []);
            const defs = toIndexedArray(rawDefs ?? []).map((raw) => toIndexedArray(raw ?? []));
            const order = rawOrder ? toIndexedArray(rawOrder).map(Number) : defs.map((_, n) => n);
            const next = order
                .map((n, position) => ({ n, position, def: defs[n] }))
                .filter(({ def }) => def && def[0] && !PLACEHOLDERS.includes(def[def.length - 1]) && only(def))
                .map(({ n, position, def }) => {
                    const max = toInt(def[maxAt], { min: 0 });
                    return {
                        n,
                        // The game's place for it: the Royal Armory's shelf.
                        shelf: position + 1,
                        raw: String(def[0]),
                        name: upgradeName(def[0]),
                        bonus: upgradeBonus(def[def.length - 1]),
                        max: max > 0 && max < NO_MAX ? max : null,
                    };
                });
            reconcileRows(next.map((upgrade) => `${upgrade.n}:${upgrade.raw}:${upgrade.max}`).join("|"), () =>
                next.map(UpgradeRow)
            );
            // The level the game holds, above the max too (the game counts it all): Max all lowers it.
            next.forEach((upgrade) => (getLevel(upgrade.n).val = toInt(levels[upgrade.n], { min: 0 })));
            upgrades.val = next;
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${words[n === 1 ? 0 : 1]}` : `All ${plural(n, words)}`;
        },
        tools: (ask) => {
            const resetAll = ActionButton({
                label: "Reset all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shown().some((upgrade) => getLevel(upgrade.n).val > 0),
                onClick: (e) => {
                    e.preventDefault();
                    const entries = shown().filter((upgrade) => getLevel(upgrade.n).val > 0);
                    const n = entries.length;
                    ask({
                        question: `Reset ${plural(n, words)} to 0?`,
                        confirmLabel: n === 1 ? "Reset it" : "Reset them",
                        from: resetAll,
                        onConfirm: () => setLevels(entries, () => 0),
                    });
                },
            });
            return div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Max all",
                    status: bulk.status,
                    disabled: () => pending() || !capped().length,
                    onClick: (e) => {
                        e.preventDefault();
                        return setLevels(capped(), (upgrade) => upgrade.max);
                    },
                }),
                resetAll
            );
        },
    };
};

/**
 * A masterclass page: one sidebar entry, the game's screens as `tabs` ({ id, label, part }), each part built with
 * `{ pending, reload, bulk }`. One read of the game fills every tab. A tab with a line without a max has Set all in
 * its tray; it shares `bulk` with the tabs' own tools, so one bulk write runs at a time. `automation` links the page's
 * automation beside the title ({ page }).
 */
export const MasterclassPage = ({ name, page, description, tabs, wrap = false, automation = null }) => {
    const parts = new Map();
    const activeId = van.state(tabs[0].id);
    const bulk = useWriteStatus();
    const busy = () => bulk.status.val === "loading" || [...parts.values()].some((part) => part.busy?.());
    const own = useAccountLoad({ label: name, busy });
    for (const tab of tabs) parts.set(tab.id, tab.part({ pending: () => pending(), reload: () => load(), bulk }));
    const { loading, error } = own;
    // After a read that failed, what the tabs show may be old: their tools wait for one that works.
    const pending = () => loading.val || Boolean(error.val);
    const load = () => own.run(() => loadParts(parts));

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: name,
        description,
        automation,
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy() }),
        state: { loading, error },
        loadingText: `Reading the ${name}`,
        errorTitle: `Couldn't read the ${name}`,
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name,
                page,
                activeId,
                wrap,
                busy,
                tabs: tabs.map((tab) => ({ id: tab.id, label: tab.label, content: parts.get(tab.id).content })),
                tools: toolsPerTab(
                    Object.fromEntries(
                        tabs.filter((tab) => parts.get(tab.id).tools).map((tab) => [tab.id, parts.get(tab.id).tools])
                    )
                ),
                toolsOn: (id) => Boolean(parts.get(id).tools),
                toolsLabel: (open) => parts.get(open.val).toolsLabel?.() ?? "",
                // A part names what its Set all sets (the Nodes' "Grade"); else it's the tab's lines.
                setAll: {
                    word: (n, tab) => parts.get(tab).setAllWord?.(n) ?? (n === 1 ? "line" : "lines"),
                    placeholder: (tab) => parts.get(tab).setAllPlaceholder ?? "Value",
                    bulk,
                },
            })
        ),
    });
};
