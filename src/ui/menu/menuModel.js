/**
 * Menu model: page declarations, the menu tree and search. Pure functions only, so Node tests can import it.
 *
 * Pages live in src/ui/pages/<world folder>/<system folder>/<page>.js and `export default definePage({...})`.
 * The server lists that folder (GET /api/pages); the menu imports every module and builds itself from them.
 */

import { OLD_NAMES, isPageCheat, pageRowOf } from "./pageCheats.js";
import { VALUE_COMMANDS, valueCommandOf, valueOf } from "./valueCommands.js";

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
        systems: [
            "Player",
            "Upgrade Vault",
            "Card Search",
            "Bundles",
            "Task Board",
            // IdleonToolbox's Clickers group: Orion, Poppy and Bubba as its tabs.
            "Clickers",
            "Event Shop",
            "Quests",
        ],
    },
    {
        id: 1,
        code: "W1",
        label: "World 1",
        name: "Blunder Hills",
        folder: "world-1",
        systems: ["Stamps", "Anvil", "Forge", "Statues", "Star Signs", "Pets", "Bribes"],
    },
    {
        id: 2,
        code: "W2",
        label: "World 2",
        name: "Yum-Yum Desert",
        folder: "world-2",
        systems: ["Alchemy", "Arcade Shop", "Post Office", "Killroy", "Islands", "Weekly Bosses"],
    },
    {
        id: 3,
        code: "W3",
        label: "World 3",
        name: "Frostbite Tundra",
        folder: "world-3",
        systems: [
            "Construction",
            "3D Printer",
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
        name: "Shimmerfin Deep",
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
    // Every automation page, for players who only want automation: they never cross a cheat page (#249). It sits apart
    // in the sidebar (`apart`), and like a world, picking it opens its list: Overview first, then the systems by world,
    // then the account ones.
    {
        id: "automation",
        code: "AUT",
        label: "Automation",
        name: "Does what you'd do by hand, with your own resources.",
        folder: "automation",
        apart: true,
        systems: [
            "Overview",
            "Alchemy",
            "Construction",
            "Cooking",
            "Gaming",
            "Sneaking",
            "Summoning",
            "Sushi Station",
            "Clickers",
            "Masterclasses",
            "Shops",
        ],
    },
];

/**
 * Page ids from before the automation pages moved into the Automation section (#249), so a remembered place and a
 * History entry still find their page.
 */
export const MOVED_PAGES = {
    "account.automation.overview": "automation.overview",
    "account.automation.shops": "automation.shops",
    "w2.bubbles.automation": "automation.alchemy",
    "w3.construction.automation": "automation.construction",
    "w4.cooking.automation": "automation.cooking",
    "w6.sneaking.automation": "automation.sneaking",
    "w6.summoning.automation": "automation.summoning",
    "account.clickers.automation": "automation.clickers",
    "classes.grimoire.automation": "automation.masterclasses",
    // The Grimoire's page became the Masterclasses page's first tab.
    "automation.grimoire": "automation.masterclasses",
};

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
    // Save copies (#32) become its second tab.
    {
        id: "history",
        code: "HIS",
        label: "History",
        tabs: [{ label: "Changes", view: "HISTORY", words: ["Undo", "Change log", "Undo all"] }],
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
 * @param {{id: string, label: string, keywords?: string[]}[]} [page.tabs] - the page's own tabs (Gaming's Garden,
 *   Imports, ...): search finds each by its name and words and opens the page on it
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
    if (
        page.tabs !== undefined &&
        !(
            Array.isArray(page.tabs) &&
            page.tabs.every(
                (tab) =>
                    typeof tab?.id === "string" &&
                    typeof tab.label === "string" &&
                    tab.label.trim() &&
                    (tab.keywords === undefined ||
                        (Array.isArray(tab.keywords) && tab.keywords.every((k) => typeof k === "string")))
            )
        )
    )
        throw new Error(`${where}: tabs must be a list of { id, label, keywords }`);
    return Object.freeze({ keywords: [], ...page });
};

/** A page's title: its tab name when its system has several pages, else the system name. */
// Page id -> what runs each time that page is shown again (see whenShown).
const shownListeners = new Map();

/**
 * Run `fn` each time the page `id` is shown again: after another page or view was shown, its pane is kept, so a page
 * that shows what something else can change (the automation overview) reads again here. Its first showing is its
 * mount. The menu calls pageShown.
 */
export const whenShown = (id, fn) => {
    if (!shownListeners.has(id)) shownListeners.set(id, new Set());
    shownListeners.get(id).add(fn);
};

/** The menu shows page `id` now. */
export const pageShown = (id) => shownListeners.get(id)?.forEach((fn) => fn());

// Page id -> what runs each time the menu leaves that page (see whenLeft).
const leftListeners = new Map();

/**
 * Run `fn` each time the menu leaves the page `id` for another page or view. Its pane is kept, hidden, so a page that
 * shows something outside its pane (an editor on the page's body) puts it away here. The menu calls pageLeft.
 */
export const whenLeft = (id, fn) => {
    if (!leftListeners.has(id)) leftListeners.set(id, new Set());
    leftListeners.get(id).add(fn);
};

/** The menu no longer shows page `id`. */
export const pageLeft = (id) => leftListeners.get(id)?.forEach((fn) => fn());

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
            // A page's own tabs: each found by its name and words, and opened on.
            for (const page of system.pages)
                for (const tab of page.tabs ?? [])
                    out.push({
                        label: tab.label,
                        where: `${world.label} › ${pageTitle(page, system)}`,
                        words: tab.keywords ?? [],
                        target: { world: world.id, page: page.id, tab: tab.id },
                    });
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

/** A cheat category as a place name: "w1" -> "W1", "godlike" -> "Godlike". */
const categoryName = (category) =>
    /^w\d$/.test(category) ? category.toUpperCase() : category.charAt(0).toUpperCase() + category.slice(1);

/**
 * Search entries for the Cheats page's list (GET /api/cheats: the game's autocomplete suggestions,
 * { value, message, category, needsParam?, dangerous? }) and every cheat setting (`descriptions` is
 * configDescriptions, "cheatConfig.<path>": text).
 *
 * - A Cheat is a command that runs as it is ("godlike reach", "w1 stampcost"): picking it shows its row.
 * - A Command needs or takes words the player types (needsParam), or is a suggestion for a command the list
 *   hides ("drop Timecandy1": no bare "drop" row): picking it fills the search box to run from there.
 *   An item-style one is labelled by its name ("drop · 24 Hr Time Candy"), the command on its second line.
 * - A Setting belongs to the longest command its path starts with, the one whose gear shows it; settings no
 *   command owns (unban, maxval, ...) live on the Settings page and stay out.
 */
export const cheatSearchEntries = (cheats, descriptions, tree = null) => {
    const values = new Set(cheats.map((cheat) => cheat.value));
    // A system's own cheat is found on its page, in its cheats panel (#23): the tab it shows on, else the first page.
    const pageOf = (value) => {
        const row = pageRowOf(value);
        const [worldId, systemName] = row?.key.split(":") ?? [];
        const world = tree?.find((w) => String(w.id) === worldId);
        const system = world?.systems.find((sys) => sys.name === systemName);
        if (!system) return null;
        const page = system.pages.find((p) => p.tab === row.tab) ?? system.pages[0];
        return { world, page, place: `${world.label} › ${pageTitle(page, system)}` };
    };
    // Equal matches list by command, in the game's order: "candy" gives every candy to drop, then to nomore.
    const groups = new Map();
    for (const cheat of cheats)
        if (!groups.has(cheat.value.split(" ")[0])) groups.set(cheat.value.split(" ")[0], groups.size);
    const out = cheats.map((cheat) => {
        const value = cheat.value;
        const base = value.split(" ")[0];
        const onPage = pageOf(value);
        const place = onPage?.place ?? `Cheats › ${categoryName(cheat.category || "general")}`;
        const message = cheat.message || "";
        // A suggestion for a command the list only has suggestions of ("drop Copper"); an on/off cheat is its own row,
        // its group's switch or not (#23 took those away).
        const hiddenBase = value.includes(" ") && !values.has(base) && !cheat.toggle;
        // A value of a command that takes one from a list ("spawn rift2", "Rift Slug"), or the command itself: its one
        // row (in the Cheats area or a page's panel), with the value put in its field (#23).
        const valueCommand = VALUE_COMMANDS[value] ? value : valueCommandOf(value);
        if (valueCommand) {
            const fill = value === valueCommand ? "" : valueOf(valueCommand, cheat).name;
            return {
                kind: "Cheat",
                group: groups.get(base),
                label: fill ? `${valueCommand} · ${fill}` : valueCommand,
                where: `Cheat · ${place}`,
                command: value,
                description: fill ? "" : message,
                target: onPage
                    ? { world: onPage.world.id, page: onPage.page.id, cheat: valueCommand, fill }
                    : { view: "CHEATS", cheat: valueCommand, fill },
            };
        }
        if (onPage && !cheat.needsParam && !hiddenBase) {
            return {
                kind: "Cheat",
                group: groups.get(base),
                label: value,
                where: `Cheat · ${place}`,
                command: value,
                description: message,
                words: Object.keys(OLD_NAMES).filter((old) => OLD_NAMES[old] === value),
                target: { world: onPage.world.id, page: onPage.page.id, cheat: value },
            };
        }
        // A cheat a page runs itself (an automation, a bundle) has no row anywhere: it runs from the command box.
        if (!cheat.needsParam && !hiddenBase && !(tree && isPageCheat(value))) {
            return {
                kind: "Cheat",
                group: groups.get(base),
                label: value,
                where: `Cheat · ${place}`,
                command: value,
                description: message,
                target: { view: "CHEATS", cheat: value },
            };
        }
        const named = hiddenBase && message !== "";
        return {
            kind: "Command",
            group: groups.get(base),
            named,
            label: named ? `${base} · ${message}` : value,
            where: named ? `Command · ${value}` : `Command · ${place}`,
            command: value,
            description: named ? "" : message,
            target: { command: value, message, needsParam: cheat.needsParam === true },
        };
    });
    for (const [key, description] of Object.entries(descriptions)) {
        if (!key.startsWith("cheatConfig.")) continue;
        const path = key.split(".").slice(1);
        let owner = "";
        for (let i = path.length; i > 0 && !owner; i--) {
            if (values.has(path.slice(0, i).join(" "))) owner = path.slice(0, i).join(" ");
        }
        if (!owner) continue;
        out.push({
            kind: "Setting",
            group: groups.get(path[0]),
            label: path[path.length - 1],
            where: `Setting · ${owner}`,
            command: "",
            description,
            target: { view: "CHEATS", cheat: owner, setting: key },
        });
    }
    return out;
};

/**
 * Whether running `text` from the command box needs a second Enter: the longest listed command it starts with
 * is dangerous ("wipe inv", "bulk MATERIAL 5"), or, for a command the list only has suggestions of
 * ("class foo"), every suggestion of it is.
 */
export const isDangerousCommand = (text, cheats) => {
    const words = text.trim().split(/\s+/);
    for (let i = words.length; i > 0; i--) {
        const row = cheats.find((cheat) => cheat.value === words.slice(0, i).join(" "));
        if (row) return row.dangerous === true;
    }
    const family = cheats.filter((cheat) => cheat.value.startsWith(`${words[0]} `));
    return family.length > 0 && family.every((cheat) => cheat.dangerous === true);
};

/**
 * What the command box says under a command: amounts the item commands take (see their defineCheat rows).
 * ponytail: the three item-style commands by name; read it from the cheat rows if more need a hint.
 */
export const commandHint = (command) => {
    const base = command.split(" ")[0];
    if (base === "drop" || base === "spawn") return "Amount optional";
    if (base === "multiplestacks") return "Needs a stack count";
    return "";
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
 * How well a cheat, setting or command matches, 0-100: by name or command (NAME_MATCH and up), then description,
 * then every word.
 */
const scoreCheat = (entry, q) => {
    const last = entry.command.split(" ").pop();
    const score = Math.max(scoreText(entry.label, q), scoreText(entry.command, q), scoreText(last, q));
    if (score) return { score, matched: null };
    // An old name it had ("w5 collider"), a little below its own.
    for (const word of entry.words ?? [])
        if (scoreText(word, q)) return { score: scoreText(word, q) - 2, matched: word };
    // Every typed word in the name, in any order: "damage multiply".
    const name = `${entry.label} ${entry.command}`.toLowerCase();
    if (q.includes(" ") && q.split(/\s+/).every((part) => name.includes(part))) return { score: 50, matched: null };
    const word = entry.description.split(/[^A-Za-z0-9']+/).find((w) => w.toLowerCase().startsWith(q));
    if (word) return { score: 20, matched: word };
    if (entry.description.toLowerCase().includes(q)) return { score: 10, matched: null };
    // Every word somewhere, like the terminal's autocomplete: "drop candy".
    const all = `${entry.label} ${entry.command} ${entry.description}`.toLowerCase();
    if (q.includes(" ") && q.split(/\s+/).every((part) => all.includes(part))) return { score: 15, matched: null };
    // ponytail: one plural fold, so "stamps" also finds the stamp cheats; a stemmer if more words need it.
    if (q.length > 3 && q.endsWith("s")) {
        const single = scoreCheat(entry, q.slice(0, -1));
        return { score: Math.max(0, single.score - 5), matched: single.matched };
    }
    return { score: 0, matched: null };
};

// Tiers: menu places; cheats and settings matched by name, then commands; then the same matched only by
// description, so a name with every typed word ("multiply damage") beats a description that has them. Best first.
const TIER = { Cheat: 100, Setting: 100, Command: 0 };
const NAME_MATCH = 45; // the lowest name score (50, less 5 for the plural fold); descriptions score 20 at most
const BY_NAME = 200;

/**
 * Search the menu. Matches labels, then extra words (returned as `matched` so the result can show the old name),
 * then descriptions. Every menu place ranks above every cheat, setting or command; a cheat or setting matched by
 * name ranks above a command, and a command matched by name above anything matched only by description.
 * Best first, at most MAX_RESULTS.
 */
export const searchMenu = (entries, query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const entry of entries) {
        if (entry.kind) {
            const { score, matched } = scoreCheat(entry, q);
            const byName = score >= NAME_MATCH ? BY_NAME : 0;
            if (score > 0) hits.push({ ...entry, matched, score: byName + TIER[entry.kind] + score });
            continue;
        }
        let score = scoreText(entry.label, q);
        let matched = null;
        for (const word of entry.words || []) {
            const wordScore = scoreText(word, q) - 2;
            if (wordScore > score) {
                score = wordScore;
                matched = word;
            }
        }
        // Every typed word in its name, place or words, in any order: "bubble automation", "automation cooking".
        if (!score && q.includes(" ")) {
            const all = [entry.label, entry.where, ...(entry.words || [])].join(" ").toLowerCase();
            if (q.split(/\s+/).every((part) => all.includes(part))) score = 30;
        }
        if (!score && entry.description && entry.description.toLowerCase().includes(q)) score = 25;
        if (score > 0) hits.push({ ...entry, matched, score: BY_NAME + 200 + score });
    }
    return hits.sort((a, b) => b.score - a.score || (a.group ?? 0) - (b.group ?? 0)).slice(0, MAX_RESULTS);
};
