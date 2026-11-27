/**
 * W5 - Gaming
 *
 * One page, the game's gaming screens as its tabs: Garden, Imports, Rat King, Superbits, Palette. One read of the game
 * fills every tab; a tab's tools (Reclaim all, Unlock all, ...) show on that tab only.
 *
 * Data sources:
 *   gga.Gaming[0], [5]            - Bits, DNA
 *   gga.Gaming[1..3]              - the sprout upgrades' levels; cList.GamingUpgrades[n][0] their names
 *   gga.Gaming[4], [7]            - mutations unlocked (up to 8), the Evolve upgrade
 *   gga.Gaming[11]                - the Log Book: a letter per plant for how many of its 10 forms are found
 *                                   (Number2Letter: "_" none, "a" one ... "j" all ten); plants past the end have none
 *   gga.GamingSprout[25 + n][0]   - import n's level; cList.RandoListo2[1][n] its name ("Little_Sprinkler")
 *   gga.Gaming[8], OLA[192]       - Dirty Shovel: the highest gold nugget, gold nuggets dug
 *   gga.Gaming[9], [13]           - Autumn Squirrel's acorns, Immortal Snail's snail mail
 *   gga.Gaming[14]                - King Tokens; gga.GamingSprout[33][1..3] the King Rat's three upgrades
 *   gga.Research[11]              - reclaimed crowns: ids like "0_" (plant 1's base form) or "3c", kept in that order
 *   gga.Gaming[12]                - unlocked superbits, a letter each (Number2Letter[n] for superbit n);
 *                                   cList.GamingUpg[n] [0] its bonus, [3] its name ("Bits_Per|Achievement")
 *   gga.Spelunk[9][n], [49][n]    - palette colour n's level and Black Stars (0-2); cList.GamingPalette[n] [3] its
 *                                   name, [10] its bonus. The game keeps the palette's bonuses in DNSM.h.PaletteBonz
 *                                   until it is rebuilt, so a star saved here clears it.
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import { deleteGga, gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ClampedLevelRow } from "../../../components/views/account/ClampedLevelRow.js";
import { SimpleNumberRow } from "../../../components/views/account/SimpleNumberRow.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { AccountSection } from "../../../components/views/account/components/AccountSection.js";
import { AccountToggleRow } from "../../../components/views/account/components/AccountToggleRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { StateSwitch } from "../../../components/views/account/components/StateSwitch.js";
import { TabbedList, toolsPerTab, loadParts } from "../../../components/views/account/tabShared.js";
import {
    bonusText,
    cleanName,
    createIndexedStateGetter,
    createStaticRowReconciler,
    oneAtATime,
    runBulkSet,
    toInt,
    toNum,
    useWriteStatus,
    writeVerified,
} from "../../../components/views/account/accountShared.js";
import { AllToTool } from "../../../components/views/account/BulkActionBar.js";

const { button, div, span } = van.tags;

const plural = (n, word) => `${word}${n === 1 ? "" : "s"}`;

// ---- Garden ------------------------------------------------------------------------------------------------------

const LETTERS = "_abcdefghij";
const PLANTS = 10;
const HELD = [
    { key: 0, name: "Bits" },
    { key: 5, name: "DNA" },
];
const SPROUT_UPGRADES = [1, 2, 3];
// The game draws its plants and names none in the garden, but its achievements call them "Chemical-type", "Voraci-type"
// and "Bonsai-type" plants. These nine are the community wiki's names (idleon.wiki, Data:Gaming Notes, 2026-11-24), in
// the Log Book's order (the plant a sprout mutates into, Fungi first). The wiki names no tenth plant, so Plant 10 keeps
// its number. A named plant keeps its number under its name, so "Plant 3" still finds it.
const PLANT_NAMES = ["Fungi", "Bonsai", "Cactus", "Blossom", "Voraci", "Berri Bush", "Evergreen", "Chemical", "Royale"];
const plantNumber = (plant) => `Plant ${plant + 1}`;
const plantName = (plant) => PLANT_NAMES[plant] ?? plantNumber(plant);
const PlantTitle = (plant) =>
    div(
        { class: "account-row__name-group" },
        span({ class: "account-row__name" }, plantName(plant)),
        PLANT_NAMES[plant] ? span({ class: "account-row__sub-label" }, plantNumber(plant)) : null
    );

const GardenPart = () => {
    const getState = createIndexedStateGetter(0);
    const getFoundState = createIndexedStateGetter(0);
    const upgradeNames = SPROUT_UPGRADES.map((_, i) => van.state(`Sprout upgrade ${i + 1}`));
    const heldRows = HELD.map((held) =>
        SimpleNumberRow({
            entry: { name: held.name, path: `Gaming[${held.key}]`, float: true },
            valueState: getState(held.key),
        })
    );
    const upgradeRows = [
        ...SPROUT_UPGRADES.map((key, i) =>
            ClampedLevelRow({
                valueState: getState(key),
                writePath: `Gaming[${key}]`,
                integerMode: "trunc",
                name: () => upgradeNames[i].val,
            })
        ),
        ClampedLevelRow({
            valueState: getState(4),
            writePath: "Gaming[4]",
            max: 8,
            integerMode: "trunc",
            name: "Mutations unlocked",
        }),
        ClampedLevelRow({ valueState: getState(7), writePath: "Gaming[7]", integerMode: "trunc", name: "Evolve" }),
    ];
    // A plant's forms found: its letter in the Log Book, rewritten from what the game holds now, so a plant found in
    // the game since the page read it keeps its letter. Every plant lives in that one string, so saves take turns:
    // two plants saved together both land.
    const bookTurn = oneAtATime();
    const writeFound = (plant, found) =>
        bookTurn(async () => {
            const now = String((await gga("Gaming[11]")) ?? "")
                .padEnd(PLANTS, "_")
                .split("");
            now[plant] = LETTERS[found];
            await writeVerified("Gaming[11]", now.join("").replace(/_+$/, ""));
            return found;
        });
    const logBookRows = Array.from({ length: PLANTS }, (_, plant) =>
        ClampedLevelRow({
            valueState: getFoundState(plant),
            write: (found) => writeFound(plant, found),
            max: LETTERS.length - 1,
            integerMode: "trunc",
            renderInfo: () => PlantTitle(plant),
        })
    );

    return {
        content: div(
            { class: "field-columns" },
            AccountSection({ title: "Garden", body: heldRows }),
            AccountSection({ title: "Upgrades", body: upgradeRows }),
            AccountSection({ title: "Log Book", body: logBookRows })
        ),
        load: async () => {
            const [rawGaming, rawUpgrades] = await Promise.all([gga("Gaming"), readCList("GamingUpgrades")]);
            const gaming = toIndexedArray(rawGaming ?? []);
            const upgrades = toIndexedArray(rawUpgrades ?? []);
            SPROUT_UPGRADES.forEach((key, i) => {
                upgradeNames[i].val = cleanName(toIndexedArray(upgrades[i] ?? [])[0], `Sprout upgrade ${i + 1}`);
                getState(key).val = toInt(gaming[key], { min: 0 });
            });
            HELD.forEach((held) => (getState(held.key).val = toNum(gaming[held.key], 0)));
            [4, 7].forEach((key) => (getState(key).val = toInt(gaming[key], { min: 0 })));
            const book = String(gaming[11] ?? "");
            for (let plant = 0; plant < PLANTS; plant++)
                getFoundState(plant).val = Math.max(0, LETTERS.indexOf(book[plant] ?? "_"));
        },
    };
};

// ---- Imports -----------------------------------------------------------------------------------------------------

const IMPORT_START = 25;
// The game's filler names past its last import.
const FILLER = new Set(["idk", ""]);
const FINDS = [
    {
        section: "Dirty Shovel",
        values: [
            { key: "nugget", name: "Highest gold nugget", path: "Gaming[8]", index: 8 },
            { key: "dug", name: "Gold nuggets dug", path: "OptionsListAccount[192]", option: "192" },
        ],
    },
    { section: "Autumn Squirrel", values: [{ key: "acorns", name: "Acorns", path: "Gaming[9]", index: 9 }] },
    { section: "Immortal Snail", values: [{ key: "mail", name: "Snail Mail", path: "Gaming[13]", index: 13 }] },
];

const ImportsPart = () => {
    const getLevelState = createIndexedStateGetter(0);
    const findStates = new Map(FINDS.flatMap((find) => find.values.map((value) => [value.key, van.state(0)])));
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const findSections = FINDS.map((find) =>
        AccountSection({
            title: find.section,
            body: find.values.map((value) =>
                SimpleNumberRow({
                    entry: { name: value.name, path: value.path, float: true },
                    valueState: findStates.get(value.key),
                })
            ),
        })
    );
    return {
        content: div({ class: "field-columns" }, AccountSection({ title: "Imports", body: listNode }), ...findSections),
        load: async () => {
            const [rawSprouts, rawNames, rawGaming, options] = await Promise.all([
                gga("GamingSprout"),
                readCList("RandoListo2[1]"),
                gga("Gaming"),
                readGgaEntries("OptionsListAccount", ["192"]),
            ]);
            const sprouts = toIndexedArray(rawSprouts ?? []);
            const gaming = toIndexedArray(rawGaming ?? []);
            const imports = toIndexedArray(rawNames ?? [])
                .map((raw, index) => ({ index, name: cleanName(raw) }))
                .filter((item) => !FILLER.has(item.name));
            reconcileRows(imports.map((item) => item.name).join("|"), () =>
                imports.map((item) =>
                    ClampedLevelRow({
                        valueState: getLevelState(item.index),
                        writePath: `GamingSprout[${IMPORT_START + item.index}][0]`,
                        integerMode: "trunc",
                        name: item.name,
                    })
                )
            );
            imports.forEach(
                (item) =>
                    (getLevelState(item.index).val = toInt(
                        toIndexedArray(sprouts[IMPORT_START + item.index] ?? [])[0],
                        {
                            min: 0,
                        }
                    ))
            );
            for (const find of FINDS)
                for (const value of find.values)
                    findStates.get(value.key).val = toNum(
                        value.option ? options[value.option] : gaming[value.index],
                        0
                    );
        },
    };
};

// ---- Rat King ----------------------------------------------------------------------------------------------------

const CROWNS_PATH = "Research[11]";
const FORMS = "_abcdefghi".split("");
const ALL_CROWNS = Array.from({ length: PLANTS }, (_, plant) => FORMS.map((form) => `${plant}${form}`)).flat();
const KING_UPGRADES = [
    { index: 1, name: "King Tokens per hour" },
    { index: 2, name: "Palette Luck" },
    { index: 3, name: "Crown Chance" },
];
const formName = (form) => (form === "_" ? "Base form" : `Mutation ${FORMS.indexOf(form)}`);

const RatKingPart = ({ pending, reload }) => {
    const bulk = useWriteStatus();
    const tokensState = van.state(0);
    const upgradeStates = KING_UPGRADES.map(() => van.state(0));
    const crowns = van.state(new Set());
    const openPlant = van.state(-1);
    const inTurn = oneAtATime();

    const readCrowns = async () =>
        new Set(toIndexedArray((await gga(CROWNS_PATH)) ?? []).filter((id) => ALL_CROWNS.includes(id)));
    // Changes the crowns the game holds now, and saves them in the game's order.
    const change = (edit) =>
        inTurn(async () => {
            const next = await readCrowns();
            edit(next);
            const sorted = ALL_CROWNS.filter((id) => next.has(id));
            await writeVerified(CROWNS_PATH, sorted);
            crowns.val = new Set(sorted);
        });
    const plantCrowns = (plant) => FORMS.map((form) => `${plant}${form}`);
    const countOf = (plant) => plantCrowns(plant).filter((id) => crowns.val.has(id)).length;
    const rowOfPlant = [];
    // The page search decides which plants the all-buttons act on; with no search that is every plant.
    const shownCrowns = () =>
        Array.from({ length: PLANTS }, (_, plant) => plant)
            .filter((plant) => shownBySearch(rowOfPlant[plant]))
            .flatMap(plantCrowns);

    const PlantRow = (plant) => {
        const name = plantName(plant);
        const isOpen = () => openPlant.val === plant;
        const crownRows = FORMS.map((form) => {
            const id = `${plant}${form}`;
            return AccountToggleRow({
                info: span({ class: "account-row__name" }, formName(form)),
                words: ["Reclaimed", ""],
                name: `${name} ${formName(form)} crown`,
                checked: () => crowns.val.has(id),
                write: (on) => change((next) => (on ? next.add(id) : next.delete(id))),
            });
        });
        const row = AccountRow({
            info: button(
                {
                    type: "button",
                    class: "row-opener",
                    "aria-expanded": () => String(isOpen()),
                    onclick: () => (openPlant.val = isOpen() ? -1 : plant),
                },
                PlantTitle(plant)
            ),
            controls: [
                span({ class: "rat-king-count" }, () => `${countOf(plant)} / ${FORMS.length}`),
                // The quick path: on reclaims all ten crowns, off clears them.
                StateSwitch({
                    checked: () => countOf(plant) === FORMS.length,
                    words: ["All", ""],
                    name: `${name} all crowns`,
                    disabled: pending,
                    ownStatus: true,
                    onFlip: async (on) => {
                        await change((next) =>
                            plantCrowns(plant).forEach((id) => (on ? next.add(id) : next.delete(id)))
                        );
                        return { ok: true };
                    },
                }),
            ],
        });
        row.append(div({ class: "row-detail", hidden: () => !isOpen() }, ...crownRows));
        rowOfPlant[plant] = row;
        return row;
    };

    // Reclaims or clears exactly these crowns; any other crown the game holds stays as it is.
    const setAll = async (ids, claim) => {
        const result = await bulk.run(() =>
            change((next) => ids.forEach((id) => (claim ? next.add(id) : next.delete(id))))
        );
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: div(
            { class: "field-columns" },
            AccountSection({
                title: "King Rat",
                body: [
                    SimpleNumberRow({
                        entry: { name: "King Tokens", path: "Gaming[14]", float: true },
                        valueState: tokensState,
                    }),
                    ...KING_UPGRADES.map((upgrade, i) =>
                        ClampedLevelRow({
                            valueState: upgradeStates[i],
                            writePath: `GamingSprout[33][${upgrade.index}]`,
                            integerMode: "trunc",
                            name: upgrade.name,
                        })
                    ),
                ],
            }),
            AccountSection({ title: "Crowns", body: Array.from({ length: PLANTS }, (_, plant) => PlantRow(plant)) })
        ),
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [gaming, sprout, held] = await Promise.all([
                gga("Gaming[14]"),
                gga("GamingSprout[33]"),
                readCrowns(),
            ]);
            tokensState.val = toNum(gaming, 0);
            const levels = toIndexedArray(sprout ?? []);
            KING_UPGRADES.forEach((upgrade, i) => (upgradeStates[i].val = toInt(levels[upgrade.index], { min: 0 })));
            crowns.val = held;
        },
        toolsLabel: () => {
            const ids = shownCrowns();
            return `${ids.filter((id) => crowns.val.has(id)).length} of ${ids.length} crowns reclaimed`;
        },
        tools: (ask) => {
            const clearAll = ActionButton({
                label: "Clear all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shownCrowns().some((id) => crowns.val.has(id)),
                onClick: (e) => {
                    e.preventDefault();
                    // The crowns the question counts are the ones cleared, even if more get reclaimed while it is open.
                    const ids = shownCrowns().filter((id) => crowns.val.has(id));
                    const n = ids.length;
                    ask({
                        question: `Clear ${n} reclaimed ${plural(n, "crown")}?`,
                        confirmLabel: n === 1 ? "Clear it" : "Clear them",
                        from: clearAll,
                        onConfirm: () => setAll(ids, false),
                    });
                },
            });
            return div(
                { class: "tabbed-list__tool-group" },
                ActionButton({
                    label: "Reclaim all",
                    status: bulk.status,
                    disabled: () => pending() || shownCrowns().every((id) => crowns.val.has(id)),
                    onClick: (e) => {
                        e.preventDefault();
                        return setAll(shownCrowns(), true);
                    },
                }),
                clearAll
            );
        },
    };
};

// ---- Superbits ---------------------------------------------------------------------------------------------------

const SUPERBITS_PATH = "Gaming[12]";
// The game's three boards, as groups in the one list (no tabs in a tab).
const BOARDS = [
    { label: "Superbits", start: 0, end: 24 },
    { label: "Duperbits", start: 24, end: 48 },
    { label: "Zuperbits", start: 48, end: Infinity },
];
// The game's own wording keeps its bits symbol and total line out: only the sentence with the bonus shows.
const superbitBonus = (raw) =>
    bonusText(String(raw ?? "").replace(/₣/g, " bits"))
        .replace(/\s*\(\s*\)/g, "")
        .replace(/^X(?=\d)/, "x");

const SuperbitsPart = ({ pending, reload }) => {
    const bulk = useWriteStatus();
    const held = van.state("");
    const superbits = van.state([]);
    const rowOf = new Map();
    const nodes = BOARDS.map(() => div());
    const reconcilers = nodes.map((node) => createStaticRowReconciler(node));
    const inTurn = oneAtATime();

    // Puts the letters in or takes them out of the string the game holds now.
    const change = (letters, unlock) =>
        inTurn(async () => {
            let next = String((await gga(SUPERBITS_PATH)) ?? "");
            for (const letter of letters) {
                next = next.split(letter).join("");
                if (unlock) next += letter;
            }
            await writeVerified(SUPERBITS_PATH, next);
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

    const shown = () => superbits.val.filter((bit) => shownBySearch(rowOf.get(bit.index)));
    const isUnlocked = (bit) => held.val.includes(bit.letter);
    const setAll = async (bits, unlock) => {
        const result = await bulk.run(() =>
            change(
                bits.map((bit) => bit.letter),
                unlock
            )
        );
        if (!result.ok && !result.cancelled) await reload();
    };

    return {
        content: div(...BOARDS.map((board, b) => AccountSection({ title: board.label, body: nodes[b] }))),
        busy: () => bulk.status.val === "loading",
        load: async () => {
            const [encoded, rawLetters, rawDefs] = await Promise.all([
                gga(SUPERBITS_PATH),
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
        },
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${plural(n, "superbit")}` : `All ${n} ${plural(n, "superbit")}`;
        },
        tools: (ask) => {
            const lockAll = ActionButton({
                label: "Lock all",
                status: bulk.status,
                variant: "danger",
                disabled: () => pending() || !shown().some(isUnlocked),
                onClick: (e) => {
                    e.preventDefault();
                    const bits = shown().filter(isUnlocked);
                    const n = bits.length;
                    ask({
                        question: `Lock ${n} ${plural(n, "superbit")}?`,
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
                    disabled: () => pending() || !shown().length,
                    onClick: (e) => {
                        e.preventDefault();
                        return setAll(shown(), true);
                    },
                }),
                lockAll
            );
        },
    };
};

// ---- Palette -----------------------------------------------------------------------------------------------------

const LEVELS_PATH = "Spelunk[9]";
const STARS_PATH = "Spelunk[49]";
const STARS = [
    { value: 0, label: "None" },
    { value: 1, label: "★" },
    { value: 2, label: "★★" },
];

// A colour per line, like a table: its level, then its Black Stars, each in its own column under a head that names it.
const PALETTE_FIELDS = [
    { key: "level", label: "Level", path: LEVELS_PATH },
    { key: "stars", label: "Black Stars", path: STARS_PATH, steps: STARS },
];

const PalettePart = ({ pending }) => {
    const states = new Map();
    const stateOf = (index) => {
        if (!states.has(index))
            states.set(index, Object.fromEntries(PALETTE_FIELDS.map((field) => [field.key, van.state(0)])));
        return states.get(index);
    };
    const listNode = div();
    const reconcileRows = createStaticRowReconciler(listNode);
    const bulk = useWriteStatus();
    // The colours, with their rows, as the last read found them: All to acts on the ones the top bar's search shows.
    const colours = van.state([]);
    const rowOf = new Map();
    const shown = () => colours.val.filter((colour) => shownBySearch(rowOf.get(colour.index)));
    // The game keeps the palette's bonuses until it rebuilds them: a star saved here clears them. A clean-up that
    // failed leaves All to pressable, to clear them again (#250).
    const cleanUpFailed = van.state(false);
    const cleanUp = async () => {
        try {
            await deleteGga("DNSM.h.PaletteBonz");
            cleanUpFailed.val = false;
        } catch (error) {
            cleanUpFailed.val = true;
            throw error;
        }
    };

    const ColourRow = (colour) => {
        const at = (field) => `${field.path}[${colour.index}]`;
        const row = ValueTableRow({
            name: colour.name,
            info: RowTitles({ bonus: colour.bonus, name: colour.name }),
            fields: PALETTE_FIELDS.map((field) => ({
                ...field,
                valueState: stateOf(colour.index)[field.key],
                paths: [at(field)],
            })),
            read: async () => {
                const [level, stars] = await Promise.all(PALETTE_FIELDS.map((field) => gga(at(field))));
                return { level: toInt(level, { min: 0 }), stars: Math.min(2, toInt(stars, { min: 0 })) };
            },
            afterWrite: (changed) => (changed.includes("stars") ? cleanUp() : null),
            // Set all sets each colour's level; its Black Stars have All to.
            setAll: "level",
        });
        rowOf.set(colour.index, row);
        return row;
    };

    return {
        content: div(
            { class: "gaming-palette" },
            ValueTableHead({ name: "Colour", columns: PALETTE_FIELDS }),
            listNode
        ),
        load: async () => {
            const [rawLevels, rawStars, rawDefs] = await Promise.all([
                gga(LEVELS_PATH),
                gga(STARS_PATH),
                readCList("GamingPalette"),
            ]);
            const levels = toIndexedArray(rawLevels ?? []);
            const stars = toIndexedArray(rawStars ?? []);
            const read = toIndexedArray(rawDefs ?? []).map((raw, index) => {
                const def = toIndexedArray(raw ?? []);
                // "#" marks the bonus's number too ("+#%_Gold_Ball_gain").
                const bonus = bonusText(String(def[10] ?? "").replace(/#/g, "{"));
                return { index, name: cleanName(def[3], `Colour ${index + 1}`), bonus };
            });
            reconcileRows(read.map((colour) => colour.name).join("|"), () => read.map(ColourRow));
            read.forEach((colour) => {
                stateOf(colour.index).level.val = toInt(levels[colour.index], { min: 0 });
                stateOf(colour.index).stars.val = Math.min(2, toInt(stars[colour.index], { min: 0 }));
            });
            colours.val = read;
        },
        busy: () => bulk.status.val === "loading",
        toolsLabel: () => {
            const n = shown().length;
            return isSearching() ? `${n} matching ${plural(n, "colour")}` : `All ${n} ${plural(n, "colour")}`;
        },
        // All to None | ★ | ★★: fewer stars asks first. Like a row's save, it clears the game's palette bonuses; after
        // a clean-up failed, a step every colour has only clears them.
        tools: (ask) =>
            AllToTool({
                ask,
                bulk,
                steps: STARS,
                ordered: true,
                lines: shown,
                pickedOf: (colour) => stateOf(colour.index).stars.val,
                word: (n) => plural(n, "colour"),
                disabled: pending,
                behind: () => cleanUpFailed.val,
                write: async (lines, value) => {
                    try {
                        await runBulkSet({
                            entries: lines,
                            getTargetValue: () => value,
                            getValueState: (colour) => stateOf(colour.index).stars,
                            getPath: (colour) => `${STARS_PATH}[${colour.index}]`,
                        });
                    } finally {
                        // A clean-up that fails is said like a failed write: the game may keep the old bonuses.
                        await cleanUp();
                    }
                },
            }),
    };
};

// ---- The page ----------------------------------------------------------------------------------------------------

const TABS = [
    {
        id: "garden",
        label: "Garden",
        part: GardenPart,
        keywords: ["General", "Bits", "DNA", "Sprout", "Mutations", "Log Book", "Evolve"],
    },
    {
        id: "imports",
        label: "Imports",
        part: ImportsPart,
        keywords: ["Sprinkler", "Shovel", "Gold Nugget", "Squirrel", "Acorns", "Snail Mail", "Immortal Snail"],
    },
    {
        id: "ratking",
        label: "Rat King",
        part: RatKingPart,
        keywords: ["King Rat of Olde", "Crowns", "Reclaimed crowns", "King Tokens"],
    },
    { id: "superbits", label: "Superbits", part: SuperbitsPart, keywords: ["Duperbits", "Zuperbits"] },
    {
        id: "palette",
        label: "Palette",
        part: PalettePart,
        keywords: ["Black Stars", "Colours", "Colors", "Palette Hex"],
    },
];

const GamingTab = () => {
    const parts = new Map();
    const busy = () => [...parts.values()].some((part) => part.busy?.());
    const { loading, error, run } = useAccountLoad({ label: "Gaming", busy });
    // After a read that failed, what the tabs show may be old: their tools wait for one that works.
    const pending = () => loading.val || Boolean(error.val);
    const load = () => run(() => loadParts(parts));
    for (const tab of TABS) parts.set(tab.id, tab.part({ pending, reload: load }));
    const partOf = (id) => parts.get(id);

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container gaming-tab",
        title: "Gaming",
        automation: { page: "automation.gaming" },
        description: "The garden, imports, the Rat King, superbits and the palette.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val || busy() }),
        state: { loading, error },
        loadingText: "Reading gaming",
        errorTitle: "Couldn't read gaming",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Gaming",
                page: "w5.gaming",
                // Five tabs: on a phone they take two rows instead of running off the side.
                wrap: true,
                busy,
                tabs: TABS.map((tab) => ({ id: tab.id, label: tab.label, content: partOf(tab.id).content })),
                // Each tab's own tools; the tray shows the open tab's.
                tools: toolsPerTab(
                    Object.fromEntries(
                        TABS.filter((tab) => partOf(tab.id).tools).map((tab) => [tab.id, partOf(tab.id).tools])
                    )
                ),
                toolsOn: (id) => Boolean(partOf(id).tools),
                toolsLabel: (activeId) => partOf(activeId.val).toolsLabel?.() ?? "",
                // A tab whose numbers include one without a max has Set all.
                setAll: {
                    word: (n, tab) => (tab === "palette" ? plural(n, "colour") : n === 1 ? "line" : "lines"),
                    placeholder: (tab) => (tab === "palette" ? "Level" : "Value"),
                },
            })
        ),
    });
};

export default definePage({
    id: "w5.gaming",
    world: 5,
    system: "Gaming",
    description: "The garden, imports, the Rat King, superbits and the palette.",
    // Each tab is found by its own name and words (tabs), and opens there.
    tabs: TABS.map(({ id, label, keywords }) => ({ id, label, keywords })),
    component: GamingTab,
});
