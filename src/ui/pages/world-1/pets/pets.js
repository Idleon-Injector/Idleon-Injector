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
import {
    executeCheatAction,
    fetchCheatStates,
    fetchConfig,
    readCList,
    readComputed,
    readGgaEntries,
    saveConfigFile,
    updateSessionConfig,
} from "../../../services/api.js";
import { EmptyState } from "../../../components/EmptyState.js";
import { SearchBar } from "../../../components/SearchBar.js";
import { withTooltip } from "../../../components/Tooltip.js";
import { toIndexedArray } from "../../../utils/index.js";
import { RefreshButton, WarningBanner } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { clickAgain } from "../../../components/inPlace.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import {
    cleanName,
    cleanNameEffect,
    useWriteStatus,
    writeManyVerified,
    writeVerified,
} from "../../../components/views/account/accountShared.js";

const { div, button, span, label, input } = van.tags;

const COMPANION_CHEAT = "w1 companion";
const TOKEN_PATH = "OptionsListAccount[606]";

const PLUS_WARNINGS = {
    27: "Pets+ breaks the Gold Ball Shop bonus: it drops to 1x instead of 2x. Keep this pet normal to retain the bonus.",
    30: "Pets+ breaks remote chest access and infinite teleports unless another pet, such as Ram, provides them. Keep this pet normal to retain these perks.",
    88: "Pets+ can prevent the Prisma multiplier and extra Prisma Bubble unlock from activating. Keep this pet normal until the game fixes its tier checks.",
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
        pushSection(`SET ${index + 1}`, ids);
    });

    toIndexedArray(setsInfo[1]).forEach((group, index) => {
        pushSection(`SPECIAL ${index + 1}`, parseIdList(unwrapSingleEntry(group)));
    });

    toIndexedArray(setsInfo[2]).forEach((group, index) => {
        pushSection(`EXTRA ${index + 1}`, parseIdList(unwrapSingleEntry(group)));
    });

    const leftoverIds = fallbackIds.filter((id) => !seenIds.has(id));
    if (leftoverIds.length) pushSection(sections.length ? "OTHER" : "ALL PETS", leftoverIds);

    return sections;
};

const tierLabel = ({ id, isNormal, isPlus, isToken, ownedPet }) => {
    if (isToken(id)) return span({ class: "companion-card__tier" }, "TOKEN · NORMAL");
    if (isPlus(id)) return span({ class: "companion-card__tier" }, "PETS+");
    if (isNormal(id)) return span({ class: "companion-card__tier" }, "NORMAL");
    const owned = ownedPet(id);
    if (owned) return span({ class: "companion-card__tier" }, owned.plus ? "OWNED · PETS+" : "OWNED");
    return span({ class: "companion-card__tier" }, "NOT SELECTED");
};

const CompanionCard = ({
    companion,
    normalIds,
    isPlus,
    isToken,
    ownedPet,
    tokenBlock,
    isBusy,
    onToggle,
    onTogglePlus,
    onToken,
}) => {
    const { id } = companion;
    const isNormal = (petId) => normalIds.val.has(petId) && !isToken(petId);
    const isUnselected = () => !isNormal(id) && !isPlus(id) && !isToken(id);

    return div(
        { class: "companion-card-wrap" },
        button(
            {
                type: "button",
                class: () =>
                    [
                        "companion-card",
                        isNormal(id) && "companion-card--enabled",
                        isPlus(id) && "companion-card--plus",
                        isToken(id) && "companion-card--token",
                        ownedPet(id) && isUnselected() && "companion-card--owned",
                    ]
                        .filter(Boolean)
                        .join(" "),
                "aria-pressed": () => isNormal(id) || isToken(id),
                disabled: () => isBusy(),
                onclick: () => onToggle(id),
                title: () =>
                    isToken(id)
                        ? "Token pets are always Normal. Click to remove the token."
                        : "Toggle this pet's normal bonus.",
            },
            div(
                { class: "companion-card__top" },
                div({ class: "companion-card__name" }, companion.name),
                span({ class: "companion-card__id" }, `ID ${id}`)
            ),
            () => tierLabel({ id, isNormal, isPlus, isToken, ownedPet }),
            div({ class: "companion-card__effect" }, () =>
                isPlus(id) || (ownedPet(id)?.plus && isUnselected()) ? companion.plusEffect : companion.effect
            ),
            PLUS_WARNINGS[id] ? div({ class: "companion-card__warning" }, PLUS_WARNINGS[id]) : null
        ),
        withTooltip(
            button(
                {
                    type: "button",
                    class: () =>
                        ["companion-plus", "companion-token", isToken(id) && "companion-plus--on"]
                            .filter(Boolean)
                            .join(" "),
                    "aria-pressed": () => isToken(id),
                    "aria-disabled": () => Boolean(tokenBlock(id)),
                    "aria-label": `Pet token for ${companion.name}`,
                    disabled: () => isBusy(),
                    onclick: () => onToken(id),
                },
                "T"
            ),
            () =>
                isToken(id)
                    ? "Remove this pet's token."
                    : tokenBlock(id) ||
                      "Spend a pet token on this pet. Token pets are saved in your game, stay without the injector, are always Normal and apply after your next map change."
        ),
        withTooltip(
            button(
                {
                    type: "button",
                    class: () => ["companion-plus", isPlus(id) && "companion-plus--on"].filter(Boolean).join(" "),
                    "aria-pressed": () => isPlus(id),
                    "aria-label": `Pets+ tier for ${companion.name}`,
                    disabled: () => isBusy(),
                    onclick: () => onTogglePlus(id),
                },
                "+"
            ),
            () => (isToken(id) ? "Move this pet from its token to Pets+." : "Toggle this pet's Pets+ bonus.")
        )
    );
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
    const hideUnused = van.state(false);
    const searchQuery = van.state("");
    const tokens = van.state({ owned: 0, missing: [], picks: [], blacklist: [], ownedPets: [] });

    const isPlus = (id) => plusIds.val.has(id);
    const isToken = (id) => tokens.val.picks.includes(id);
    const ownedPet = (id) => tokens.val.ownedPets.find((pet) => pet.id === id);

    // The game refunds tokens on owned or blacklisted pets, and wipes every pick once
    // the list outgrows the owned token sources.
    const tokenBlock = (id) => {
        if (isToken(id)) return null;
        if (ownedPet(id)) return "You own this pet, so the game would refund the token.";
        if (tokens.val.blacklist.includes(id)) return "The game doesn't allow a token on this pet.";
        if (tokens.val.picks.length >= tokens.val.owned) {
            return tokens.val.missing.length
                ? "No free token. Use GRANT MISSING TOKEN first."
                : "All tokens are in use. Remove one first.";
        }
        return null;
    };

    const readSelection = async () => {
        const [config, cheatStates] = await Promise.all([fetchConfig(), fetchCheatStates()]);
        const validIdSet = new Set(companions.val.map((companion) => companion.id));
        cheatEnabled.val = !!cheatStates?.data?.w1?.companion;
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
        });

    const setCompanionCheat = (wanted) => executeCheatAction(COMPANION_CHEAT, wanted);

    // /api/config/save rewrites config.custom.js from whatever it is handed, so it needs
    // the whole config - a partial would drop every other saved override. `onAtStart`: chosen pets also turn the
    // cheat on at every start (a startup cheat); none takes it off that list. Startup cheats toggle, so a list that
    // already has "w1" (every W1 cheat on) gets no "w1 companion", which would turn it back off.
    const persistConfig = async (onAtStart) => {
        const config = await fetchConfig();
        if (!config?.cheatConfig) throw new Error("Could not read the config back to save it");
        const startup = config.startupCheats ?? [];
        const listed = startup.includes(COMPANION_CHEAT) || startup.includes("w1");
        await saveConfigFile({
            startupCheats: onAtStart
                ? listed
                    ? startup
                    : [...startup, COMPANION_CHEAT]
                : startup.filter((command) => command !== COMPANION_CHEAT),
            cheatConfig: config.cheatConfig,
            injectorConfig: config.injectorConfig,
        });
    };

    // The change is built after the re-read so a list saved from the Config tab, or a token picked in the game,
    // isn't overwritten.
    const writeSelection = (getChange) =>
        runWrite(
            async () => {
                writeError.val = "";
                if (error.val || !companions.val.length) throw new Error("Refresh pet data before changing tiers");
                // The tokens first: the saved tiers are read against them (a pet with a token has no tier).
                tokens.val = await readComputed("companions", "petTokens");
                await readSelection();
                const { normal, plus, picks = tokens.val.picks } = getChange();
                if (picks !== tokens.val.picks) {
                    await writeVerified(TOKEN_PATH, picks.join(",")).catch(() => {
                        throw new Error("Could not save pet token picks");
                    });
                    tokens.val = { ...tokens.val, picks };
                }
                const entries = companions.val
                    .filter(({ id }) => normal.has(id) || plus.has(id))
                    .map(({ id }) => `${id}:${plus.has(id) ? 1 : 0}`);
                const result = await updateSessionConfig({
                    // An empty list would mean every pet at Pets+ once the startup cheat runs again.
                    cheatConfig: { w1: { companion: { companions: entries.join(",") || "none" } } },
                });
                if (result.message !== "Configuration updated successfully") {
                    throw new Error(result.details || result.message || "Could not apply pet tiers in game");
                }
                await setCompanionCheat(entries.length > 0);
                cheatEnabled.val = entries.length > 0;
                normalIds.val = normal;
                plusIds.val = plus;
                await persistConfig(entries.length > 0);
            },
            {
                onError: (error) => {
                    writeError.val = error.message;
                },
            }
        );

    const isBusy = () => loading.val || writeStatus.val === "loading";

    // Each handler decides from `shown`, the token the player saw when pressing; writeSelection reads the game's
    // tokens again, which only carry the change out, so a press never removes a token picked in the game since.
    const withoutToken = (companionId) =>
        isToken(companionId) ? tokens.val.picks.filter((id) => id !== companionId) : tokens.val.picks;

    const handleToggle = async (companionId) => {
        if (isBusy()) return;
        const shown = isToken(companionId);
        await writeSelection(() => {
            const normal = new Set(normalIds.val);
            const plus = new Set(plusIds.val);
            // Token pets already show as Normal, so clicking one deselects it.
            if (shown) return { normal, plus, picks: withoutToken(companionId) };
            if (normal.has(companionId)) normal.delete(companionId);
            else normal.add(companionId);
            plus.delete(companionId);
            return { normal, plus };
        });
    };

    const handleTogglePlus = async (companionId) => {
        if (isBusy()) return;
        const shown = isToken(companionId);
        await writeSelection(() => {
            const plus = new Set(plusIds.val);
            if (plus.has(companionId)) plus.delete(companionId);
            else plus.add(companionId);
            const normal = new Set(normalIds.val);
            normal.delete(companionId);
            return { normal, plus, picks: shown ? withoutToken(companionId) : tokens.val.picks };
        });
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

    load();

    const renderSearchResults = () => {
        const companionMap = new Map(companions.val.map((companion) => [companion.id, companion]));
        const query = normalizeSearchText(searchQuery.val);
        const matchesFilters = (companion) => {
            if (!companion) return false;
            if (hideUnused.val && companion.isUnused) return false;
            if (!query) return true;
            return (
                normalizeSearchText(companion.name).includes(query) ||
                normalizeSearchText(companion.effect).includes(query)
            );
        };
        const visibleSections = sections.val
            .map((section) => ({
                ...section,
                companions: section.ids.map((id) => companionMap.get(id)).filter(matchesFilters),
            }))
            .filter((section) => section.companions.length > 0);

        if (!visibleSections.length) {
            return EmptyState({
                title: "NO MATCHING PETS",
                subtitle: query
                    ? "No pets matched your current search."
                    : "No pets remain after the current filters were applied.",
            });
        }

        return div(
            ...visibleSections.map((section) =>
                div(
                    { class: "companions-section" },
                    div({ class: "companions-section__title" }, section.label),
                    div(
                        { class: "companions-grid" },
                        ...section.companions.map((companion) =>
                            CompanionCard({
                                companion,
                                normalIds,
                                isPlus,
                                isToken,
                                ownedPet,
                                tokenBlock,
                                isBusy,
                                onToggle: handleToggle,
                                onTogglePlus: handleTogglePlus,
                                onToken: handleToken,
                            })
                        )
                    )
                )
            )
        );
    };

    const toolbar = [
        SearchBar({
            placeholder: "SEARCH PETS OR BUFFS",
            onInput: (value) => (searchQuery.val = value),
        }),
        withTooltip(
            label(
                { class: "toggle-switch account-toggle" },
                input({
                    type: "checkbox",
                    checked: () => hideUnused.val,
                    onchange: (e) => (hideUnused.val = e.target.checked),
                }),
                span({ class: "slider" }),
                span({ class: "label" }, "HIDE UNUSED")
            ),
            "Hide pets that are not part of the official in-game pet groups."
        ),
    ];
    const bulkButtons = [
        withTooltip(
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm",
                    disabled: () => isBusy(),
                    onclick: () =>
                        writeSelection(() => ({
                            normal: new Set(
                                companions.val
                                    .filter((pet) => !pet.isUnused && !isPlus(pet.id) && !isToken(pet.id))
                                    .map((pet) => pet.id)
                            ),
                            plus: new Set(plusIds.val),
                        })),
                },
                "Unlock all"
            ),
            "Select all available pets at their normal tier, keeping existing Pets+ choices. Token pets are left alone."
        ),
        withTooltip(
            button(
                {
                    type: "button",
                    class: "btn-quiet btn-sm",
                    disabled: () => isBusy(),
                    onclick: () =>
                        writeSelection(() => ({
                            normal: new Set(),
                            plus: new Set(
                                companions.val.filter((pet) => !pet.isUnused && !isToken(pet.id)).map((pet) => pet.id)
                            ),
                        })),
                },
                "Unlock all Pets+"
            ),
            "Select all available pets at Pets+, including pets with warnings about broken perks. Token pets stay Normal."
        ),
        withTooltip(
            button(
                {
                    type: "button",
                    class: "btn-danger btn-sm",
                    disabled: () => isBusy(),
                    onclick: (e) =>
                        clickAgain(e.currentTarget, "clear every injector pet selection and turn W1 Companion off.")
                            ? writeSelection(() => ({ normal: new Set(), plus: new Set() }))
                            : undefined,
                },
                "Clear all"
            ),
            "Clear every injector pet choice: no pets now or after a restart. Tokens are not touched."
        ),
        withTooltip(
            button(
                {
                    type: "button",
                    class: "btn-danger btn-sm",
                    onclick: (e) =>
                        clickAgain(e.currentTarget, "clear every Pets+ selection.")
                            ? writeSelection(() => ({ normal: new Set(normalIds.val), plus: new Set() }))
                            : undefined,
                    disabled: () => isBusy(),
                },
                "Clear Pets+"
            ),
            "Clear Pets+ selections, keeping normal selections."
        ),
    ];

    return PersistentAccountListPage({
        rootClass: "tab-container",
        title: "PETS",
        description: [
            "Click a card for Normal or + for Pets+. T spends a pet token on that pet. Click again to deselect.",
            span(
                { class: "pets-legend" },
                span(
                    { class: "pets-legend__key pets-legend__key--live" },
                    "NORMAL · PETS+ ",
                    span({ class: "pets-legend__dim" }, "only while the injector runs")
                ),
                span(
                    { class: "pets-legend__key pets-legend__key--token" },
                    "TOKEN ",
                    span({ class: "pets-legend__dim" }, "saved in your game")
                )
            ),
        ],
        actions: [
            withTooltip(
                button(
                    {
                        type: "button",
                        class: "btn-quiet btn-sm",
                        hidden: () => !tokens.val.missing.length,
                        disabled: () => isBusy(),
                        onclick: grantTokens,
                    },
                    "Grant missing token"
                ),
                "Adds the pet token sources this account is missing to your save."
            ),
            withTooltip(
                span(
                    { class: "pets-token-meter" },
                    "TOKENS",
                    span({ class: "pets-token-meter__count" }, () => `${tokens.val.picks.length}/${tokens.val.owned}`),
                    () =>
                        span(
                            { class: "pets-token-pips", "aria-hidden": "true" },
                            ...Array.from({ length: tokens.val.owned + tokens.val.missing.length }, (_, index) =>
                                span({
                                    class: [
                                        "pets-token-pip",
                                        index < tokens.val.picks.length && "pets-token-pip--used",
                                        index >= tokens.val.owned && "pets-token-pip--locked",
                                    ]
                                        .filter(Boolean)
                                        .join(" "),
                                })
                            )
                        )
                ),
                () =>
                    `${tokens.val.picks.length} of ${tokens.val.owned} owned pet tokens used. Token pets are saved in your game.`
            ),
            ...bulkButtons,
            RefreshButton({
                onRefresh: load,
                disabled: isBusy,
                tooltip: "Re-read live companion data from the running game.",
            }),
        ],
        topNotices: () =>
            div(
                WarningBanner(
                    "Since the latest game update, pets unlocked here are only available while the injector is running. " +
                        "Pets you own remain available."
                ),
                writeError.val ? WarningBanner(span({ role: "alert" }, writeError.val)) : null,
                !loading.val && !error.val && !cheatEnabled.val
                    ? WarningBanner("The W1 Companion cheat is off. Select a pet's normal or Pets+ bonus to enable it.")
                    : null
            ),
        toolbar,
        state: { loading, error },
        loadingText: "READING PETS",
        errorTitle: "PET READ FAILED",
        body: div(
            { class: "scrollable-panel companions-scroll", "aria-busy": () => writeStatus.val === "loading" },
            () => renderSearchResults()
        ),
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
