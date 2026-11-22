/**
 * W4 - Breeding › Pets
 *
 * Data sources:
 *   cList.PetStats[w][p][0]   - the monster id of world w's pet p
 *   gga.Breeding[4 + w][p]    - its DNA level
 *   gga.Breeding[13 + w][p]   - its breedability
 *   gga.Breeding[22 + w][p]   - its shiny days
 *   gga.MonsterDefinitionsGET - the monster's name
 *
 * The game's worlds are tabs; one pet per line, its DNA level, then breedability and shiny days (the progress the game
 * counts toward the next multi and shiny level, so the quiet columns).
 */

import van from "../../../vendor/van-1.6.0.js";
import { definePage } from "../../../menu/menuModel.js";
import { gga, readCList, readGgaEntries } from "../../../services/api.js";
import { toIndexedArray } from "../../../utils/index.js";
import { ValueTableHead, ValueTableRow } from "../../../components/views/account/EditableFieldsRow.js";
import { useAccountLoad } from "../../../components/views/account/accountLoadPolicy.js";
import { RefreshButton } from "../../../components/views/account/components/AccountPageChrome.js";
import { PersistentAccountListPage } from "../../../components/views/account/components/PersistentAccountListPage.js";
import { TabbedList } from "../../../components/views/account/tabShared.js";
import { cleanName, createStaticRowReconciler, toInt, toNum } from "../../../components/views/account/accountShared.js";

const { div, span } = van.tags;

// The breeding screen's four worlds of pets.
const WORLDS = [1, 2, 3, 4];
const FIELDS = [
    { key: "dna", label: "DNA", base: 4 },
    { key: "breedability", label: "Breedability", base: 13, formatted: true, quiet: true },
    { key: "shiny", label: "Shiny days", base: 22, formatted: true, quiet: true },
];

const PetsTab = () => {
    const { loading, error, run } = useAccountLoad({ label: "Breeding pets" });
    const states = new Map();
    const stateOf = (key) => {
        if (!states.has(key)) states.set(key, Object.fromEntries(FIELDS.map((field) => [field.key, van.state(0)])));
        return states.get(key);
    };
    const listNodes = WORLDS.map(() => div());
    const reconcilers = listNodes.map((node) => createStaticRowReconciler(node));

    const PetRow = ({ world, index, name }) => {
        const at = (field) => `Breeding[${field.base + world}][${index}]`;
        return ValueTableRow({
            name,
            info: span({ class: "account-row__name" }, name),
            fields: FIELDS.map((field) => ({
                ...field,
                valueState: stateOf(`${world}:${index}`)[field.key],
                paths: [at(field)],
            })),
            read: async () => {
                const values = await Promise.all(FIELDS.map((field) => gga(at(field))));
                return Object.fromEntries(FIELDS.map((field, i) => [field.key, toNum(values[i], 0)]));
            },
        });
    };

    const load = async () =>
        run(async () => {
            const [rawBreeding, rawPetStats] = await Promise.all([gga("Breeding"), readCList("PetStats")]);
            const breeding = toIndexedArray(rawBreeding ?? []);
            const worlds = WORLDS.map((_, w) =>
                toIndexedArray(rawPetStats?.[w] ?? [])
                    .map((raw, index) => ({ index, id: String(toIndexedArray(raw ?? [])[0] ?? "").trim() }))
                    .filter((pet) => pet.id)
            );
            const ids = [...new Set(worlds.flat().map((pet) => pet.id))];
            const monsters = ids.length ? await readGgaEntries("MonsterDefinitionsGET.h", ids, ["Name"]) : {};
            const nameOf = (id) => cleanName(monsters[id]?.Name ?? monsters[id]?.h?.Name ?? id, id);

            worlds.forEach((pets, w) => {
                reconcilers[w](pets.map((pet) => `${pet.index}:${pet.id}`).join("|"), () =>
                    pets.map((pet) => PetRow({ world: w, index: pet.index, name: nameOf(pet.id) }))
                );
                for (const pet of pets) {
                    const state = stateOf(`${w}:${pet.index}`);
                    for (const field of FIELDS) {
                        const raw = toIndexedArray(breeding[field.base + w] ?? [])[pet.index];
                        state[field.key].val = field.formatted ? toNum(raw, 0) : toInt(raw, { min: 0 });
                    }
                }
            });
        });

    load();

    return PersistentAccountListPage({
        rootClass: "tab-container scroll-container breeding-pets-tab",
        title: "Pets",
        description: "Each breeding pet's DNA level, breedability and shiny days.",
        actions: RefreshButton({ onRefresh: load, disabled: () => loading.val }),
        state: { loading, error },
        loadingText: "Reading the pets",
        errorTitle: "Couldn't read the pets",
        initialWrapperClass: "account-list",
        body: div(
            { class: "account-list account-list--tabbed" },
            TabbedList({
                name: "Breeding pets",
                tabs: WORLDS.map((world, w) => ({
                    id: `w${world}`,
                    label: `World ${world}`,
                    content: [
                        ValueTableHead({ name: "Pet", columns: FIELDS.map((field) => field.label) }),
                        listNodes[w],
                    ],
                })),
            })
        ),
    });
};

export default definePage({
    id: "w4.breeding.pets",
    world: 4,
    system: "Breeding",
    tab: "Pets",
    description: "Each pet's DNA level, breedability and shiny days.",
    keywords: ["Shiny", "Breedability", "DNA"],
    component: PetsTab,
});
