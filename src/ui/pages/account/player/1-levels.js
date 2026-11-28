import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formattedStep, parseNumber } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
import { captureGesture } from "../../../services/changeLog.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    CHARACTER_CHANGED,
    NO_CHARACTER,
    createStaticRowReconciler,
    getOrCreateState,
    largeFormatter,
    largeParser,
    oneAtATime,
    readCharacterInPlay,
    unwrapH,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ListPanel } from "../../../components/views/account/tabShared.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { createCharacterSelector } from "../../../components/views/account/components/CharacterSelector.js";

const { div } = van.tags;

const PlayerTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Player" });
    const selected = van.state("");
    const current = van.state("");
    const busy = van.state(false);
    const message = van.state("");
    const values = new Map();
    const moneyRows = div();
    const rows = div();
    const reconcileMoney = createStaticRowReconciler(moneyRows);
    const reconcileRows = createStaticRowReconciler(rows);
    // Fields stay enabled while a save runs, so focus stays where the player put it (AGENTS.md).
    const unavailable = () => loading.val || Boolean(error.val);
    const characterSelector = createCharacterSelector({
        id: "player-character",
        selected,
        disabled: () => loading.val || busy.val,
        onChange: (event) => {
            selected.val = event.target.value;
            load();
        },
        // A character not in play keeps a change only once it is played (#28: the old caption didn't say so).
        info: () =>
            selected.val === current.val
                ? ""
                : "Not in play. Switch to them in game before you close it, or changes are lost.",
    });

    // A save asked for while another runs waits its turn, and reads the game again then.
    const inTurn = oneAtATime();
    // The line clears when a save is asked for, not at its turn, so the warning of a failed save before it stays.
    // `changes`: [index, value] pairs, the index null for money; they save in one write (a row's, or Set all's).
    const setValues = (name, changes) => {
        message.val = "";
        return inTurn(() => saveValues(name, changes));
    };
    const saveValues = async (name, changes) => {
        if (unavailable()) throw new Error("Couldn't read the character. Refresh.");
        // Its write joins its own row's action after the reads below, though another row's save waits meanwhile:
        // so the row offers Undo.
        const inOwnAction = captureGesture();
        busy.val = true;
        try {
            const active = await readCharacterInPlay(current.val);
            if (name !== selected.val) throw new Error(CHARACTER_CHANGED);
            const root = name === active ? "" : `PlayerDATABASE.h[${name}].h.`;
            const fieldOf = (index) => (index === null ? "Money" : `Lv0[${index}]`);
            const before = await Promise.all(changes.map(([index]) => gga(`${root}${fieldOf(index)}`)));
            const changed = changes.filter(([, next], i) => before[i] !== next);
            // The game already holds it (it moved on since the read): the rows show what it holds.
            if (!changed.length) {
                changes.forEach(([index], i) => (getOrCreateState(values, index).val = before[i]));
                return { cancelled: true };
            }
            const writes = [];
            for (const [index, next] of changed) {
                if (index !== null) {
                    const required = await readComputed("player", "expRequired", [index, next]);
                    if (!Number.isFinite(required)) throw new Error("The game sent a bad XP need. Refresh.");
                    writes.push({ path: `${root}Exp0[${index}]`, value: 0 });
                    writes.push({ path: `${root}ExpReq0[${index}]`, value: required });
                }
                writes.push({ path: `${root}${fieldOf(index)}`, value: next });
            }
            // The game writes only while `active` is still in play, checked as it writes.
            await inOwnAction(() => writeManyVerified(writes, { character: active }));
            return changes.length === 1 ? changes[0][1] : changes;
        } catch (caught) {
            message.val =
                caught.message === CHARACTER_CHANGED || caught.message === NO_CHARACTER
                    ? caught.message
                    : `${caught.message} Some values may have saved; Refresh shows them.`;
            throw caught;
        } finally {
            busy.val = false;
        }
    };

    // Set all on the skills: every level in one write, then each line shows its level.
    const setAllLevels = async (plan) => {
        const indexOf = new Map([...values].map(([index, state]) => [state, index]));
        const changes = plan.map(({ line, value }) => [indexOf.get(line.valueState), value]);
        const saved = await setValues(selected.val, changes);
        if (saved?.cancelled) return;
        plan.forEach(({ line, value }) => (line.valueState.val = value));
    };

    const renderRow = (name, index, title) => {
        const money = index === null;
        return EditableNumberRow({
            valueState: getOrCreateState(values, index),
            disabled: unavailable,
            normalize: (raw) => {
                if (String(raw).trim() === "") return null;
                const next = money ? parseNumber(String(raw)) : Number(raw);
                return Number.isFinite(next) && next >= (money ? 0 : 1) && (money || Number.isSafeInteger(next))
                    ? next
                    : null;
            },
            write: (next) => setValues(name, [[index, next]]),
            renderInfo: () =>
                RowTitles({
                    name: title,
                    warning: index === 0 ? () => "Raising it gets you shadowbanned." : undefined,
                }),
            inputMode: money ? "float" : "int",
            inputProps: { "aria-label": title, ...(money ? { formatter: largeFormatter, parser: largeParser } : {}) },
            adjustInput: money
                ? (raw, delta, current) => {
                      const base = parseNumber(String(raw)) ?? current;
                      return Math.max(0, base + delta * formattedStep(base));
                  }
                : undefined,
            // The skills' levels are the list's lines for Set all; money and the main level (a ban risk) never are.
            // Set all keeps a row's own bounds: a skill level is 1 or more, and a whole number.
            setAll:
                index > 0
                    ? { min: 1, refuse: (value) => (Number.isSafeInteger(value) ? null : "whole numbers only") }
                    : null,
        });
    };

    const load = async () => {
        if (busy.val) return;
        // Cleared by the player's own load only: the read again after a save that landed in part keeps its warning.
        message.val = "";
        await run(async () => {
            const active = await readCharacterInPlay();
            const [rawNames, rawSkills] = await Promise.all([gga("GetPlayersUsernames"), readCList("SkillNames")]);
            const names = toIndexedArray(rawNames).filter((name) => typeof name === "string" && name.length > 0);
            if (!names.includes(active)) throw new Error(NO_CHARACTER);
            if (!names.includes(selected.val)) selected.val = active;
            const name = selected.val;
            // The shared resolver treats dots and brackets as separators, even inside a name.
            if (/[.[\]]/.test(name))
                throw new Error("This character name cannot be addressed by the game path editor.");
            let levels;
            let money;
            if (name === active) {
                [levels, money] = await Promise.all([gga("Lv0"), gga("Money")]);
            } else {
                const entries = await readGgaEntries("PlayerDATABASE.h", [name], ["Lv0", "Money"]);
                ({ Lv0: levels, Money: money } = unwrapH(entries[name]) ?? {});
            }
            levels = toIndexedArray(levels);
            if (!levels.length || !Number.isFinite(money) || !levels.every(Number.isFinite)) {
                throw new Error("Player data is incomplete. Refresh after entering the game.");
            }
            await readCharacterInPlay(active);
            current.val = active;
            const fields = [
                { index: null, title: "Money", value: money },
                { index: 0, title: "Main level", value: levels[0] },
            ];
            toIndexedArray(rawSkills)
                .slice(0, 20)
                .forEach((skill, offset) => {
                    const index = offset + 1;
                    if (
                        typeof skill === "string" &&
                        /[a-z]/i.test(skill) &&
                        skill !== "Blank" &&
                        Number.isFinite(levels[index]) &&
                        levels[index] >= 0
                    ) {
                        fields.push({ index, title: `${skill.replace(/_/g, " ")} level`, value: levels[index] });
                    }
                });
            characterSelector.setCharacters(names);
            reconcileMoney(name, () => [renderRow(name, null, "Money")]);
            const levelFields = fields.filter(({ index }) => index !== null);
            reconcileRows(JSON.stringify([name, levelFields.map(({ index, title }) => [index, title])]), () =>
                levelFields.map(({ index, title }) => renderRow(name, index, title))
            );
            fields.forEach(({ index, value }) => {
                getOrCreateState(values, index).val = value;
            });
        });
    };

    load();
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Levels",
        description: "A character's levels and money. A new level starts its XP at 0; talent points stay.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy.val }),
        toolbar: characterSelector.node,
        state: { loading, error },
        loadingText: "Reading the character",
        errorTitle: "Couldn't read the character",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            div({ class: "write-status", role: "status", "aria-live": "polite" }, message),
            // Money is one number of its own, not one of the levels Set all fills: its own short panel above them.
            ListPanel({ className: "player-money", body: moneyRows, short: true }),
            ListPanel({
                // A question asked for one character asks again once another is picked.
                setAll: {
                    word: (n) => `skill level${n === 1 ? "" : "s"}`,
                    write: setAllLevels,
                    askedFor: () => selected.val,
                },
                body: rows,
            })
        ),
    });
};
export default definePage({
    id: "account.player",
    world: "account",
    system: "Player",
    tab: "Levels",
    description: "Character levels and money.",
    keywords: ["Characters"],
    component: PlayerTab,
});
