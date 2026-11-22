/**
 * W5 - Gaming › Superbits
 *
 * Data sources:
 *   gga.Gaming[12]          - the unlocked superbits, one letter each (Number2Letter[n] for superbit n)
 *   gga.Number2Letter       - the game's letter for each superbit
 *   cList.GamingUpg[n][0]   - the superbit's bonus in the game's words; [3] its name ("Bits_Per|Achievement")
 *
 * The game's three boards as tabs (Superbits, Duperbits, Zuperbits), each superbit with a switch and its bonus first.
 * Every superbit lives in one string, so flips save one at a time, each from the string the game holds now. Unlock
 * all runs on one press; Lock all asks in the tray. Both act on the open tab's superbits the top bar's search shows.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { gga, readCList } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    oneAtATime,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div } = van.tags;

const PATH = "Gaming[12]";
const BOARDS = [
    { id: "super", label: "Superbits", word: "superbit", start: 0, end: 24 },
    { id: "duper", label: "Duperbits", word: "duperbit", start: 24, end: 48 },
    { id: "zuper", label: "Zuperbits", word: "zuperbit", start: 48, end: Infinity },
];

// The game's own wording keeps its bits symbol and total line out: only the sentence with the bonus shows.
const superbitBonus = (raw) =>
    bonusText(String(raw ?? "").replace(/₣/g, " bits"))
        .replace(/\s*\(\s*\)/g, "")
        .replace(/^X(?=\d)/, "x");

const SuperbitsTab = () => {
    const bulk = useWriteStatus();
    const { loading, error, run } = useAccountLoad({ label: "Superbits", busy: () => bulk.status.val === "loading" });
    const held = van.state("");
    const superbits = van.state([]);
    const activeId = van.state(BOARDS[0].id);
    const rowOf = new Map();
    const nodes = BOARDS.map(() => div());
    const reconcilers = nodes.map((node) => createStaticRowReconciler(node));
    const inTurn = oneAtATime();
    const readPending = () => loading.val || Boolean(error.val);

    // Puts the letters in or takes them out of the string the game holds now.
    const change = (letters, unlock) =>
        inTurn(async () => {
            let next = String((await gga(PATH)) ?? "");
            for (const letter of letters) {
                next = next.split(letter).join("");
                if (unlock) next += letter;
            }
            await writeVerified(PATH, next);
            held.val = next;
        });

    const SuperbitRow = (bit) =>
        AccountToggleRow({
            info: RowTitles({ bonus: bit.bonus, name: bit.name }),
            words: ["Unlocked", ""],
            name: bit.name,
            checked: () => held.val.includes(bit.letter),
            write: (on) => change([bit.letter], on),
        });

    const load = async () =>
        run(async () => {
            const [encoded, rawLetters, rawDefs] = await Promise.all([
                gga(PATH),
                gga("Number2Letter"),
                readCList("GamingUpg"),
            ]);
            const letters = toIndexedArray(rawLetters ?? []);
            const next = toIndexedArray(rawDefs ?? [])
                .map((raw, index) => {
                    const def = toIndexedArray(raw ?? []);
                    const words = cleanName(def[3]);
                    // The game writes some in lower case ("obol stat booster").
                    const name = words.charAt(0).toUpperCase() + words.slice(1);
                    return letters[index] && name
                        ? { index, letter: letters[index], name, bonus: superbitBonus(def[0]) }
                        : null;
                })
                .filter(Boolean);
            BOARDS.forEach((board, b) => {
                const bits = next.filter((bit) => bit.index >= board.start && bit.index < board.end);
                reconcilers[b](bits.map((bit) => `${bit.index}:${bit.name}`).join("|"), () =>
                    bits.map((bit) => {
                        const row = SuperbitRow(bit);
                        rowOf.set(bit.index, row);
                        return row;
                    })
                );
            });
            held.val = String(encoded ?? "");
            superbits.val = next;
        });

    const boardOf = (id) => BOARDS.find((board) => board.id === id) ?? BOARDS[0];
    const shown = (id) => {
        const board = boardOf(id);
        return superbits.val.filter(
            (bit) => bit.index >= board.start && bit.index < board.end && shownBySearch(rowOf.get(bit.index))
        );
    };
    const words = (id, n) => `${boardOf(id).word}${n === 1 ? "" : "s"}`;

    const setAll = async (bits, unlock) => {
        const result = await bulk.run(() =>
            change(
                bits.map((bit) => bit.letter),
                unlock
            )
        );
        if (!result.ok && !result.cancelled) await load();
    };

    const tools = (tab, ask) => {
        const lockAll = ActionButton({
            label: "Lock all",
            status: bulk.status,
            variant: "danger",
            disabled: () => readPending() || !shown(tab.val).some((bit) => held.val.includes(bit.letter)),
            onClick: (e) => {
                e.preventDefault();
                const bits = shown(tab.val).filter((bit) => held.val.includes(bit.letter));
                const n = bits.length;
                ask({
                    question: `Lock ${n} ${words(tab.val, n)}?`,
                    confirmLabel: n === 1 ? "Lock it" : "Lock them",
                    from: lockAll,
                    onConfirm: () => setAll(bits, false),
                });
            },
        });
        return div(
            { class: "tabbed-list__tool-group" },
            ActionButton({
                label: "Unlock all",
                status: bulk.status,
                disabled: () => readPending() || !shown(tab.val).length,
                onClick: (e) => {
                    e.preventDefault();
                    return setAll(shown(tab.val), true);
                },
            }),
            lockAll
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Superbits",
        description: "Which superbits, duperbits and zuperbits are unlocked.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || bulk.status.val === "loading" }),
        state: { loading, error },
        loadingText: "Reading the superbits",
        errorTitle: "Couldn't read the superbits",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Superbit boards",
                activeId,
                busy: () => bulk.status.val === "loading",
                tabs: BOARDS.map((board, b) => ({ id: board.id, label: board.label, content: nodes[b] })),
                tools,
                toolsLabel: (tab) => {
                    const n = shown(tab.val).length;
                    return isSearching() ? `${n} matching ${words(tab.val, n)}` : `All ${n} ${words(tab.val, n)}`;
                },
            })
        ),
    });
};

export default definePage({
    id: "w5.gaming.superbits",
    world: 5,
    system: "Gaming",
    tab: "Superbits",
    description: "Superbit, duperbit and zuperbit unlocks.",
    keywords: ["Duperbits", "Zuperbits"],
    component: SuperbitsTab,
});
