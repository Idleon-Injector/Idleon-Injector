/**
 * Menu model: page declarations, the menu tree and search. Pure functions only, so Node tests can import it.
 *
 * Pages live in src/ui/pages/<world folder>/<system folder>/<page>.js and `export default definePage({...})`.
 * The server lists that folder (GET /api/pages); the menu imports every module and builds itself from them.
 */

/**
 * The worlds and their systems in game order, with IdleonToolbox names. A page's `system` must be one of these.
 * ponytail: a new game system is a core edit here; pages themselves only add files.
 */
export const WORLDS = [
    {
        id: "account",
        code: "ACC",
        label: "Account",
        name: "General",
        folder: "account",
        systems: ["Player", "Upgrade Vault", "Card Search", "Bundles", "Task Board", "Event Shop", "Quests"],
    },
    {
        id: 1,
        code: "W1",
        label: "World 1",
        name: "Blunder Hills",
        folder: "world-1",
        systems: ["Stamps", "Anvil", "Forge", "Statues", "Star Signs", "Pets", "Bribes", "Owl"],
    },
    {
        id: 2,
        code: "W2",
        label: "World 2",
        name: "Yum-Yum Desert",
        folder: "world-2",
        systems: [
            "Bubbles",
            "Cauldrons",
            "Vials",
            "Sigils",
            "Arcade Shop",
            "Post Office",
            "Killroy",
            "Islands",
            "Weekly Bosses",
            "Kangaroo",
        ],
    },
    {
        id: 3,
        code: "W3",
        label: "World 3",
        name: "Frostbite Tundra",
        folder: "world-3",
        systems: [
            "Construction",
            "Printer",
            "Refinery",
            "Salt Lick",
            "Atom Collider",
            "Hat Rack",
            "Armor Smithy",
            "Worship",
            "Prayers",
            "Death Note",
            "Library",
            "Equinox",
            "Traps",
        ],
    },
    {
        id: 4,
        code: "W4",
        label: "World 4",
        name: "Hyperion Nebula",
        folder: "world-4",
        systems: ["Cooking", "Breeding", "Laboratory", "Rift", "Tome", "Cape Vine"],
    },
    {
        id: 5,
        code: "W5",
        label: "World 5",
        name: "Smolderin' Plateau",
        folder: "world-5",
        systems: ["Sailing", "Divinity", "Gaming", "Hole", "Slab", "Greenstack"],
    },
    {
        id: 6,
        code: "W6",
        label: "World 6",
        name: "Spirited Valley",
        folder: "world-6",
        systems: ["Farming", "Sneaking", "Summoning", "Beanstalk", "Emperor"],
    },
    {
        id: 7,
        code: "W7",
        label: "World 7",
        name: "Equinox Valley",
        folder: "world-7",
        systems: [
            "Spelunking",
            "Research",
            "Menagerie",
            "Jelly Operator",
            "Gallery",
            "Legend Talents",
            "Coral Reef",
            "Zenith Market",
            "Clam Work",
            "Advice Fish",
            "Minehead",
            "Glimbo",
            "The Button",
            "Sushi Station",
            "Bubba",
        ],
    },
    {
        id: "classes",
        code: "CLS",
        label: "Classes",
        name: "Masterclasses",
        folder: "classes",
        systems: ["Grimoire", "Compass", "Tesseract", "Royal Armory"],
    },
];

/** The areas next to the worlds. `view` names a key of VIEWS; `words` are the names search also knows. */
export const AREAS = [
    { id: "cheats", code: "CHT", label: "Cheats", view: "CHEATS", words: ["Commands"] },
    { id: "settings", code: "SET", label: "Settings", view: "CONFIG", words: ["Config", "Startup cheats"] },
    {
        id: "advanced",
        code: "ADV",
        label: "Advanced",
        tabs: [
            { label: "Account Options", view: "ACCOUNT_OPTIONS", words: ["Raw save values", "OptionsListAccount"] },
            { label: "Value search", view: "SEARCH", words: ["Search", "GGA search", "Scanner"] },
            { label: "DevTools", view: "DEVTOOLS", words: ["ChromeDebug"] },
        ],
    },
];

export const slugify = (name) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

export const findWorld = (id) => WORLDS.find((world) => world.id === id) || null;

/** The CSS class that gives a world its accent colour (worlds 1-7 only). */
export const worldClass = (world) => (typeof world.id === "number" ? `w${world.id}-world-tab` : "");

const idPrefix = (world) => (typeof world.id === "number" ? `w${world.id}.` : `${world.id}.`);

/** The folder (under src/ui/pages/) a page must live in. */
export const pageFolder = (page) => `${findWorld(page.world).folder}/${slugify(page.system)}`;

/**
 * Declare a menu page. Throws on a declaration the menu can't place.
 * @param {object} page
 * @param {string} page.id - dotted feature id, e.g. "w7.button" ("w<N>." / "account." / "classes." prefix)
 * @param {number|string} page.world - 1-7, "account" or "classes"
 * @param {string} page.system - the IdleonToolbox system name, one of WORLDS[].systems
 * @param {string} [page.tab] - tab name, required when a system has several pages
 * @param {string} page.description - one plain sentence for players
 * @param {string[]} [page.keywords] - extra search words, including the injector's old names
 * @param {Function} page.component - VanJS component that renders the page
 */
export const definePage = (page) => {
    const where = `Page "${page && page.id}"`;
    const world = findWorld(page.world);
    if (!world) throw new Error(`${where}: unknown world "${page.world}"`);
    if (typeof page.id !== "string" || !page.id.startsWith(idPrefix(world)) || page.id === idPrefix(world))
        throw new Error(`${where}: id must start with "${idPrefix(world)}"`);
    if (!world.systems.includes(page.system))
        throw new Error(`${where}: "${page.system}" is not a ${world.label} system`);
    if (typeof page.description !== "string" || !page.description.trim())
        throw new Error(`${where}: description is required`);
    if (typeof page.component !== "function") throw new Error(`${where}: component must be a function`);
    if (page.tab !== undefined && (typeof page.tab !== "string" || !page.tab.trim()))
        throw new Error(`${where}: tab must be a non-empty string`);
    if (
        page.keywords !== undefined &&
        !(Array.isArray(page.keywords) && page.keywords.every((k) => typeof k === "string"))
    )
        throw new Error(`${where}: keywords must be a list of words`);
    return Object.freeze({ keywords: [], ...page });
};

/** A page's title: its tab name when its system has several pages, else the system name. */
export const pageTitle = (page, system) => (system.pages.length > 1 && page.tab ? page.tab : page.system);

/**
 * Turn page declarations into the menu: every world in order, each with only the systems that have pages,
 * in game order. Pages inside a system keep the order they were given (the server lists files sorted by path).
 */
export const buildMenuTree = (pages) => {
    const ids = new Set();
    for (const page of pages) {
        if (ids.has(page.id)) throw new Error(`Two pages use the id "${page.id}"`);
        ids.add(page.id);
    }
    return WORLDS.map((world) => ({
        ...world,
        systems: world.systems
            .map((name) => ({
                name,
                pages: pages.filter((page) => page.world === world.id && page.system === name),
            }))
            .filter((system) => system.pages.length > 0),
    }));
};

/** Everything search can reach, as flat entries. */
export const searchEntries = (tree) => {
    const out = [];
    for (const world of tree) {
        const target = { world: world.id, page: null };
        out.push({ label: world.label, where: world.name, words: [world.code, world.name], target });
        for (const system of world.systems) {
            const first = { world: world.id, page: system.pages[0].id };
            const systemWords = system.pages.length === 1 ? system.pages[0].keywords : [];
            const description = system.pages.length === 1 ? system.pages[0].description : "";
            out.push({ label: system.name, where: world.label, words: systemWords, description, target: first });
            if (system.pages.length < 2) continue;
            for (const page of system.pages) {
                out.push({
                    label: pageTitle(page, system),
                    where: `${world.label} › ${system.name}`,
                    words: page.keywords,
                    description: page.description,
                    target: { world: world.id, page: page.id },
                });
            }
        }
    }
    for (const area of AREAS) {
        for (const tab of area.tabs || [area]) {
            out.push({
                label: tab.label,
                where: area.tabs ? area.label : "",
                words: tab.words,
                target: { view: tab.view },
            });
        }
    }
    return out;
};

const MAX_RESULTS = 8;

const scoreText = (text, q) => {
    const t = text.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    if (t.split(/[^a-z0-9']+/).some((word) => word.startsWith(q))) return 65;
    if (t.includes(q)) return 55;
    return 0;
};

/**
 * Search the menu. Matches labels, then extra words (returned as `matched` so the result can show the old name),
 * then descriptions. Best first, at most MAX_RESULTS.
 */
export const searchMenu = (entries, query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const entry of entries) {
        let score = scoreText(entry.label, q);
        let matched = null;
        for (const word of entry.words || []) {
            const wordScore = scoreText(word, q) - 2;
            if (wordScore > score) {
                score = wordScore;
                matched = word;
            }
        }
        if (!score && entry.description && entry.description.toLowerCase().includes(q)) score = 25;
        if (score > 0) hits.push({ ...entry, matched, score });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
};
