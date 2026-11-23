/**
 * W3 — Construction: Buildings Tab
 *
 * Data sources:
 *   gga.TowerInfo[i]       — current level of building i
 *   gga.TowerInfo[i + 27]  — pending/target level of building i
 *   cList.TowerInfo[i][0]  — building name
 *   cList.TowerInfo[i][8]  — base max level
 *
 * Real max level is the base cap plus the game's Workbench helper
 * (read through the injected ActorEvents bridge, not reimplemented in the UI).
 *
 * When setting a building level, write both TowerInfo[i] and TowerInfo[i + 27].
 *
 * One list in the game's order, in its three kinds; Max all sits in the tray and acts on the buildings the top bar's search shows.
 */

/*
 * W3 - Construction: Cogs Tab
 *
 * Data sources:
 *   gga.FlagUnlock[0..119]          - unlock/charge state per slot:
 *                                      0 = locked, positive = charging toward unlock, <= -11 = unlocked
 *   cList.FlagReqs[0..95]     - raw charge cap for each main-board slot;
 *                                      game multiplies by x25 to get the displayed cap
 *   gga.FlagsPlaced[0..N]           - array of slot indices where flags are placed;
 *                                      -1 marks an empty/cleared entry
 *   gga.CogOrder[0..251]            - cog or player name per game slot:
 *                                      board [0-95], player shelf [96-107],
 *                                      cog shelf [108-227], tiny cogs [228-251]
 *   gga.CogMap[0..251].h            - stat fields per slot (a-k); each key is a named bonus
 *
 * Side-rail UI slots (96-119) map to CogOrder[228-251] (tiny cog range).
 * FlagReq formula for main slots: 25 * cList.FlagReqs[index].
 * FlagReq formula for side slots:
 *   5e6 * (1 + min(9, 9*(b-96)) + max(0, 10*(b-97))) * 4^(b-96)
 *   Source: p._customBlock_WorkbenchStuff("FlagReq", b, e) - game line 12134
 *
 * When locking/unlocking a slot that has a flag, the corresponding FlagsPlaced
 * entry must also be cleared (set to -1) to prevent the flag-charge system from
 * overwriting the -11 sentinel and re-locking the slot.
 *
 * Locking is blocked whenever a cog or player occupies the slot (CogOrder != "Blank").
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage, whenLeft } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import {
    bonusText,
    cleanName,
    createStaticRowReconciler,
    largeFormatter,
    largeParser,
    oneAtATime,
    readLevelDefinitions,
    runBulkSet,
    toNum,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

import { gga, readCList, readComputed, readComputedMany } from "../../../services/api.js";
import { Cogs } from "../../../assets/cogs.js";
import { toIndexedArray } from "../../../utils/index.js";
import { formatNumber, parseNumber } from "../../../utils/numberFormat.js";
import { SaveState, saveStateClass, useAutoSave } from "../../../components/views/account/autoSave.js";
import { NumberInput, getNumberInputLiveRaw, setNumberInputValue } from "../../../components/NumberInput.js";
import { PickInPlace } from "../../../components/views/account/components/PickInPlace.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";

const { div, button, span, h3 } = van.tags;

const MAIN_COLS = 12;
const MAIN_ROWS = 8;
const MAIN_SLOT_COUNT = MAIN_COLS * MAIN_ROWS; // 96
const SIDE_SLOT_COUNT = 12;
const LEFT_SIDE_START = MAIN_SLOT_COUNT; // 96
const RIGHT_SIDE_START = LEFT_SIDE_START + SIDE_SLOT_COUNT; // 108
const TOTAL_SLOT_COUNT = MAIN_SLOT_COUNT + SIDE_SLOT_COUNT * 2; // 120

const UNLOCKED_SENTINEL = -11;
// CogOrder[228..251] = tiny cog slots (24 slots), mapped to side-rail UI indices 96..119
const COGORDER_SIDE_START = 228;

const POPOVER_WIDTH = 420;
const POPOVER_HEIGHT = 520;
const POPOVER_GAP = 4;

const PREMIUM_COG_IDS = new Set(["CogY", "CogZA00", "CogZA01", "CogZA02", "CogZA03"]);
const COG_MAP_FIELD_ORDER = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"];
const COG_MAP_FIELD_META = {
    a: { keyName: "Build rate / hr", meaning: "Flat build rate" },
    b: { keyName: "Construction EXP / hr", meaning: "Flat construction EXP" },
    c: { keyName: "Flaggy rate / hr", meaning: "Flat flaggy rate" },
    d: { keyName: "Bonus construction EXP %", meaning: "% bonus construction EXP" },
    e: { keyName: "Build rate %", meaning: "% build rate" },
    f: { keyName: "Player construction EXP %", meaning: "% player construction EXP" },
    g: { keyName: "Flaggy rate %", meaning: "% flaggy rate" },
    h: { keyName: "Pattern", meaning: "Which cogs its % bonus reaches" },
    i: { keyName: "Board marker", meaning: "Used by the game while it works out the board" },
    j: { keyName: "Speed to flags %", meaning: "% speed to flags" },
    k: { keyName: "Nothing", meaning: 'The game\'s empty stat ("Nothing sowwy")' },
};
const isMainSlot = (index) => index >= 0 && index < MAIN_SLOT_COUNT;
const isSideSlot = (index) => index >= MAIN_SLOT_COUNT && index < TOTAL_SLOT_COUNT;
const TINY_COG_TYPES = new Set(["_", "a", "b"]);
const TINY_COG_MAX_TIER = 11;
const renderCogSvg = (id, className) => {
    const SvgCog = Cogs[id];
    if (typeof SvgCog !== "function") return new Text("");
    return SvgCog({
        class: className,
        width: "100%",
        height: "100%",
        preserveAspectRatio: "xMidYMid meet",
    });
};

const getCogOrderIndex = (uiIndex) =>
    uiIndex < MAIN_SLOT_COUNT ? uiIndex : COGORDER_SIDE_START + (uiIndex - MAIN_SLOT_COUNT);

const getTinyTier = (cogId) => {
    const id = String(cogId ?? "");
    if (!id.startsWith("CogSm")) return null;
    const tier = Number(id.substring(6));
    return Number.isFinite(tier) ? tier : null;
};

const getTinyTypeCode = (cogId) => {
    const id = String(cogId ?? "");
    return id.startsWith("CogSm") ? id.charAt(5) || null : null;
};

const clampTinyTier = (value) => Math.max(0, Math.min(TINY_COG_MAX_TIER - 1, Math.round(toNum(value))));

const cloneCogMapStats = (entry) => {
    if (!entry || typeof entry !== "object" || !entry.h || typeof entry.h !== "object") return {};
    return { ...entry.h };
};

const getSlotState = (rawValue) => {
    const val = toNum(rawValue);
    if (val <= UNLOCKED_SENTINEL) return "unlocked";
    if (val === 0) return "locked";
    return "charging";
};

const getSlotName = (index) => {
    if (isMainSlot(index)) {
        const row = Math.floor(index / MAIN_COLS) + 1;
        const col = index % MAIN_COLS;
        const letter = String.fromCharCode(65 + col);
        return `${letter}-${row}`;
    }

    if (index >= LEFT_SIDE_START && index < TOTAL_SLOT_COUNT) {
        return `Z-${index - LEFT_SIDE_START + 1}`;
    }

    return `SLOT-${index}`;
};

const getSideSlotCap = (index) => {
    const r0 = Math.round(index - 96);
    const r1 = Math.round(index - 97);
    return Math.round(5e6 * (1 + Math.min(9, 9 * r0) + Math.max(0, 10 * r1)) * Math.pow(4, r0));
};

const formatMainCharge = (rawValue, rawCap) => {
    const state = getSlotState(rawValue);
    const cap = Math.max(0, Math.round(toNum(rawCap) * 25));
    const capLabel = cap > 0 ? formatNumber(cap) : "?";
    const cur = state === "locked" ? 0 : Math.max(0, Math.round(toNum(rawValue)));
    return `${formatNumber(cur)} / ${capLabel}`;
};

const formatSideCharge = (rawValue, index) => {
    const cur = Math.max(0, Math.round(toNum(rawValue)));
    const cap = getSideSlotCap(index);
    return `${formatNumber(cur)} / ${formatNumber(cap)}`;
};

const stateLabel = (state) => {
    if (state === "unlocked") return "Unlocked";
    if (state === "locked") return "Locked";
    return "Unlocking";
};

const isPlayerCog = (cogId) => String(cogId ?? "").startsWith("Player_");
const isReadOnlyCog = (cogId) => isPlayerCog(cogId) || PREMIUM_COG_IDS.has(String(cogId ?? ""));

// One status line that stays in place, so assistive technology hears each change.
const renderWriteStatus = (statusState, labels) =>
    span(
        {
            class: () => `write-status${statusState.val ? ` write-status--${statusState.val}` : ""}`,
            role: "status",
        },
        () => labels[statusState.val] ?? ""
    );

const cogsUiStore = {
    popupHost: null,
};

const ensureCogsPopupHost = () => {
    if (!cogsUiStore.popupHost) {
        // One fixed popup host is reused across Cogs mounts to preserve popover positioning.
        const host = document.createElement("div");
        host.className = "cogs-popup-host";
        document.body.appendChild(host);
        cogsUiStore.popupHost = host;
    }
    return cogsUiStore.popupHost;
};

/** `save` (a useAutoSave) saves this row on its own; `state` only shows one that a group of rows shares. */
const CogsEditorRow = ({ code, name, meaning, inputNode, save = null, state = save }) =>
    div(
        {
            class: () => `cogs-cog-stat-row ${state ? saveStateClass(state.status.val, state.undo) : ""}`,
            ...(save?.handlers ?? {}),
        },
        div({ class: "cogs-cog-stat-row__code" }, code),
        div(
            { class: "cogs-cog-stat-row__text" },
            div({ class: "cogs-cog-stat-row__name" }, name),
            div({ class: "cogs-cog-stat-row__meaning" }, meaning)
        ),
        div({ class: "cogs-cog-stat-row__edit" }, state ? SaveState(state) : null, inputNode)
    );

const CogsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Cogs" });

    const activeSlot = van.state(null);
    const popupPos = van.state({ left: 24, top: 24, maxHeight: POPOVER_HEIGHT });
    const slotValues = Array.from({ length: TOTAL_SLOT_COUNT }, () => van.state(0));
    const slotCaps = Array.from({ length: MAIN_SLOT_COUNT }, () => van.state(0));
    const flaggedSlots = van.state(new Set());
    const flagsRaw = van.state([]);
    // Lock and Unlock wait for a read of the board that worked: before it, every slot reads as locked and no flag is
    // known, so an Unlock would leave the slot's flag behind.
    const loaded = van.state(false);
    const cogOrders = Array.from({ length: TOTAL_SLOT_COUNT }, () => van.state("Blank"));
    const cogMapStats = Array.from({ length: TOTAL_SLOT_COUNT }, () => van.state({}));
    const activeCogName = van.state("Blank");
    const activeCogNameStatus = van.state("idle");
    const cogNameCache = new Map();
    let activeCogNameRequestId = 0;
    const tinyTypeInput = van.state("_");
    const tinyTierInput = van.state("1");

    const { status: lockStatus, run: runLockWrite, clearStatus: clearLockStatus } = useWriteStatus({ errorMs: 0 });
    // One Lock or Unlock runs at a time, and its result shows only on the slot it was for. A failure waits until
    // that slot is open, then shows like any other result.
    const lockSlot = van.state(null);
    const shownLockStatus = van.derive(() => (activeSlot.val === lockSlot.val ? lockStatus.val : null));
    let lockErrorTimer = null;
    van.derive(() => {
        if (shownLockStatus.val !== "error") return;
        clearTimeout(lockErrorTimer);
        // It clears only the failure it showed: another slot's later one waits for that slot to open.
        const shownFor = lockSlot.rawVal;
        lockErrorTimer = setTimeout(() => {
            if (lockStatus.val === "error" && lockSlot.val === shownFor) clearLockStatus();
        }, 1200);
    });

    const getActiveIndex = () => activeSlot.val ?? 0;
    const getSlotCogId = (index) => String(cogOrders[index].val ?? "Blank");

    // A tiny cog id being written, by slot: reopening the slot meanwhile shows it, not the one it replaces.
    const pendingTiny = new Map();
    const syncTinyInputsFromSlot = (index) => {
        if (!isSideSlot(index)) return;
        const cogId = pendingTiny.get(index) ?? getSlotCogId(index);
        const typeCode = getTinyTypeCode(cogId);
        tinyTypeInput.val = TINY_COG_TYPES.has(typeCode) ? typeCode : "_";
        tinyTierInput.val = String(clampTinyTier(getTinyTier(cogId)) + 1);
    };

    const resolveCogName = async (cogId) => {
        const id = String(cogId ?? "Blank");
        if (!id || id === "Blank") return "Blank";
        if (isPlayerCog(id)) return id.substring("Player_".length) || id;
        if (cogNameCache.has(id)) return cogNameCache.get(id);
        const computedName = await readComputed("runCodeType", id, []);
        const parsedName = computedName ? String(computedName).replaceAll("_", " ") : id;
        cogNameCache.set(id, parsedName);
        return parsedName;
    };

    const refreshActiveCogName = async (index) => {
        const reqId = ++activeCogNameRequestId;
        const cogId = getSlotCogId(index);
        activeCogName.val = cogId;
        activeCogNameStatus.val = "loading";
        try {
            const name = await resolveCogName(cogId);
            if (reqId !== activeCogNameRequestId) return;
            activeCogName.val = name;
            activeCogNameStatus.val = "success";
        } catch {
            if (reqId !== activeCogNameRequestId) return;
            activeCogName.val = cogId;
            activeCogNameStatus.val = "error";
        }
    };

    const load = async () =>
        run(async () => {
            const [rawUnlock, rawCaps, rawFlags, rawCogOrder, rawCogMap] = await Promise.all([
                gga("FlagUnlock"),
                readCList("FlagReqs"),
                gga("FlagsPlaced"),
                gga("CogOrder"),
                gga("CogMap"),
            ]);

            const unlockArr = toIndexedArray(rawUnlock ?? []);
            const capArr = toIndexedArray(rawCaps ?? []);
            const flagsArr = toIndexedArray(rawFlags ?? []);
            const cogOrderArr = toIndexedArray(rawCogOrder ?? []);
            const cogMapArr = toIndexedArray(rawCogMap ?? []);
            const nextSlotValues = Array.from({ length: TOTAL_SLOT_COUNT }, (_, i) => toNum(unlockArr[i]));
            const nextSlotCaps = Array.from({ length: MAIN_SLOT_COUNT }, (_, i) => toNum(capArr[i]));
            const nextFlagsRaw = [...flagsArr];
            const nextFlaggedSlots = new Set(nextFlagsRaw.map((v) => toNum(v)).filter((v) => v >= 0));
            const nextCogOrders = Array.from({ length: TOTAL_SLOT_COUNT }, (_, i) => {
                const cogIdx = getCogOrderIndex(i);
                return cogOrderArr[cogIdx] ?? "Blank";
            });
            const nextCogMapStats = Array.from({ length: TOTAL_SLOT_COUNT }, (_, i) => {
                const cogIdx = getCogOrderIndex(i);
                return cloneCogMapStats(cogMapArr[cogIdx]);
            });

            for (let i = 0; i < TOTAL_SLOT_COUNT; i++) {
                slotValues[i].val = nextSlotValues[i];
                cogOrders[i].val = nextCogOrders[i];
                cogMapStats[i].val = nextCogMapStats[i];
            }
            for (let i = 0; i < MAIN_SLOT_COUNT; i++) slotCaps[i].val = nextSlotCaps[i];

            flaggedSlots.val = nextFlaggedSlots;
            flagsRaw.val = nextFlagsRaw;
            loaded.val = true;
            if (activeSlot.val !== null) {
                void refreshActiveCogName(activeSlot.val);
                syncTinyInputsFromSlot(activeSlot.val);
            }
        });

    const setSlotLockState = async (index, unlock) => {
        const next = unlock ? UNLOCKED_SENTINEL : 0;
        lockSlot.val = index;
        await runLockWrite(async () => {
            // The flag goes first: if that fails the slot is as it was, and if the slot's write fails the flag's
            // removal stays, so the press can be tried again either way.
            if (flaggedSlots.val.has(index)) {
                const arr = flagsRaw.val;
                const pos = arr.findIndex((v) => toNum(v) === index);
                if (pos >= 0) {
                    const flagPath = `FlagsPlaced[${pos}]`;
                    await writeVerified(flagPath, -1);
                    const newRaw = [...arr];
                    newRaw[pos] = -1;
                    flagsRaw.val = newRaw;
                    const newFlagged = new Set(flaggedSlots.val);
                    newFlagged.delete(index);
                    flaggedSlots.val = newFlagged;
                }
            }

            await writeVerified(`FlagUnlock[${index}]`, next);
            slotValues[index].val = next;
        });
    };

    // A tiny cog's type and tier make one id: they save together on Enter or on leaving them. Each side slot has
    // its own save, so a save's saving…, ✓ or reason stays with the slot it was for.
    const tinyDrafts = () => ({ type: tinyTypeInput.val, tier: tinyTierInput.val });
    const createTinySave = (index) =>
        useAutoSave({
            // The type and tier as committed: a save waiting its turn still saves them after another slot opens.
            capture: tinyDrafts,
            prepare: (drafts) => {
                // Checked without a commit (moving between the two fields), the fields show the open slot only.
                if (!drafts) {
                    if (activeSlot.val !== index) return { unchanged: true };
                    drafts = tinyDrafts();
                }
                const normalizedType = String(drafts.type ?? "")
                    .trim()
                    .slice(0, 1);
                if (!TINY_COG_TYPES.has(normalizedType)) throw new Error("type is _, a or b");
                const tier = toNum(drafts.tier, NaN);
                if (!Number.isInteger(tier) || tier < 1 || tier > TINY_COG_MAX_TIER)
                    throw new Error(`tier 1 to ${TINY_COG_MAX_TIER}`);
                const newId = `CogSm${normalizedType}${tier - 1}`;
                if (newId === getSlotCogId(index)) return { unchanged: true };
                return {
                    write: async () => {
                        pendingTiny.set(index, newId);
                        try {
                            await writeVerified(`CogOrder[${getCogOrderIndex(index)}]`, newId);
                        } finally {
                            if (pendingTiny.get(index) === newId) pendingTiny.delete(index);
                        }
                        cogOrders[index].val = newId;
                        if (activeSlot.val === index) void refreshActiveCogName(index);
                    },
                };
            },
            revert: () => syncTinyInputsFromSlot(index),
        });

    const tinySaves = new Map();
    const tinySaveFor = (index) => {
        if (!tinySaves.has(index)) tinySaves.set(index, createTinySave(index));
        return tinySaves.get(index);
    };

    // A tiny cog type's name, read once from the game's name for its first tier ("Tiny T1 Flaggy Cog": Flaggy).
    const tinyTypeNames = van.state({});
    const readTinyTypeNames = async () => {
        if (Object.keys(tinyTypeNames.val).length) return;
        const names = await Promise.all(
            [...TINY_COG_TYPES].map((type) => resolveCogName(`CogSm${type}0`).catch(() => type))
        );
        tinyTypeNames.val = Object.fromEntries(
            [...TINY_COG_TYPES].map((type, i) => [type, names[i].replace(/^Tiny T\d+ /, "").replace(/ Cog$/, "")])
        );
    };

    const renderTinyEditor = () => {
        const index = getActiveIndex();
        if (!isSideSlot(index)) return null;
        const tinySave = tinySaveFor(index);
        void readTinyTypeNames();
        const stepTinyTier = (delta) => {
            const tier = Math.round(toNum(tinyTierInput.val, 1)) + delta;
            setNumberInputValue(tinyTierInput, String(Math.max(1, Math.min(TINY_COG_MAX_TIER, tier))));
            void tinySave.save();
        };

        return div(
            {
                class: () => `cogs-tiny-editor ${saveStateClass(tinySave.status.val, tinySave.undo)}`,
                ...tinySave.handlers,
            },

            CogsEditorRow({
                code: "t",
                name: "Tiny type",
                meaning: "What the tiny cog adds to",
                inputNode: StepPicker({
                    name: "Tiny type",
                    steps: [...TINY_COG_TYPES].map((type) => ({
                        value: type,
                        label: () => tinyTypeNames.val[type] ?? type,
                    })),
                    picked: () => tinyTypeInput.val,
                    onPick: (type) => {
                        tinyTypeInput.val = type;
                        void tinySave.save();
                    },
                }),
            }),
            CogsEditorRow({
                code: "lvl",
                name: "Tiny tier",
                meaning: `1 to ${TINY_COG_MAX_TIER}`,
                inputNode: NumberInput({
                    value: tinyTierInput,
                    mode: "int",
                    cap: TINY_COG_MAX_TIER,
                    "aria-label": "Tiny tier",
                    onDecrement: () => stepTinyTier(-1),
                    onIncrement: () => stepTinyTier(1),
                }),
                state: tinySave,
            })
        );
    };

    const computePopupPos = (mouseX, mouseY) => {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;

        let left = mouseX + POPOVER_GAP;
        if (left + POPOVER_WIDTH > vw) {
            left = Math.max(0, mouseX - POPOVER_WIDTH - POPOVER_GAP);
        }

        const MIN_VISIBLE = 200;
        let top = mouseY + POPOVER_GAP;
        const maxAllowedTop = Math.max(0, vh - MIN_VISIBLE);
        if (top > maxAllowedTop) top = maxAllowedTop;

        const maxHeight = Math.max(MIN_VISIBLE, vh - top - POPOVER_GAP);

        return { left, top, maxHeight };
    };

    const openSlotPopup = (index, event) => {
        const mouseX = event?.clientX ?? 0;
        const mouseY = event?.clientY ?? 0;
        popupPos.val = computePopupPos(mouseX, mouseY);
        activeSlot.val = index;
        syncTinyInputsFromSlot(index);
        void refreshActiveCogName(index);
    };

    const closeSlotPopup = () => {
        activeSlot.val = null;
    };

    const renderCogOverlay = (index) => {
        const cogId = getSlotCogId(index);
        if (cogId === "Blank") return new Text("");
        return renderCogSvg(isPlayerCog(cogId) ? "headBIG" : cogId, "cogs-slot-cog");
    };

    const renderSlotBackground = (index) => {
        const state = getSlotState(slotValues[index].val);
        let id = "CogSq0";
        if (isMainSlot(index)) {
            id = state === "unlocked" ? "CogSq1" : "CogSq0";
        } else {
            id = state === "unlocked" ? "CogSq_S1" : "CogSq_S0";
        }
        return renderCogSvg(id, "cogs-slot-bg");
    };

    const renderSlot = (index, sizeClass) =>
        button(
            {
                type: "button",
                class: () => {
                    const state = getSlotState(slotValues[index].val);
                    return [
                        "cogs-slot",
                        sizeClass,
                        `cogs-slot--${state}`,
                        activeSlot.val === index && "cogs-slot--selected",
                    ]
                        .filter(Boolean)
                        .join(" ");
                },
                // The slot opens its editor beside it; pressed again, it closes it.
                "aria-expanded": () => String(activeSlot.val === index),
                onclick: (e) => (activeSlot.val === index ? closeSlotPopup() : openSlotPopup(index, e)),
                title: () => `${getSlotName(index)} (Index ${index})`,
            },
            () => renderSlotBackground(index),
            () => renderCogOverlay(index),
            () =>
                flaggedSlots.val.has(index)
                    ? renderCogSvg(isMainSlot(index) ? "CogFLflag" : "CogFLflagS1", "cogs-slot-flag")
                    : new Text("")
        );

    const leftRail = div(
        { class: "cogs-side-grid cogs-side-grid--left" },
        ...Array.from({ length: SIDE_SLOT_COUNT }, (_, i) => renderSlot(LEFT_SIDE_START + i, "cogs-slot--small"))
    );

    const mainGrid = div(
        { class: "cogs-main-grid" },
        ...Array.from({ length: MAIN_SLOT_COUNT }, (_, i) => renderSlot(i, "cogs-slot--main"))
    );

    const rightRail = div(
        { class: "cogs-side-grid cogs-side-grid--right" },
        ...Array.from({ length: SIDE_SLOT_COUNT }, (_, i) => renderSlot(RIGHT_SIDE_START + i, "cogs-slot--small"))
    );

    const boardPane = div(
        { class: "cogs-scroll scrollable-panel" },
        div(
            { class: "cogs-board-shell" },
            div({ class: "cogs-board-content" }, div({ class: "cogs-board-layout" }, leftRail, mainGrid, rightRail))
        )
    );

    // What the editor is built from: the slot, whether it's unlocked, whether its cog can be edited and which stats it
    // has. A read that changes only the values keeps the editor, and each stat field follows the game on its own.
    const editorShape = van.derive(() => {
        const index = getActiveIndex();
        const stats = cogMapStats[index].val ?? {};
        // rawVal: saving a tiny cog changes this id, and building the editor again would drop its focus.
        const cogId = String(cogOrders[index].rawVal ?? "Blank");
        const keys = COG_MAP_FIELD_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(stats, key));
        return [index, getSlotState(slotValues[index].val), isReadOnlyCog(cogId), keys.join("")].join("|");
    });

    // A stat's field is the shared one (NumberInput): it saves on Enter or on leaving it, − / + save at once, Escape
    // shows what the game holds. The pattern (h) is a word, picked in place out of the patterns on the board.
    const renderStatRow = (index, key, readOnly) => {
        const path = `CogMap[${getCogOrderIndex(index)}].h.${key}`;
        const held = () => cogMapStats[index].rawVal?.[key];
        const label = COG_MAP_FIELD_META[key]?.keyName ?? key;
        const row = (inputNode, save) =>
            CogsEditorRow({
                code: key,
                name: label,
                meaning: COG_MAP_FIELD_META[key]?.meaning ?? "Unknown field",
                inputNode,
                save,
            });

        if (typeof held() === "string") {
            let picked = held();
            const save = useAutoSave({
                prepare: () => {
                    if (readOnly || picked === held()) return { unchanged: true };
                    const next = picked;
                    return {
                        write: async () => {
                            await writeVerified(path, next);
                            cogMapStats[index].rawVal[key] = next;
                            cogMapStats[index].val = { ...cogMapStats[index].rawVal };
                        },
                    };
                },
                revert: () => (picked = held()),
            });
            const pick = PickInPlace({
                name: label,
                opener: () => {
                    const pattern = String(cogMapStats[index].val?.[key] ?? "");
                    return pattern.charAt(0).toUpperCase() + pattern.slice(1);
                },
                options: () =>
                    [...new Set(cogMapStats.map((stats) => stats.val?.[key]).filter((v) => typeof v === "string"))]
                        .sort()
                        .map((pattern) => ({ id: pattern, label: pattern.charAt(0).toUpperCase() + pattern.slice(1) })),
                picked: () => String(cogMapStats[index].val?.[key] ?? ""),
                onPick: (id) => {
                    picked = id;
                    void save.save();
                },
                disabled: readOnly,
                search: true,
            });
            return div(row(pick.opener, save), pick.panel);
        }

        const value = van.state(String(toNum(held(), 0)));
        // The field's text, or the exact value while it still shows the rounded one ("1.2M").
        const typed = () => {
            const raw = getNumberInputLiveRaw(value);
            return raw === undefined || raw === largeFormatter(value.val) ? value.val : raw;
        };
        // Each read shows what the game holds. Typed text stays, unless it is what the field showed or what the game
        // now holds: then it was no draft, and the field follows the game.
        van.derive(() => {
            const next = String(toNum(cogMapStats[index].val?.[key], 0));
            const raw = getNumberInputLiveRaw(value);
            if (raw === undefined || raw === largeFormatter(value.rawVal) || raw === largeFormatter(next))
                setNumberInputValue(value, next);
            else value.val = next;
        });
        const save = useAutoSave({
            prepare: () => {
                if (readOnly) return { unchanged: true };
                const text = String(typed()).trim();
                if (text === "") throw new Error("enter a value");
                const next = parseNumber(text);
                if (next === null || !Number.isFinite(next)) throw new Error("not a number");
                if (next === toNum(held(), 0)) return { unchanged: true };
                return {
                    write: async () => {
                        await writeVerified(path, next);
                        // In place: a new stats object would tell every field of the slot to follow it.
                        cogMapStats[index].rawVal[key] = next;
                        // Text typed since stays, for its own Enter, even the old value typed back.
                        if (String(typed()).trim() === text) setNumberInputValue(value, String(next));
                        else value.val = String(next);
                    },
                };
            },
            revert: () => setNumberInputValue(value, String(toNum(held(), 0))),
        });
        const step = (delta) => {
            if (readOnly) return;
            // A short form typed and not yet left ("1K") steps from what it means.
            setNumberInputValue(value, String(Math.max(0, (parseNumber(String(typed()).trim()) ?? 0) + delta)));
            void save.save();
        };
        return row(
            NumberInput({
                value,
                mode: "float",
                formatter: largeFormatter,
                parser: largeParser,
                "aria-label": label,
                disabled: readOnly,
                onDecrement: () => step(-1),
                onIncrement: () => step(1),
            }),
            save
        );
    };

    // Reads rawVal only: editorShape says when to build it again.
    const renderEditor = (index) => {
        if (getSlotState(slotValues[index].rawVal) !== "unlocked") return span({ hidden: true });
        if (!isMainSlot(index)) return renderTinyEditor();
        const stats = cogMapStats[index].rawVal ?? {};
        const readOnly = isReadOnlyCog(String(cogOrders[index].rawVal ?? "Blank"));
        const presentKeys = COG_MAP_FIELD_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(stats, key));
        return div(
            { class: "cogs-modal-details" },
            div(
                { class: "cogs-cog-stats" },
                div({ class: "cogs-cog-stats__warning" }, "Base values. In the game, the cogs around it change them."),
                div({ class: "cogs-cog-stats__list" }, ...presentKeys.map((key) => renderStatRow(index, key, readOnly)))
            )
        );
    };

    // The editor is built outside VanJS's dependency capture: a field's state, which NumberInput reads as it starts,
    // would otherwise build the editor again on every − / + and save, with the value from before the save.
    const editorHost = div({ class: "cogs-editor-host" });
    van.derive(() => {
        editorShape.val;
        const index = activeSlot.rawVal ?? 0;
        queueMicrotask(() => editorHost.replaceChildren(renderEditor(index)));
    });

    const popupCard = div(
        {
            class: "cogs-popup",
            onclick: (e) => e.stopPropagation(),
        },
        div(
            { class: "cogs-modal-header" },
            div(
                { class: "cogs-modal-header-left" },
                h3({}, () => getSlotName(getActiveIndex())),
                span(
                    {
                        class: () => {
                            const status = activeCogNameStatus.val;
                            const name = activeCogName.val;
                            const hidden = status !== "loading" && (!name || name === "Blank");
                            return `cogs-modal-cog-name${hidden ? " cogs-modal-cog-name--hidden" : ""}`;
                        },
                    },
                    () => (activeCogNameStatus.val === "loading" ? "..." : activeCogName.val || "")
                )
            ),
            span(
                {
                    class: () =>
                        `cogs-selection-state cogs-selection-state--${getSlotState(slotValues[getActiveIndex()].val)}`,
                },
                () => stateLabel(getSlotState(slotValues[getActiveIndex()].val))
            )
        ),
        div(
            { class: "cogs-modal-body" },
            // The charge and the flag follow each read on their own lines; the editor below is built again only when
            // the slot, its lock or its cog's kind of stats change, so a field being typed in stays.
            () => {
                const index = getActiveIndex();
                if (getSlotState(slotValues[index].val) === "unlocked") return span({ hidden: true });
                return div(
                    { class: "cogs-selection-charge" },
                    span({ class: "cogs-selection-charge__label" }, "Charge"),
                    span(
                        { class: "cogs-selection-charge__value" },
                        isMainSlot(index)
                            ? formatMainCharge(slotValues[index].val, slotCaps[index].val)
                            : formatSideCharge(slotValues[index].val, index)
                    )
                );
            },
            () =>
                flaggedSlots.val.has(getActiveIndex())
                    ? div(
                          { class: "cogs-flag-indicator" },
                          Cogs.FlagIcon({ class: "cogs-flag-indicator__icon", width: "14", height: "14" }),
                          span("Flag placed")
                      )
                    : span({ hidden: true }),
            editorHost
        ),
        div(
            { class: "cogs-modal-footer" },
            div(
                { class: "cogs-selection-actions" },
                ActionButton({
                    label: "Lock",
                    status: shownLockStatus,
                    variant: "danger",
                    disabled: () => {
                        const index = getActiveIndex();
                        return (
                            !loaded.val ||
                            lockStatus.val === "loading" ||
                            getSlotState(slotValues[index].val) === "locked" ||
                            getSlotCogId(index) !== "Blank"
                        );
                    },
                    onClick: () => setSlotLockState(getActiveIndex(), false),
                }),
                ActionButton({
                    label: "Unlock",
                    status: shownLockStatus,
                    disabled: () => {
                        const index = getActiveIndex();
                        return (
                            !loaded.val ||
                            lockStatus.val === "loading" ||
                            getSlotState(slotValues[index].val) === "unlocked" ||
                            PREMIUM_COG_IDS.has(getSlotCogId(index))
                        );
                    },
                    onClick: () => setSlotLockState(getActiveIndex(), true),
                })
            ),
            div(
                { class: "cogs-modal-footer-right" },
                renderWriteStatus(shownLockStatus, {
                    loading: "Saving…",
                    success: "Saved",
                    error: "Couldn't save",
                }),
                button({ type: "button", class: "btn-quiet btn-sm", onclick: closeSlotPopup }, "Close")
            )
        )
    );

    const popup = div(
        {
            class: () => `cogs-popup-overlay ${activeSlot.val === null ? "cogs-popup-overlay--hidden" : ""}`,
            onclick: (e) => {
                if (e.target === e.currentTarget) closeSlotPopup();
            },
        },
        popupCard
    );

    van.derive(() => {
        popupCard.style.setProperty("--cogs-popup-left", `${popupPos.val.left}px`);
        popupCard.style.setProperty("--cogs-popup-top", `${popupPos.val.top}px`);
        popupCard.style.setProperty("--cogs-popup-max-height", `${popupPos.val.maxHeight}px`);
    });

    load();

    const popupHost = ensureCogsPopupHost();
    popupHost.replaceChildren();
    van.add(popupHost, popup);

    // The board as the Cogs tab's content; the Workbench page reads it with the buildings.
    return { node: boardPane, load, loading, error, close: closeSlotPopup };
};

const BUILDING_COUNT = 27;

// The game's three kinds, nine each, in its order: town buildings, worship towers, shrines.
const GROUPS = [{ title: "Buildings" }, { title: "Towers" }, { title: "Shrines" }];
const groupOf = (index) => Math.min(GROUPS.length - 1, Math.floor(index / 9));

// What a building does, in the game's words: a town building's current bonus ("Checkout Refresh Speed %"), a tower's or
// shrine's first line ("Zaps a single nearby monster", "Total Damage of all characters on the same map").
const buildingBonus = (index, description) => {
    const text = String(description ?? "");
    if (groupOf(index) === 0) {
        // The bonus line, and the next line too when the first runs on into it ("controlled via" "the Robotic Arm").
        const [line = "", next = ""] = (text.split("Current_Bonuses:")[1] ?? "").split("_@_").filter(Boolean);
        return bonusText(/^[a-z]/.test(next) ? `${line}_${next}` : line);
    }
    const first = cleanName(text.split(/(?<=[.!?])_|_@_/)[0]).replace(/^This shrine increases (the )?/, "");
    return (first.charAt(0).toUpperCase() + first.slice(1)).replace(/[.!]$/, "");
};

const BuildingRow = ({ index, name, bonus, maxLevel, levelState, inTurn, splitByRow }) =>
    ClampedLevelRow({
        valueState: levelState,
        max: maxLevel,
        // In turn with Max all, so neither writes one copy over the other's.
        write: (nextLevel) =>
            inTurn(async () => {
                // Both in one call to the game, so a dropped connection can't leave the level and its pending copy
                // apart. The game still writes them one by one: if it refuses one, the other stays written (History
                // lists it, and the row says why), and the row keeps the old level (see load), so the same save
                // writes both again. ponytail: an all-or-nothing write needs the game's writePaths to put it back.
                try {
                    await writeManyVerified([
                        { path: `TowerInfo[${index}]`, value: nextLevel },
                        { path: `TowerInfo[${index + BUILDING_COUNT}]`, value: nextLevel },
                    ]);
                } catch (error) {
                    if (error.results?.some((result) => result.ok)) splitByRow.add(index);
                    throw error;
                }
                splitByRow.delete(index);
                return nextLevel;
            }),
        renderInfo: () => RowTitles({ bonus, name }),
        maxAction: true,
    });

const ConstructionBuildingsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Construction Buildings" });
    const { status: bulkStatus, run: runMaxAll } = useWriteStatus();
    // Row saves and Max all write one at a time: a row saved while Max all runs saves after it, and Max all waits for
    // a row save that started before it.
    const inTurn = oneAtATime();
    const levelStates = Array.from({ length: BUILDING_COUNT }, () => van.state(0));
    // The buildings whose last row save the game took only in part.
    const splitByRow = new Set();
    const rowList = div({ class: "account-page-pane" });
    const buildings = van.state([]);
    const rowOf = new Map();
    const reconcileRows = createStaticRowReconciler(rowList);

    const load = async () =>
        run(async () => {
            const buildingRows = await readLevelDefinitions({
                levelsPath: "TowerInfo",
                definitionsPath: "TowerInfo",
                selectDefinitions: (_, definitions) => definitions.slice(0, BUILDING_COUNT),
                mapEntry: ({ definition, rawLevel, levels, index }) => ({
                    index,
                    name: cleanName(definition[0], `Building ${index + 1}`),
                    bonus: buildingBonus(index, definition[1]),
                    baseMax: toNum(definition[8]),
                    level: toNum(rawLevel),
                    pending: toNum(levels[index + BUILDING_COUNT]),
                }),
            });
            const computedResults = await readComputedMany(
                "workbench",
                "ExtraMaxLvAtom",
                buildingRows.map((building, i) => [building.baseMax, i])
            );

            const next = buildingRows.map((building, i) => {
                if (!computedResults[i]?.ok) {
                    throw new Error(`ExtraMaxLvAtom failed for building ${i}`);
                }
                const extraMax = toNum(computedResults[i].value);
                return { ...building, extraMax, maxLevel: building.baseMax + extraMax };
            });

            // One list in three quiet groups, like the Anvil's.
            reconcileRows(next.map((building) => `${building.name}:${building.maxLevel}`).join("|"), () =>
                GROUPS.map((group, g) =>
                    AccountSection({
                        title: group.title,
                        body: next
                            .filter((building) => groupOf(building.index) === g)
                            .map((building) => {
                                const row = BuildingRow({
                                    index: building.index,
                                    name: building.name,
                                    bonus: building.bonus,
                                    maxLevel: building.maxLevel,
                                    levelState: levelStates[building.index],
                                    inTurn,
                                    splitByRow,
                                });
                                rowOf.set(building.index, row);
                                return row;
                            }),
                    })
                )
            );

            // A building whose row save left its two copies apart (the game took one and refused the other) keeps
            // the copy the row showed, the one the save didn't change, so saving the new level again writes both, as
            // Liquid does. Max all plans from the game, so its own split shows the level and the next Max all ends it.
            // ponytail: lost when the tab opens again; a split found then shows the level.
            for (let i = 0; i < BUILDING_COUNT; i++) {
                const { level, pending } = next[i] ?? {};
                const kept = splitByRow.has(i) && pending !== level && toNum(levelStates[i].val) === pending;
                levelStates[i].val = toNum(kept ? pending : level);
            }
            buildings.val = next;
        });

    // The buildings Max all acts on: every one, or the ones the top bar's search shows.
    const shown = () => buildings.val.filter((building) => shownBySearch(rowOf.get(building.index)));
    const buildingWord = (n) => `building${n === 1 ? "" : "s"}`;

    // Max all runs on one press; a level above the max comes down to it.
    const doMaxAll = async () => {
        const entries = shown();
        const result = await runMaxAll(() =>
            inTurn(async () => {
                // Planned from the game at its turn, so a row saved before it is in what it plans from.
                const fresh = toIndexedArray(await gga("TowerInfo"));
                await runBulkSet({
                    entries,
                    getTargetValue: (building) => building.maxLevel,
                    getValueState: (building) => levelStates[building.index],
                    // Each copy only where the game holds another value; a building already there shows it.
                    getWrites: ({ entry, targetValue, valueState }) => {
                        const writes = [entry.index, entry.index + BUILDING_COUNT]
                            .filter((at) => toNum(fresh[at]) !== targetValue)
                            .map((at) => ({ path: `TowerInfo[${at}]`, value: targetValue }));
                        if (!writes.length) valueState.val = targetValue;
                        return writes;
                    },
                });
            })
        );
        // Some of it may have landed: the rows show what the game holds.
        if (!result.ok && !result.cancelled) await load();
    };

    load();

    // The buildings as the Buildings tab's rows and tray; the Workbench page reads them with the cog board.
    return {
        node: rowList,
        load,
        loading,
        error,
        tools: () =>
            div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Max all",
                    status: bulkStatus,
                    disabled: () => loading.val || !shown().length,
                    onClick: (e) => {
                        e.preventDefault();
                        return doMaxAll();
                    },
                })
            ),
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${buildingWord(n)}` : `All ${n} ${buildingWord(n)}`;
        },
    };
};

// The Workbench, as the game calls it: the buildings and the cog board as tabs on one page. The board is still as it
// was; its own pass comes later.
const PAGE_ID = "w3.construction.buildings";

const WorkbenchTab = () => {
    const buildings = ConstructionBuildingsTab();
    const cogs = CogsTab();
    // The cog editor sits on the page's body, not in its pane: leaving the page closes it.
    whenLeft(PAGE_ID, cogs.close);
    const loading = van.derive(() => buildings.loading.val || cogs.loading.val);
    // The page fails only when both reads do; one that fails says so in its own tab, and the other tab still works.
    const error = van.derive(() => (buildings.error.val && cogs.error.val) || "");
    const load = () => Promise.all([buildings.load(), cogs.load()]);
    const pane = (part, title) =>
        div(
            () =>
                part.error.val && !error.val
                    ? EmptyState({ failed: true, title, subtitle: part.error.val })
                    : div({ hidden: true }),
            part.node
        );
    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container",
        title: "Workbench",
        description: "Building levels, each up to its max with the Workbench's extra levels, and the cog board.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the workbench",
        errorTitle: "Couldn't read the workbench",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Workbench",
                tabs: [
                    { id: "buildings", label: "Buildings", content: pane(buildings, "Couldn't read the buildings") },
                    { id: "cogs", label: "Cogs", content: pane(cogs, "Couldn't read the cog board") },
                ],
                // The cog editor belongs to the Cogs tab: leaving the tab closes it.
                onTab: (tabId) => tabId !== "cogs" && cogs.close(),
                tools: buildings.tools,
                toolsLabel: buildings.toolsLabel,
                toolsOn: (tabId) => tabId === "buildings",
            })
        ),
    });
};

export default definePage({
    id: PAGE_ID,
    world: 3,
    system: "Construction",
    tab: "Workbench",
    description: "Building levels and the cog board.",
    keywords: ["Construction", "Buildings", "Towers", "Shrines", "Cogs", "Flags", "Cog board"],
    component: WorkbenchTab,
});
