/**
 * W1 - Star Signs
 *
 * Data sources:
 *   cList.StarQuests[i]     - [mapId, x, y, req1, req2, playersNeeded, starPoints, task, type]
 *   gga.StarSignProg[i][0]  - the letters of the players who completed it, in order (e.g. "_ab")
 *   gga.StarSignProg[i][1]  - claimed flag (1 = claimed, 0 = not claimed)
 *   OptionsListAccount[40]  - star points to spend: claiming a sign adds its points (StarQuests[i][6]), unlocking a
 *                             star sign in the game spends them (SSignInfoUI[i][4])
 *
 * Player → letter mapping (Number2Letter):
 *   Player 1 → "_", Player 2 → "a", Player 3 → "b", ... Player 10 → "i"
 *
 * Signs are named and grouped by the world of their map: mapId < 50 → World 1 ("A-1", "A-2"...), < 100 → World 2
 * ("B-n"), < 150 → World 3, < 200 → World 4, < 250 → World 5, the rest → World 6. Each world is a tab. A row is the
 * sign's task, its name under it, how many players completed it and an Unlocked switch; clicking it opens the players
 * who completed it, in order, right in the list.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    joinClasses,
    toInt,
    toNum,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { SaveState, useAutoSave } from "../../../components/views/account/autoSave.js";
import { Icons } from "../../../assets/icons.js";
import { announce } from "../../../components/inPlace.js";

const { div, button, span, p, select, option } = van.tags;

const PLAYER_LETTERS = ["_", "a", "b", "c", "d", "e", "f", "g", "h", "i"];
const PLAYER_NUMBERS = PLAYER_LETTERS.map((_, index) => index + 1);
const letterToPlayer = (l) => PLAYER_LETTERS.indexOf(l) + 1;
const playerToLetter = (n) => PLAYER_LETTERS[n - 1] ?? null;

const GROUPS = ["A", "B", "C", "D", "E", "F"];
const groupOf = (mapId) =>
    mapId < 50 ? "A" : mapId < 100 ? "B" : mapId < 150 ? "C" : mapId < 200 ? "D" : mapId < 250 ? "E" : "F";
const worldOf = (group) => `World ${GROUPS.indexOf(group) + 1}`;

function computeLabels(quests) {
    const counters = Object.fromEntries(GROUPS.map((group) => [group, 0]));
    return quests.map((q) => {
        const group = groupOf(parseInt(q[0], 10));
        counters[group]++;
        return `${group}-${counters[group]}`;
    });
}

const cleanDesc = (s) =>
    (s ?? "")
        .replace(/_@_Progress.*$/, "")
        .replace(/_/g, " ")
        .trim();

const parseProgress = (str) =>
    (str ?? "")
        .split("")
        .map(letterToPlayer)
        .filter((n) => n > 0);

const encodeProgress = (players) => players.map(playerToLetter).filter(Boolean).join("");
const isUnlockedByProgress = (players, playersNeeded) => players.length >= playersNeeded;

// A sign with the progress the game holds for it (StarSignProg[i]).
const withProgress = (sign, prog) => {
    const players = parseProgress(prog?.[0]);
    return {
        ...sign,
        players,
        claimed: toInt(prog?.[1], 0),
        unlocked: isUnlockedByProgress(players, sign.playersNeeded),
    };
};

// A sign with these players, unlocked and claimed when there are enough of them.
const withPlayers = (sign, players) => {
    const unlocked = isUnlockedByProgress(players, sign.playersNeeded);
    return { ...sign, players, unlocked, claimed: unlocked ? 1 : 0 };
};

// The players added and removed since `base`, put on the list the game holds now, so players who completed the
// sign in the game since stay (after the page's own order).
const mergePlayers = (base, next, game) => [
    ...next.filter((num) => game.includes(num) || !base.includes(num)),
    ...game.filter((num) => !base.includes(num) && !next.includes(num)),
];

const shuffled = (list) => {
    const pool = [...list];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
};

const playerName = (num, usernames) => {
    const name = usernames[num - 1];
    return typeof name === "string" && name.trim() && !name.startsWith("__") ? name : `Player ${num}`;
};

const normalizeUsernames = (rawUsernames) => {
    const source = rawUsernames?.h ?? rawUsernames;
    return PLAYER_NUMBERS.map((num) => {
        const index = num - 1;
        if (Array.isArray(source)) return source[index];
        return source?.[index] ?? source?.[String(index)];
    });
};

const getClaimedRewardTotal = (list) =>
    list.reduce((total, sign) => total + (toInt(sign.claimed, 0) ? toNum(sign.rewardPoints, 0) : 0), 0);

// OptionsListAccount[40] is the star points balance the game spends on star signs (claiming a sign adds its points,
// unlocking a star sign takes its cost), so a change moves it by what the signs give or take back, never below zero:
// points already spent on star signs stay spent.
// A save reads the balance BEFORE the signs, so both come from one moment: a sign the game claims in between changes
// the balance after this read, and the write's `expect` refuses it instead of counting its points twice. An account
// that never had points holds nothing there yet (0).
const readStarPoints = async () => {
    const read = await gga("OptionsListAccount[40]");
    return { read, balance: read === undefined || read === null || read === "" ? 0 : Number(read) };
};

// The balance write for a change, or null when the claims don't change. A balance that isn't a number is refused, not
// saved over.
const starPointsWrite = (points, list, nextSigns) => {
    const change = getClaimedRewardTotal(nextSigns) - getClaimedRewardTotal(list);
    if (!change) return null;
    if (!Number.isFinite(points.balance)) throw new Error("Star points unreadable. Nothing changed.");
    return { path: "OptionsListAccount[40]", value: Math.max(0, points.balance + change), expect: points.read };
};

/** Players in their completion order, as chips that drag to a new place. */
const DragList = ({ items, renderItem, onChange }) => {
    let dragIdx = null;

    return div(
        { class: "starsign-drag-list" },
        ...items.map((item, i) =>
            div(
                {
                    class: "starsign-drag-row",
                    draggable: true,
                    ondragstart: (e) => {
                        dragIdx = i;
                        e.currentTarget.classList.add("dragging");
                    },
                    ondragend: (e) => {
                        dragIdx = null;
                        e.currentTarget.classList.remove("dragging");
                    },
                    ondragover: (e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add("drag-over");
                    },
                    ondragleave: (e) => e.currentTarget.classList.remove("drag-over"),
                    ondrop: (e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("drag-over");
                        if (dragIdx === null || dragIdx === i) return;
                        const next = [...items];
                        const [moved] = next.splice(dragIdx, 1);
                        next.splice(i, 0, moved);
                        onChange(next);
                    },
                },
                renderItem(item, i)
            )
        )
    );
};

/**
 * The players who completed an open sign, in order: drag to reorder, × to take one off (Undo puts them back), a pick to
 * add one. Every change saves. `current()`: the sign as the page last read it from the game.
 */
const StarSignDetail = ({ sign, current, usernames = [], onSave }) => {
    const players = van.state([...sign.players]);
    let saved = encodeProgress(sign.players);
    const showGame = (read) => {
        if (read?.index !== sign.index) return; // closed, or another sign opened
        players.val = [...read.players];
        saved = encodeProgress(read.players);
    };
    // Every change to the list saves; a change made while one saves is saved after it.
    const { status, reason, save, undo } = useAutoSave({
        prepare: () => {
            const progress = encodeProgress(players.val);
            if (progress === saved) return { unchanged: true };
            return {
                write: async () => {
                    try {
                        const written = (await onSave?.({ index: sign.index, progress, base: saved })) ?? progress;
                        // The list shows what the game now holds, with any change made while this saved.
                        players.val = mergePlayers(parseProgress(progress), players.val, parseProgress(written));
                        saved = written;
                    } catch (error) {
                        showGame(current()); // the page read the game again
                        throw error;
                    }
                },
            };
        },
    });
    // A reload (Refresh, an undo, a bulk action, the row's switch) shows what the game holds, unless a save is running.
    van.derive(() => {
        const read = current();
        if (status.rawVal !== "loading") showGame(read);
    });

    const setPlayers = (next) => {
        players.val = next;
        void save();
    };
    const addPlayer = (num) => {
        if (players.val.includes(num)) return;
        setPlayers([...players.val, num]);
    };
    const removePlayer = (num) => setPlayers(players.val.filter((p) => p !== num));
    const picker = select(
        { class: "starsign-player-select select-base", "aria-label": "Add a player" },
        option({ value: "", disabled: true, selected: true }, "Add player…"),
        ...PLAYER_NUMBERS.map((n) => option({ value: n }, playerName(n, usernames)))
    );

    return div(
        { class: "starsign-detail" },
        div({ class: "starsign-detail__players" }, () => {
            const list = players.val;
            if (!list.length) return p({ class: "starsign-detail__none" }, "Nobody has completed it yet.");
            return DragList({
                items: list,
                renderItem: (playerNum, at) =>
                    div(
                        { class: "starsign-player-chip", "data-letter": playerToLetter(playerNum) ?? "?" },
                        span({ class: "starsign-player-order" }, `${at + 1}`),
                        span({ class: "starsign-player-name" }, playerName(playerNum, usernames)),
                        // Taking a player off saves at once; Undo puts them back.
                        button(
                            {
                                type: "button",
                                class: "btn-quiet btn-icon btn-sm starsign-remove-btn",
                                "aria-label": `Take ${playerName(playerNum, usernames)} off`,
                                onclick: () => removePlayer(playerNum),
                            },
                            Icons.Close()
                        )
                    ),
                onChange: setPlayers,
            });
        }),
        div(
            { class: "starsign-add-row" },
            picker,
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm",
                    onclick: () => {
                        const val = parseInt(picker.value, 10);
                        if (val && !players.val.includes(val)) {
                            addPlayer(val);
                            picker.value = "";
                        }
                    },
                },
                "Add"
            ),
            p({ class: "starsign-detail__hint", hidden: () => players.val.length < 2 }, "Drag a player to move them."),
            SaveState({ status, reason, undo, className: "save-state--inline" })
        )
    );
};

/**
 * One sign: its task first, its name (A-1) under it; how many players completed it, and an Unlocked switch that fills
 * it with the players it needs (keeping who has it) or clears it. The task opens the players, in place.
 */
const StarSignRow = ({ index, signOf, isOpen, onOpen, onUnlock, detailFor }) => {
    const first = signOf(index);
    const row = AccountRow({
        rowClass: () => joinClasses("starsign-row", isOpen() && "is-open"),
        rowProps: { "data-sign": first.label },
        info: button(
            {
                type: "button",
                // The shared opener (its arrow in the one place every opening row has it).
                class: "row-opener starsign-row__open",
                "aria-expanded": () => String(isOpen()),
                onclick: onOpen,
            },
            RowTitles({ bonus: first.desc, name: first.label })
        ),
        controls: [
            span(
                { class: "starsign-row__players" },
                span({ class: "starsign-row__count" }, () => signOf(index)?.players.length ?? 0),
                span({ class: "starsign-row__need" }, () => ` / ${signOf(index)?.playersNeeded ?? first.playersNeeded}`)
            ),
            StateSwitch({
                checked: () => Boolean(signOf(index)?.unlocked),
                words: ["Unlocked", ""],
                name: `${first.label} unlocked`,
                ownStatus: true,
                onFlip: async (on) => {
                    await onUnlock(index, on);
                    return { ok: true };
                },
            }),
        ],
    });
    row.append(div({ class: "starsign-row__detail" }, () => (isOpen() ? detailFor(index) : span())));
    return row;
};

const StarSignsTab = () => {
    const signs = van.state(null);
    const { loading, error, run } = useAccountLoad({ label: "Star Signs" });
    const openIndex = van.state(null);
    const bulk = useWriteStatus();

    const signOf = (index) => signs.val?.find((sign) => sign.index === index);

    const load = async () =>
        run(async () => {
            const [rawQuests, rawProg, rawUsernames] = await Promise.all([
                readCList("StarQuests"),
                gga("StarSignProg"),
                gga("GetPlayersUsernames"),
            ]);

            const quests = toIndexedArray(rawQuests ?? []);
            const prog = toIndexedArray(rawProg ?? []);
            const labels = computeLabels(quests);
            const usernames = normalizeUsernames(rawUsernames);

            signs.val = quests
                .map((q, i) =>
                    withProgress(
                        {
                            index: i,
                            label: labels[i],
                            world: worldOf(labels[i][0]),
                            desc: cleanDesc(q[7]),
                            playersNeeded: parseInt(q[5], 10) || 1,
                            rewardPoints: toNum(q[6], 0),
                            usernames,
                        },
                        prog[i]
                    )
                )
                .filter((s) => s.desc.length > 0);
            renderPanel();
        });

    // Saves read the game's progress first, so what changed in the game since the page read it isn't written over.
    const readSigns = async () => {
        const prog = toIndexedArray((await gga("StarSignProg")) ?? []);
        return signs.val.map((sign) => withProgress(sign, prog[sign.index]));
    };

    // Every change goes through here: `change` gets the signs as the game holds them and gives them as they should be.
    // Only what differs is written, with the star points to match. A failed save reads the game again.
    const commit = async (change) => {
        try {
            const starPoints = await readStarPoints(); // before the signs: one moment for both
            const list = await readSigns();
            const nextSigns = change(list);
            const writes = [];
            nextSigns.forEach((next, at) => {
                const was = list[at];
                const progress = encodeProgress(next.players);
                if (progress !== encodeProgress(was.players)) {
                    writes.push({ path: `StarSignProg[${next.index}][0]`, value: progress });
                }
                if (toInt(was.claimed, 0) !== toInt(next.claimed, 0)) {
                    writes.push({ path: `StarSignProg[${next.index}][1]`, value: next.claimed });
                }
            });
            const points = starPointsWrite(starPoints, list, nextSigns);
            if (points) writes.push(points);
            await writeManyVerified(writes);
            signs.val = nextSigns;
            return nextSigns;
        } catch (error) {
            try {
                await load();
            } catch (reloadError) {
                console.error("[StarSigns] reload after write failure also failed", reloadError);
            }
            throw error;
        }
    };

    // The open sign's list: `base` is what it last saved or read; the change from it to `progress` is the player's.
    const handleSave = async ({ index, progress, base }) => {
        if (!signs.val) return undefined;
        const next = await commit((list) =>
            list.map((sign) =>
                sign.index === index
                    ? withPlayers(sign, mergePlayers(parseProgress(base), parseProgress(progress), sign.players))
                    : sign
            )
        );
        const sign = next.find((entry) => entry.index === index);
        return sign ? encodeProgress(sign.players) : undefined;
    };

    // Keeps who has the sign and adds the first players it still needs; a full sign stays as it is.
    const filled = (sign) => {
        if (sign.unlocked) return sign;
        const others = PLAYER_NUMBERS.filter((num) => !sign.players.includes(num));
        return withPlayers(sign, [...sign.players, ...others].slice(0, Math.max(sign.playersNeeded, 1)));
    };

    // The row's switch: on fills the sign; off clears it.
    const setUnlocked = (index, on) =>
        commit((list) => list.map((sign) => (sign.index !== index ? sign : on ? filled(sign) : withPlayers(sign, []))));

    // The open tab's signs the tools act on: all of them, or the ones the top bar's search shows.
    const rowOf = new Map();
    const signsIn = (world) =>
        (signs.val ?? []).filter((sign) => sign.world === world && shownBySearch(rowOf.get(sign.index)));
    const signWord = (n) => `star sign${n === 1 ? "" : "s"}`;

    // `change` applied to the tab's signs as the game holds them now.
    const changeAll = (world, change) =>
        bulk.run(() => {
            const indices = new Set(signsIn(world).map((sign) => sign.index));
            return commit((list) => list.map((sign) => (indices.has(sign.index) ? change(sign) : sign)));
        });
    // Unlock all fills the empty places only; Randomize all puts players picked at random on every sign.
    const unlockAll = (world) => changeAll(world, filled);
    const randomizeAll = (world) =>
        changeAll(world, (sign) => withPlayers(sign, shuffled(PLAYER_NUMBERS).slice(0, sign.playersNeeded)));
    // Reset clears the tab's signs and lowers the star points to match; the star signs already unlocked stay.
    const resetAll = (world) => changeAll(world, (sign) => withPlayers(sign, []));

    // The tray's Yes runs the change after the press ended, so the press can't say how it went (ActionButton): this does.
    const said = (name, change) => () => change().then(({ ok }) => announce(`${name}: ${ok ? "done" : "failed"}`));
    const tools = (activeId, ask) => {
        const started = () => signsIn(activeId.val).filter((sign) => sign.players.length || toInt(sign.claimed, 0));
        // A sign started while it asks is one more to reset, so it asks again; with none left it does nothing.
        const askReset = () => {
            const n = started().length;
            if (!n) return;
            ask({
                question: `Reset ${n} ${signWord(n)} in ${activeId.val}?`,
                confirmLabel: n === 1 ? "Reset it" : "Reset them",
                from: resetButton,
                lowers: () => started().map((sign) => sign.index),
                again: askReset,
                onConfirm: said("Reset all", () => resetAll(activeId.val)),
            });
        };
        const resetButton = ActionButton({
            label: "Reset all",
            status: bulk.status,
            variant: "danger",
            disabled: () => !started().length,
            onClick: (e) => {
                e.preventDefault();
                askReset();
            },
        });
        const randomizeButton = ActionButton({
            label: "Randomize all",
            status: bulk.status,
            disabled: () => !signsIn(activeId.val).length,
            onClick: (e) => {
                e.preventDefault();
                const n = signsIn(activeId.val).length;
                ask({
                    question: `Randomize ${n} ${signWord(n)} in ${activeId.val}?`,
                    confirmLabel: n === 1 ? "Randomize it" : "Randomize them",
                    from: randomizeButton,
                    onConfirm: said("Randomize all", () => randomizeAll(activeId.val)),
                });
            },
        });
        return [
            div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Unlock all",
                    status: bulk.status,
                    disabled: () => signsIn(activeId.val).every((sign) => sign.unlocked),
                    onClick: (e) => {
                        e.preventDefault();
                        void unlockAll(activeId.val);
                    },
                }),
                randomizeButton
            ),
            div({ class: "tabbed-list__tool-group" }, resetButton),
        ];
    };

    // The open sign keeps one node while it's open (saves, reloads), so its save state stays.
    let detail = null;
    const detailFor = (index) => {
        if (detail?.index !== index) {
            const sign = signOf(index);
            detail = {
                index,
                node: StarSignDetail({
                    sign,
                    current: () => signOf(index),
                    usernames: sign.usernames ?? [],
                    onSave: handleSave,
                }),
            };
        }
        return detail.node;
    };

    // The tabs are the worlds the game has signs in, built once they're read, and again only when the signs change.
    const panelHost = div({ class: "account-list account-list--tabbed" });
    let panelKey = null;
    const renderPanel = () => {
        const key = signs.val.map((sign) => sign.index).join(",");
        if (key === panelKey) return;
        panelKey = key;
        rowOf.clear();
        const worlds = [...new Set(signs.val.map((sign) => sign.world))];
        panelHost.replaceChildren(
            TabbedList({
                name: "Star Signs",
                tabs: worlds.map((world) => ({
                    id: world,
                    label: world,
                    content: signs.val
                        .filter((sign) => sign.world === world)
                        .map((sign) => {
                            const row = StarSignRow({
                                index: sign.index,
                                signOf,
                                isOpen: () => openIndex.val === sign.index,
                                onOpen: () => (openIndex.val = openIndex.val === sign.index ? null : sign.index),
                                onUnlock: setUnlocked,
                                detailFor,
                            });
                            rowOf.set(sign.index, row);
                            return row;
                        }),
                })),
                tools,
                toolsLabel: (activeId) => {
                    const n = signsIn(activeId.val).length;
                    return isSearching()
                        ? `${n} matching ${signWord(n)} in ${activeId.val}`
                        : `All ${n} ${signWord(n)} in ${activeId.val}`;
                },
            })
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container starsigns-tab",
        title: "Star Signs",
        description: "Which players completed each star sign, in order.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading star signs",
        errorTitle: "Couldn't read star signs",
        initialWrapperClass: "account-list",
        body: panelHost,
    });
};

export default definePage({
    id: "w1.starsigns",
    world: 1,
    system: "Star Signs",
    description: "Which players completed each star sign, and in what order.",
    keywords: ["Starsigns", "Constellations"],
    component: StarSignsTab,
});
