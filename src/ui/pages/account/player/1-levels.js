import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readComputed, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formattedStep, parseNumber } from "../../../utils/numberFormat.js";
import { EditableNumberRow } from "../../../components/views/account/EditableNumberRow.js";
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
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { createCharacterSelector } from "../../../components/views/account/components/CharacterSelector.js";

const { div, span } = van.tags;

const PlayerTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Player" });
    const selected = van.state("");
    const current = van.state("");
    const busy = van.state(false);
    const message = van.state("");
    const values = new Map();
    const rows = div({ class: "account-list" });
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
        info: () =>
            selected.val === current.val
                ? "ACTIVE CHARACTER"
                : "SAVED CHARACTER. Open this character in-game before closing to save level edits.",
    });

    // A save asked for while another runs waits its turn, and reads the game again then.
    const inTurn = oneAtATime();
    // The line clears when a save is asked for, not at its turn, so the warning of a failed save before it stays.
    const setValue = (name, index, next) => {
        message.val = "";
        return inTurn(() => saveValue(name, index, next));
    };
    const saveValue = async (name, index, next) => {
        if (unavailable()) throw new Error("Player data is unavailable. Refresh and try again.");
        busy.val = true;
        try {
            const active = await readCharacterInPlay(current.val);
            if (name !== selected.val) throw new Error(CHARACTER_CHANGED);
            const root = name === active ? "" : `PlayerDATABASE.h[${name}].h.`;
            const field = index === null ? "Money" : `Lv0[${index}]`;
            const before = await gga(`${root}${field}`);
            if (before === next) return { cancelled: true };
            const writes = [];
            if (index !== null) {
                const required = await readComputed("player", "expRequired", [index, next]);
                if (!Number.isFinite(required)) throw new Error("The game returned an invalid XP requirement.");
                writes.push({ path: `${root}Exp0[${index}]`, value: 0 });
                writes.push({ path: `${root}ExpReq0[${index}]`, value: required });
            }
            writes.push({ path: `${root}${field}`, value: next });
            // The game writes only while `active` is still in play, checked as it writes.
            await writeManyVerified(writes, { character: active });
            return next;
        } catch (caught) {
            message.val =
                caught.message === CHARACTER_CHANGED || caught.message === NO_CHARACTER
                    ? caught.message
                    : `${caught.message} Refresh to reload player values; some writes may have applied.`;
            throw caught;
        } finally {
            busy.val = false;
        }
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
            write: (next) => setValue(name, index, next),
            renderInfo: () =>
                div(
                    { class: "account-row__name-group" },
                    span({ class: "account-row__name" }, title),
                    index === 0
                        ? span({ class: "option-warning" }, "Warning: changing the main level up will shadowban you.")
                        : null
                ),
            inputMode: money ? "float" : "int",
            inputProps: { "aria-label": title, ...(money ? { formatter: largeFormatter, parser: largeParser } : {}) },
            adjustInput: money
                ? (raw, delta, current) => {
                      const base = parseNumber(String(raw)) ?? current;
                      return Math.max(0, base + delta * formattedStep(base));
                  }
                : undefined,
            rowClass: `account-row--wide-controls${index === 0 ? " has-warning" : ""}`,
            controlsClass: "account-row__controls--xl",
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
            reconcileRows(JSON.stringify([name, fields.map(({ index, title }) => [index, title])]), () =>
                fields.map(({ index, title }) => renderRow(name, index, title))
            );
            fields.forEach(({ index, value }) => {
                getOrCreateState(values, index).val = value;
            });
        });
    };

    load();
    return PersistentAccountListPage({
        title: "PLAYER",
        description: "Edit levels and money. Level edits reset XP and leave talent points unchanged.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy.val }),
        state: { loading, error },
        loadingText: "READING PLAYER",
        errorTitle: "PLAYER READ FAILED",
        body: div(
            { class: "scrollable-panel content-stack" },
            characterSelector.node,
            div({ class: "write-status", role: "status", "aria-live": "polite" }, message),
            AccountSection({ title: "LEVELS & MONEY", body: rows })
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
