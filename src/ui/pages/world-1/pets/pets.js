/**
 * W1 - Pets Tab
 *
 * Companion definitions come from live game data:
 *   cList.CompanionDB
 *   cList.CompanionSetsInfo
 *   MonsterDefinitionsGET.h[monsterKey].Name
 *
 * Tier selections use the W1 Companion cheat and only apply while it is running.
 * Pet tokens are the game's own list in OptionsListAccount[606]: saved, Normal tier only,
 * and capped by the token sources the account owns (the game wipes the list past that).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { isSearching, shownBySearch } from "../../../menu/pageSearch.js";
import {
    executeCheatAction,
    fetchCheatStates,
    fetchConfig,
    gga,
    readCList,
    readComputed,
    readGgaEntries,
    saveConfigPart,
    startupWith,
} from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { AccountRow, RowTitles } from "../../../components/views/account/components/AccountRow.js";
import { ActionButton } from "../../../components/views/account/components/ActionButton.js";
import { StepPicker } from "../../../components/views/account/components/StepPicker.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    cleanNameEffect,
    joinClasses,
    useWriteStatus,
    writeManyVerified,
} from "../../../components/views/account/accountShared.js";

const { div, span, label, input } = van.tags;

const COMPANION_CHEAT = "w1 companion";
const TOKEN_PATH = "OptionsListAccount[606]";

// Pets whose Pets+ the game breaks. Checked in the game's code 2026-11-21: Spirit Reindeer's bonus only counts at
// exactly its Normal value, so Pets+ leaves the Gold Ball Shop at 1x. Mr Pig and Rift Hivemind work well enough now.
const PLUS_WARNINGS = {
    27: "Pets+ turns this bonus off. Keep it Normal.",
};

// Empty config means all Pets+. Bare IDs and legacy arrays keep their existing tiers.
const parsePlusIds = (value) => {
    if (!Array.isArray(value)) {
        return String(value ?? "")
            .split(",")
            .filter((entry) => entry.trim().split(":")[1] !== "0")
            .map((entry) => Number.parseInt(entry, 10))
            .filter((id) => Number.isFinite(id));
    }
    // Hand-written array form: "<id>,a,b,c,<tier>" - only tier 1 counts as Pets+.
    return value
        .map((entry) => {
            const parts = String(entry).split(",");
            if (parts.length > 4 && parts[4].trim() !== "1") return Number.NaN;
            return Number.parseInt(parts[0], 10);
        })
        .filter((id) => Number.isFinite(id));
};

const normalizeSearchText = (value) =>
    String(value ?? "")
        .trim()
        .toLowerCase();

const isUnusedPetText = (value) => {
    const text = normalizeSearchText(value);
    return text.includes("not officially in the game") && text.includes("may never be");
};

const parseIdList = (value) =>
    String(value ?? "")
        .split(",")
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((id) => Number.isFinite(id));

const expandRange = (start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const unwrapSingleEntry = (value) => {
    let current = value;
    while (true) {
        const list = toIndexedArray(current);
        if (list.length !== 1) return current;
        current = list[0];
    }
};

const buildCompanionRows = (rawCompanionDb, rawMonsterDefs) =>
    toIndexedArray(rawCompanionDb)
        .map((entry, id) => {
            const row = toIndexedArray(entry);
            const monsterKey = row[0];
            const name = cleanName(rawMonsterDefs?.[monsterKey]?.Name, "");
            if (!name) return null;

            const effect = cleanNameEffect(row[1], "No buff text");
            // Column 10 is the upgraded-tier buff text the game shows for a Pets+ pet.
            const plusEffect = cleanNameEffect(row[10], effect);

            return { id, monsterKey, name, effect, plusEffect, isUnused: isUnusedPetText(effect) };
        })
        .filter(Boolean);

const buildSections = (pets, rawSetsInfo) => {
    const fallbackIds = pets.map((pet) => pet.id);
    const validIds = new Set(fallbackIds);
    const seenIds = new Set();
    const sections = [];
    const setsInfo = toIndexedArray(rawSetsInfo);

    const pushSection = (sectionLabel, ids) => {
        const nextIds = [...new Set(ids)].filter((id) => validIds.has(id) && !seenIds.has(id));
        if (!nextIds.length) return;
        nextIds.forEach((id) => seenIds.add(id));
        sections.push({ label: sectionLabel, ids: nextIds });
    };

    const primaryGroups = String(unwrapSingleEntry(setsInfo[0]) ?? "")
        .split("|")
        .map((group) => parseIdList(group))
        .filter((group) => group.length > 0);

    primaryGroups.forEach((group, index) => {
        const ids = group.length >= 2 ? expandRange(group[0], group[1]) : group;
        pushSection(`Set ${index + 1}`, ids);
    });

    toIndexedArray(setsInfo[1]).forEach((group, index) => {
        pushSection(index ? `Special ${index + 1}` : "Special", parseIdList(unwrapSingleEntry(group)));
    });

    toIndexedArray(setsInfo[2]).forEach((group, index) => {
        pushSection(index ? `Extra ${index + 1}` : "Extra", parseIdList(unwrapSingleEntry(group)));
    });

    const leftoverIds = fallbackIds.filter((id) => !seenIds.has(id));
    if (leftoverIds.length) pushSection(sections.length ? "Other" : "All pets", leftoverIds);

    return sections;
};

// A pet's tier while the injector runs. Token pets show as Normal: a token is the game's own Normal pick.
const TIERS = [
    { value: "off", label: "Off", tone: "off" },
    { value: "normal", label: "Normal" },
    { value: "plus", label: "Pets+", tone: "accent" },
];
const TIER_RANK = { off: 0, normal: 1, plus: 2 };

/**
 * One pet: its bonus first (the Pets+ one when that tier applies), its name under it; then whether the game already
 * owns it, its tier, and its token. The row is the pet's only control, so the same row works for clicks and keys.
 */
const PetRow = ({ companion, tierOf, onTier, isToken, tokenBlock, ownedPet, isBusy, onToken, isShown }) => {
    const { id } = companion;
    // Pets+ in the game: picked here, or the game's own Pets+ pet left Off here.
    const isPlusInGame = () => tierOf(id) === "plus" || (ownedPet(id)?.plus && tierOf(id) === "off");
    const bonus = () => (isPlusInGame() ? companion.plusEffect : companion.effect);
    const ownedWord = () => {
        const owned = ownedPet(id);
        return owned ? (owned.plus ? "Owned · Pets+" : "Owned") : "";
    };
    return AccountRow({
        rowClass: () => joinClasses("pet-row", !isShown(companion) && "is-filtered-out"),
        rowProps: { "data-pet-id": String(id) },
        info: [
            RowTitles({
                bonus,
                name: companion.name,
                warning: PLUS_WARNINGS[id] ? () => (isPlusInGame() ? PLUS_WARNINGS[id] : null) : null,
            }),
        ],
        controls: [
            div(
                { class: "pet-cells" },
                span({ class: "pet-row__state" }, ownedWord),
                StepPicker({
                    name: `${companion.name} tier`,
                    steps: TIERS,
                    picked: () => tierOf(id),
                    onPick: (tier) => void onTier(id, tier),
                }),
                label(
                    { class: () => joinClasses("toggle-switch pet-token", isToken(id) && "is-on") },
                    input({
                        type: "checkbox",
                        role: "switch",
                        "aria-label": `Pet token for ${companion.name}`,
                        checked: () => isToken(id),
                        // A token the game would refund or wipe can't be picked: an owned pet, a pet the game doesn't
                        // allow, or no free token (the Token head says how many are in use).
                        disabled: () => isBusy() || (!isToken(id) && Boolean(tokenBlock(id))),
                        onchange: async (e) => {
                            e.target.checked = isToken(id);
                            await onToken(id);
                            e.target.checked = isToken(id);
                        },
                    }),
                    span({ class: "slider" })
                )
            ),
        ],
    });
};

const CompanionsTab = () => {
    const { loading, error, run: runLoad } = useAccountLoad({ label: "Pets" });
    const { status: writeStatus, run: runWrite } = useWriteStatus();

    const companions = van.state([]);
    const sections = van.state([]);
    const normalIds = van.state(new Set());
    const plusIds = van.state(new Set());
    const cheatEnabled = van.state(false);
    const writeError = van.state("");
    // Pets the game doesn't really have yet stay out of the way until asked for.
    const showUnavailable = van.state(false);
    const tokens = van.state({ owned: 0, missing: [], picks: [], blacklist: [], ownedPets: [] });

    const isPlus = (id) => plusIds.val.has(id);
    const isToken = (id) => tokens.val.picks.includes(id);
    const isNormal = (id) => normalIds.val.has(id) && !isToken(id);
    const ownedPet = (id) => tokens.val.ownedPets.find((pet) => pet.id === id);
    const tierOf = (id) => (isPlus(id) ? "plus" : isNormal(id) || isToken(id) ? "normal" : "off");

    // The game refunds tokens on owned or blacklisted pets, and wipes every pick once
    // the list outgrows the owned token sources.
    const tokenBlock = (id) => {
        if (isToken(id)) return null;
        if (ownedPet(id)) return "You own this pet, so the game would refund the token.";
        if (tokens.val.blacklist.includes(id)) return "The game doesn't allow a token on this pet.";
        if (tokens.val.picks.length >= tokens.val.owned) {
            return tokens.val.missing.length
                ? "No free token. Use Grant missing token first."
                : "All tokens are in use. Remove one first.";
        }
        return null;
    };

    // What the list shows: available pets, or all of them with Show unavailable. The top bar's search does the rest.
    const isShown = (companion) => showUnavailable.val || !companion.isUnused;

    // A write started since this read began is newer than what it read: the read drops its answer.
    let selectionWrites = 0;
    const readSelection = async (read = fetchConfig()) => {
        const writes = selectionWrites;
        const [config, cheatStates] = await Promise.all([read, fetchCheatStates()]);
        if (writes !== selectionWrites) return;
        cheatEnabled.val = !!cheatStates?.data?.w1?.companion;
        showSelection(config);
    };
    // The tiers a config gives, against the cheat state and tokens read last.
    const showSelection = (config) => {
        const validIdSet = new Set(companions.val.map((companion) => companion.id));
        const configured = config?.cheatConfig?.w1?.companion?.companions ?? "";
        // A saved list stays selected while the cheat is off, so the next click can't replace it.
        const allPlus = cheatEnabled.val ? [...validIdSet] : [];
        plusIds.val = new Set(
            (configured ? parsePlusIds(configured) : allPlus).filter((id) => validIdSet.has(id) && !isToken(id))
        );
        const selectedIds = Array.isArray(configured)
            ? configured.map((entry) => Number.parseInt(String(entry), 10))
            : parseIdList(configured);
        normalIds.val = new Set(selectedIds.filter((id) => validIdSet.has(id) && !plusIds.val.has(id) && !isToken(id)));
    };

    const panelHost = div({
        class: "account-list account-list--tabbed pets-list",
        "aria-busy": () => writeStatus.val === "loading",
    });
    let panelKey = "";

    const load = () =>
        runLoad(async () => {
            const [rawCompanionDb, rawSetsInfo] = await Promise.all([
                readCList("CompanionDB"),
                readCList("CompanionSetsInfo"),
            ]);
            const monsterKeys = [
                ...new Set(
                    toIndexedArray(rawCompanionDb)
                        .map((entry) => toIndexedArray(entry)[0])
                        .filter(Boolean)
                ),
            ];
            const monsterDefs = monsterKeys.length
                ? await readGgaEntries("MonsterDefinitionsGET.h", monsterKeys, ["Name"])
                : {};

            const nextCompanions = buildCompanionRows(rawCompanionDb, monsterDefs);

            companions.val = nextCompanions;
            sections.val = buildSections(nextCompanions, rawSetsInfo);

            tokens.val = await readComputed("companions", "petTokens");
            await readSelection();
            renderPanel();
        });

    const setCompanionCheat = (wanted) => executeCheatAction(COMPANION_CHEAT, wanted);

    // The change is built after the re-read so a list saved from the Config tab, or a token picked in the game,
    // isn't overwritten. `recheck`, when given, is asked again on the tokens read after the save: a token the game
    // gave after the save's own read refuses the change then, and the tiers are saved again without it.
    const writeSelection = (getChange, recheck = null) => {
        // This save's number, taken as it starts: a newer save keeps its own message and tokens if this one fails.
        let started;
        return runWrite(
            async () => {
                started = ++selectionWrites;
                writeError.val = "";
                if (error.val || !companions.val.length) throw new Error("Refresh pet data before changing tiers");
                // The tokens first: the saved tiers are read against them (a pet with a token has no tier). The picks
                // come from the list itself, which the token write expects to find, so a token the game adds while
                // this reads the config refuses the write instead of being written over.
                const [read, tokenList] = await Promise.all([readComputed("companions", "petTokens"), gga(TOKEN_PATH)]);
                tokens.val = { ...read, picks: tokenList ? String(tokenList).split(",").map(Number) : [] };
                await readSelection();
                const { picks = tokens.val.picks } = getChange();
                if (picks !== tokens.val.picks) {
                    await writeManyVerified([{ path: TOKEN_PATH, value: picks.join(","), expect: tokenList }]).catch(
                        (error) => {
                            throw new Error(
                                error.message === "changed since"
                                    ? "Tokens changed in the game. Try again."
                                    : "Could not save pet token picks"
                            );
                        }
                    );
                    tokens.val = { ...tokens.val, picks };
                }
                let entries;
                // Chosen pets also turn the cheat on at every start; none takes it off that list.
                const saveTiers = (change) =>
                    saveConfigPart(async (now) => {
                        // The tokens and the tiers from the config as they are in the save's turn, so a token the game
                        // gave meanwhile is refused and a list saved meanwhile (the Config tab) isn't overwritten; the
                        // change asked for again on them.
                        tokens.val = await readComputed("companions", "petTokens");
                        showSelection(now);
                        const { normal, plus } = change();
                        entries = companions.val
                            .filter(({ id }) => normal.has(id) || plus.has(id))
                            .map(({ id }) => `${id}:${plus.has(id) ? 1 : 0}`);
                        return {
                            // An empty list would mean every pet at Pets+ once the startup cheat runs again.
                            cheatConfig: { w1: { companion: { companions: entries.join(",") || "none" } } },
                            startupCheats: startupWith(now.startupCheats, COMPANION_CHEAT, entries.length > 0),
                        };
                    });
                let { result, config } = await saveTiers(getChange);
                if (result.message.includes("kept its old settings")) throw new Error(result.message);
                let late = null;
                if (recheck) {
                    tokens.val = await readComputed("companions", "petTokens");
                    try {
                        recheck();
                    } catch (refused) {
                        // The tiers as the config holds them, less the pets with a token (showSelection leaves them out).
                        late = refused;
                        ({ result, config } = await saveTiers(() => ({ normal: normalIds.val, plus: plusIds.val })));
                        if (result.message.includes("kept its old settings")) throw new Error(result.message);
                    }
                }
                await setCompanionCheat(entries.length > 0);
                await readSelection(config);
                if (late) throw late;
            },
            {
                // Part of it may have landed: the cards show what is saved now. A save started since is newer: it
                // keeps its own message and tokens, and reads its own tiers.
                onError: (error) => {
                    if (started !== selectionWrites) return;
                    writeError.val = error.message;
                    void readComputed("companions", "petTokens")
                        .then((read) => {
                            if (started !== selectionWrites) return;
                            tokens.val = read;
                            return readSelection();
                        })
                        .catch(() => {});
                },
            }
        );
    };

    const isBusy = () => loading.val || writeStatus.val === "loading";

    // Each handler decides from `shown`, the token the player saw when pressing; writeSelection reads the game's
    // tokens again, which only carry the change out, so a press never removes a token picked in the game since.
    const withoutToken = (companionId) =>
        isToken(companionId) ? tokens.val.picks.filter((id) => id !== companionId) : tokens.val.picks;

    // Off, Normal or Pets+ for one pet. A token pet is already Normal; picking Off or Pets+ takes its token back.
    const setTier = async (companionId, tier) => {
        if (isBusy()) return;
        const shown = isToken(companionId);
        if (shown && tier === "normal") return;
        // A token the game gave the pet since the press: Pets+ on top shows the wrong bonus, and Off can't take it. A
        // token shown at the press is the one the save takes back, so before the save only a new one is refused.
        const refused = () => new Error("This pet has a token now.");
        // After the save any token is one the game gave while it saved, the one it took back given again included.
        const refuseLateToken = () => {
            if (isToken(companionId) && tier !== "normal") throw refused();
        };
        await writeSelection(() => {
            if (!shown && isToken(companionId) && tier !== "normal") throw refused();
            const normal = new Set(normalIds.val);
            const plus = new Set(plusIds.val);
            normal.delete(companionId);
            plus.delete(companionId);
            if (tier === "normal") normal.add(companionId);
            if (tier === "plus") plus.add(companionId);
            return { normal, plus, picks: shown ? withoutToken(companionId) : tokens.val.picks };
        }, refuseLateToken);
    };

    const handleToken = async (companionId) => {
        if (isBusy() || tokenBlock(companionId)) return;
        const shown = isToken(companionId);
        await writeSelection(() => {
            const blocked = !shown && tokenBlock(companionId); // the game's tokens may have changed since the page read them
            if (blocked) throw new Error(blocked);
            const normal = new Set(normalIds.val);
            const plus = new Set(plusIds.val);
            normal.delete(companionId);
            plus.delete(companionId);
            const added = isToken(companionId) ? tokens.val.picks : [...tokens.val.picks, companionId];
            return { normal, plus, picks: shown ? withoutToken(companionId) : added };
        });
    };

    const grantTokens = () =>
        runWrite(
            async () => {
                writeError.val = "";
                await writeManyVerified(
                    tokens.val.missing.map((index) => ({ path: `OptionsListAccount[${index}]`, value: 1 }))
                ).catch(() => {
                    throw new Error("Could not grant the missing pet token");
                });
                tokens.val = await readComputed("companions", "petTokens");
            },
            {
                onError: (error) => {
                    writeError.val = error.message;
                },
            }
        );

    // The pets a tab's tools act on: the ones it shows (and the top bar's search leaves), without token pets (a token
    // is the game's, and bulk tiers never touch it).
    const sectionOf = (activeId) => sections.val.find((section) => section.label === activeId.val);
    const companionsIn = (section) =>
        (section?.ids ?? []).map((id) => companions.val.find((companion) => companion.id === id)).filter(Boolean);
    const rowOf = new Map();
    const inView = (pet) => isShown(pet) && shownBySearch(rowOf.get(pet.id));
    const petWord = (n) => `pet${n === 1 ? "" : "s"}`;

    const tools = (activeId, ask) => {
        const targets = () => companionsIn(sectionOf(activeId)).filter((pet) => inView(pet) && !isToken(pet.id));
        const allTo = (tier) => {
            const pets = targets();
            return writeSelection(() => {
                const normal = new Set(normalIds.val);
                const plus = new Set(plusIds.val);
                pets.filter((pet) => !isToken(pet.id)).forEach(({ id }) => {
                    normal.delete(id);
                    plus.delete(id);
                    if (tier === "normal") normal.add(id);
                    if (tier === "plus") plus.add(id);
                });
                return { normal, plus };
            });
        };
        const tierButtons = TIERS.map((tier) => {
            // A pet saved while it asks can change what gets lowered: then it asks again.
            const loweredOf = () =>
                targets()
                    .filter((pet) => TIER_RANK[tierOf(pet.id)] > TIER_RANK[tier.value])
                    .map((pet) => pet.id);
            const askOrWrite = () => {
                const lowered = loweredOf().length;
                if (!lowered) return void allTo(tier.value);
                const where = sectionOf(activeId)?.label ?? "this tab";
                ask({
                    question:
                        tier.value === "off"
                            ? `Turn off ${lowered} ${petWord(lowered)} in ${where}?`
                            : `Lower ${lowered} ${petWord(lowered)} in ${where} to ${tier.label}?`,
                    confirmLabel:
                        tier.value === "off"
                            ? `Turn ${lowered === 1 ? "it" : "them"} off`
                            : `Lower ${lowered === 1 ? "it" : "them"}`,
                    from: tierButton,
                    lowers: loweredOf,
                    again: askOrWrite,
                    onConfirm: () => allTo(tier.value),
                });
            };
            const tierButton = ActionButton({
                label: tier.label,
                status: writeStatus,
                disabled: () => isBusy() || targets().every((pet) => tierOf(pet.id) === tier.value),
                onClick: (e) => {
                    e.preventDefault();
                    return askOrWrite();
                },
            });
            return tierButton;
        });
        return [
            div(
                { class: "tabbed-list__tool-group" },
                span({ class: "tabbed-list__tool-label" }, "All to"),
                ...tierButtons
            ),
            div(
                { class: "tabbed-list__tool-group", hidden: () => !tokens.val.missing.length },
                ActionButton({
                    label: "Grant missing token",
                    status: writeStatus,
                    disabled: () => isBusy(),
                    buttonProps: { hidden: () => !tokens.val.missing.length },
                    onClick: (e) => {
                        e?.preventDefault();
                        return grantTokens();
                    },
                })
            ),
        ];
    };

    // Each tab's column head says once what its columns mean: a tier lasts while the injector runs, a token is saved.
    const columnHead = () =>
        div(
            { class: "account-row account-row--head pet-head" },
            div({ class: "account-row__info" }, span({ class: "pet-head__label" }, "Pet")),
            div(
                { class: "account-row__controls" },
                div(
                    { class: "pet-cells" },
                    span(),
                    span(
                        { class: "pet-head__label" },
                        "Tier",
                        span({ class: "pet-head__note" }, "while the injector runs")
                    ),
                    span(
                        { class: "pet-head__label" },
                        () => `Token ${tokens.val.picks.length}/${tokens.val.owned}`,
                        span({ class: "pet-head__note" }, "saved in your game")
                    )
                )
            )
        );

    // A tab whose pets are all filtered out says so where its rows would be.
    const emptyNote = (section) =>
        div(
            { class: "pet-empty", hidden: () => companionsIn(section).some(isShown) },
            "Every pet here is unavailable. Turn on Show unavailable to see them."
        );

    // The tabs come from the game's pet groups, so the panel is built once they're read, and again only when the
    // groups change (a refresh keeps the rows and the open tab).
    const renderPanel = () => {
        const key = sections.val.map((section) => `${section.label}:${section.ids.join(",")}`).join("|");
        if (key === panelKey) return;
        panelKey = key;
        panelHost.replaceChildren(
            TabbedList({
                name: "Pets",
                tabs: sections.val.map((section) => ({
                    id: section.label,
                    label: section.label,
                    content: [
                        columnHead(),
                        ...companionsIn(section).map((companion) => {
                            const row = PetRow({
                                companion,
                                tierOf,
                                onTier: setTier,
                                isToken,
                                tokenBlock,
                                ownedPet,
                                isBusy,
                                onToken: handleToken,
                                isShown,
                            });
                            rowOf.set(companion.id, row);
                            return row;
                        }),
                        emptyNote(section),
                    ],
                })),
                tools,
                busy: isBusy,
                toolsLabel: (activeId) => {
                    const section = sectionOf(activeId);
                    const shown = companionsIn(section).filter(inView).length;
                    const pets = `${petWord(shown)} in ${section?.label ?? ""}`;
                    return isSearching() ? `${shown} matching ${pets}` : `All ${shown} ${pets}`;
                },
            })
        );
    };

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container pets-tab",
        title: "Pets",
        description: "Normal and Pets+ last while the injector runs. A token stays in your game.",
        actions: RefreshButton({
            onRefresh: load,
            disabled: isBusy,
        }),
        // Always a node: a binding that returns nothing is dropped for good, and a later failure couldn't show.
        topNotices: () => div(writeError.val ? WarningBanner(span({ role: "alert" }, writeError.val)) : null),
        toolbar: [
            label(
                { class: "toggle-switch account-toggle pets-show-unavailable" },
                input({
                    type: "checkbox",
                    checked: () => showUnavailable.val,
                    onchange: (e) => (showUnavailable.val = e.target.checked),
                }),
                span({ class: "slider" }),
                span({ class: "label" }, "Show unavailable")
            ),
        ],
        state: { loading, error },
        loadingText: "Reading pets",
        errorTitle: "Pets read failed",
        initialWrapperClass: "account-list",
        body: panelHost,
    });
};

export default definePage({
    id: "w1.pets",
    world: 1,
    system: "Pets",
    description: "Owned pets, Pets+ and pet tokens.",
    keywords: ["Companions", "Pets+", "Pet tokens"],
    component: CompanionsTab,
});
